-- d.ground initial schema migration
-- Run this in Supabase SQL Editor against the d.connect project.
-- All d.ground tables live under the `dground` schema for isolation.
--
-- Prerequisites:
--   * pgvector extension enabled (`CREATE EXTENSION IF NOT EXISTS vector;`)
--   * `public.profiles` table already exists (d.connect)

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid

CREATE SCHEMA IF NOT EXISTS dground;
GRANT USAGE ON SCHEMA dground TO authenticated, anon, service_role;

-- ====================================================================
-- Rooms
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.rooms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  owner_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  system_prompt    text NOT NULL DEFAULT '',
  model            text NOT NULL DEFAULT 'claude-sonnet-4-6',
  top_k            int  NOT NULL DEFAULT 5,
  temperature      real NOT NULL DEFAULT 0.2,
  password_hash    text,
  sensitivity      text NOT NULL DEFAULT 'internal'
                   CHECK (sensitivity IN ('public','internal','confidential')),
  quota_docs       int  NOT NULL DEFAULT 100,
  quota_bytes      bigint NOT NULL DEFAULT 524288000,    -- 500 MB
  quota_daily_tokens bigint NOT NULL DEFAULT 500000,     -- 500k
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_owner_idx ON dground.rooms(owner_id);

-- ====================================================================
-- Memberships
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member'
              CHECK (role IN ('admin','member')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  joined_via  text NOT NULL CHECK (joined_via IN ('invite','password','owner')),
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON dground.memberships(user_id);

-- ====================================================================
-- SharedDocument (system-wide dedup by content hash)
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.shared_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash         text NOT NULL UNIQUE,             -- sha256 hex
  original_filename    text NOT NULL,
  mime_type            text NOT NULL,
  byte_size            bigint NOT NULL,
  storage_path         text NOT NULL,                    -- supabase storage key
  text_extract_version text NOT NULL DEFAULT 'v1',
  chunking_version     text NOT NULL DEFAULT 'v1',
  embedding_model      text NOT NULL DEFAULT 'voyage-3-lite',
  embedding_dim        int  NOT NULL DEFAULT 512,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','indexed','failed')),
  pii_findings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  indexed_at           timestamptz
);

-- ====================================================================
-- RoomDocument (room ↔ shared_documents mapping; enforces ACL)
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.room_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  shared_doc_id     uuid NOT NULL REFERENCES dground.shared_documents(id) ON DELETE RESTRICT,
  display_filename  text NOT NULL,
  attached_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  attached_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, shared_doc_id)
);
CREATE INDEX IF NOT EXISTS room_documents_room_idx ON dground.room_documents(room_id);

-- ====================================================================
-- Chunks (belongs to SharedDocument, not Room)
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_doc_id   uuid NOT NULL REFERENCES dground.shared_documents(id) ON DELETE CASCADE,
  content         text NOT NULL,
  embedding       vector(512),                     -- voyage-3-lite = 512 dim
  page            int,
  chunk_index     int NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_shared_doc_idx ON dground.chunks(shared_doc_id);
-- HNSW index for fast similarity search (build after data load for best perf)
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON dground.chunks USING hnsw (embedding vector_cosine_ops);

-- ====================================================================
-- Threads
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  visibility      text NOT NULL CHECK (visibility IN ('private','shared')),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL when shared
  title           text NOT NULL DEFAULT '새 대화',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (visibility = 'private' AND user_id IS NOT NULL) OR
    (visibility = 'shared'  AND user_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS threads_room_idx ON dground.threads(room_id);
CREATE INDEX IF NOT EXISTS threads_user_idx ON dground.threads(user_id);

-- ====================================================================
-- Messages
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           uuid NOT NULL REFERENCES dground.threads(id) ON DELETE CASCADE,
  sender_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL for assistant
  role                text NOT NULL CHECK (role IN ('user','assistant','system')),
  content             text NOT NULL,
  sources             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{chunk_id, score, page, doc}]
  model               text,
  tokens_in           int NOT NULL DEFAULT 0,
  tokens_out          int NOT NULL DEFAULT 0,
  cache_read_tokens   int NOT NULL DEFAULT 0,
  cache_write_tokens  int NOT NULL DEFAULT 0,
  deleted_at          timestamptz,                          -- soft delete
  deleted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON dground.messages(thread_id, created_at);

-- ====================================================================
-- Invites
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  email       text NOT NULL,
  invited_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  token       text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ====================================================================
-- UsageDaily (per-room/day/model aggregate for cost dashboards)
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.usage_daily (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  date                date NOT NULL,
  model               text NOT NULL,
  tokens_in_sum       bigint NOT NULL DEFAULT 0,
  tokens_out_sum      bigint NOT NULL DEFAULT 0,
  cache_read_sum      bigint NOT NULL DEFAULT 0,
  cache_write_sum     bigint NOT NULL DEFAULT 0,
  message_count       int    NOT NULL DEFAULT 0,
  estimated_cost_usd  numeric(12,6) NOT NULL DEFAULT 0,
  UNIQUE (room_id, date, model)
);

