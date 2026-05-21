-- d.ground migration 0014 — room entry restrictions
--
-- Lets a room owner block a removed member from rejoining. When a
-- member is kicked the owner may also add them to the room's
-- restriction list; join_room_by_token then refuses that user even
-- if they still hold a valid invite link.
--
-- Run in Supabase SQL Editor after 0001–0013.

BEGIN;

CREATE TABLE IF NOT EXISTS dground.room_restrictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES dground.rooms(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restricted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_restrictions_room_idx
  ON dground.room_restrictions(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON dground.room_restrictions
  TO authenticated, service_role;

ALTER TABLE dground.room_restrictions ENABLE ROW LEVEL SECURITY;

-- Only the room admin may see or manage a room's restriction list.
CREATE POLICY restrictions_admin_only ON dground.room_restrictions FOR ALL
  USING (dground.is_room_admin(room_id))
  WITH CHECK (dground.is_room_admin(room_id));

-- join_room_by_token — now refuses restricted users.
CREATE OR REPLACE FUNCTION dground.join_room_by_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO r_id
    FROM dground.rooms
   WHERE join_token = p_token AND deleted_at IS NULL;

  IF r_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Entry restriction — a restricted user cannot (re)join.
  IF EXISTS (
    SELECT 1 FROM dground.room_restrictions
     WHERE room_id = r_id AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO dground.memberships (room_id, user_id, role, joined_via)
  VALUES (r_id, auth.uid(), 'member', 'invite')
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN r_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dground.join_room_by_token(text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