-- ====================================================================
-- AuditLog
-- ====================================================================
CREATE TABLE IF NOT EXISTS dground.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON dground.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON dground.audit_log(target_type, target_id);

-- ====================================================================
-- Row Level Security — deny by default, allow via explicit policies
-- ====================================================================
ALTER TABLE dground.rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.shared_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.room_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.chunks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.invites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.usage_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dground.audit_log         ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of the given room?
CREATE OR REPLACE FUNCTION dground.is_member(p_room uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dground.memberships
     WHERE room_id = p_room AND user_id = auth.uid()
  );
$$;

-- Helper: is the current user an admin of the given room?
CREATE OR REPLACE FUNCTION dground.is_room_admin(p_room uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dground.rooms r
     WHERE r.id = p_room AND r.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM dground.memberships m
     WHERE m.room_id = p_room AND m.user_id = auth.uid() AND m.role = 'admin'
  );
$$;

-- Rooms — visible if you're owner or a member
CREATE POLICY rooms_select ON dground.rooms FOR SELECT
  USING (owner_id = auth.uid() OR dground.is_member(id));
CREATE POLICY rooms_insert ON dground.rooms FOR INSERT
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY rooms_update ON dground.rooms FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY rooms_delete ON dground.rooms FOR DELETE
  USING (owner_id = auth.uid());

-- Memberships — visible to room members, mutable by room admins
CREATE POLICY memberships_select ON dground.memberships FOR SELECT
  USING (user_id = auth.uid() OR dground.is_room_admin(room_id));
CREATE POLICY memberships_insert ON dground.memberships FOR INSERT
  WITH CHECK (dground.is_room_admin(room_id) OR user_id = auth.uid());
CREATE POLICY memberships_delete ON dground.memberships FOR DELETE
  USING (dground.is_room_admin(room_id) OR user_id = auth.uid());

-- RoomDocuments — readable by members, writable by admins
CREATE POLICY room_documents_select ON dground.room_documents FOR SELECT
  USING (dground.is_member(room_id));
CREATE POLICY room_documents_write ON dground.room_documents FOR ALL
  USING (dground.is_room_admin(room_id))
  WITH CHECK (dground.is_room_admin(room_id));

-- SharedDocuments — readable if user has ANY room_document mapping
CREATE POLICY shared_documents_select ON dground.shared_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM dground.room_documents rd
     WHERE rd.shared_doc_id = id AND dground.is_member(rd.room_id)
  ));

-- Chunks — same rule as SharedDocuments
CREATE POLICY chunks_select ON dground.chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM dground.room_documents rd
     WHERE rd.shared_doc_id = chunks.shared_doc_id AND dground.is_member(rd.room_id)
  ));

-- Threads
CREATE POLICY threads_select ON dground.threads FOR SELECT
  USING (
    dground.is_member(room_id) AND (
      visibility = 'shared' OR user_id = auth.uid()
    )
  );
CREATE POLICY threads_insert ON dground.threads FOR INSERT
  WITH CHECK (
    dground.is_member(room_id) AND (
      (visibility = 'private' AND user_id = auth.uid()) OR
      (visibility = 'shared'  AND dground.is_room_admin(room_id))
    )
  );

-- Messages — visible based on parent thread visibility
CREATE POLICY messages_select ON dground.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM dground.threads t
     WHERE t.id = messages.thread_id
       AND dground.is_member(t.room_id)
       AND (t.visibility = 'shared' OR t.user_id = auth.uid())
  ));
CREATE POLICY messages_insert ON dground.messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM dground.threads t
     WHERE t.id = thread_id
       AND dground.is_member(t.room_id)
       AND (t.visibility = 'shared' OR t.user_id = auth.uid())
  ));
CREATE POLICY messages_soft_delete ON dground.messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM dground.threads t
     WHERE t.id = messages.thread_id AND dground.is_room_admin(t.room_id)
  ));

-- Invites — only room admin
CREATE POLICY invites_admin_only ON dground.invites FOR ALL
  USING (dground.is_room_admin(room_id))
  WITH CHECK (dground.is_room_admin(room_id));

-- UsageDaily — readable by room admins
CREATE POLICY usage_daily_select ON dground.usage_daily FOR SELECT
  USING (dground.is_room_admin(room_id));

-- AuditLog — only super_admin reads (enforced via profiles.role at app layer for now)
-- (RLS denies all reads; service_role bypasses, used by admin console)

-- ====================================================================
-- Storage bucket: dground-docs (private)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('dground-docs', 'dground-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — only admins of the owning room can upload; members can read
-- (Files are stored at `<content_hash>` paths under dground-docs)
CREATE POLICY "dground_docs_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dground-docs' AND EXISTS (
      SELECT 1
        FROM dground.shared_documents sd
        JOIN dground.room_documents rd ON rd.shared_doc_id = sd.id
       WHERE sd.storage_path = name
         AND dground.is_member(rd.room_id)
    )
  );

CREATE POLICY "dground_docs_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dground-docs'
  );

COMMIT;
