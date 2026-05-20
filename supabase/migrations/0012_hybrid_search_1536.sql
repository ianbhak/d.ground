-- d.ground migration 0012 — 1536-dim embeddings + hybrid retrieval
--
-- Two upgrades together (both touch match_chunks and require a
-- re-index, so they ship as one migration):
--
--   1. Embedding dimension 768 → 1536 — higher fidelity, still within
--      pgvector's HNSW 2000-dim index limit.
--   2. Hybrid retrieval — match_chunks now fuses dense vector search
--      with sparse full-text search (Reciprocal Rank Fusion), so exact
--      terms / names / identifiers that pure vector search blurs are
--      still found.
--
-- The embedding dimension change makes existing vectors invalid, so
-- this migration clears documents/chunks — RE-UPLOAD the PDFs after
-- running it so they are re-indexed at 1536 dims.
--
-- Run in Supabase SQL Editor after 0001–0011.

BEGIN;

-- Clean slate — existing 768-dim embeddings can't be reused.
DELETE FROM dground.room_documents;
DELETE FROM dground.shared_documents; -- chunks cascade

-- ── Embedding dimension 768 → 1536 ───────────────────────────────
DROP INDEX IF EXISTS dground.chunks_embedding_idx;
ALTER TABLE dground.chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE dground.chunks ADD COLUMN embedding vector(1536);
CREATE INDEX chunks_embedding_idx
  ON dground.chunks USING hnsw (embedding vector_cosine_ops);

-- ── Full-text search column for the sparse half of hybrid search ──
ALTER TABLE dground.chunks DROP COLUMN IF EXISTS content_tsv;
ALTER TABLE dground.chunks ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX chunks_content_tsv_idx
  ON dground.chunks USING gin (content_tsv);

ALTER TABLE dground.shared_documents
  ALTER COLUMN embedding_dim SET DEFAULT 1536;

-- ── Hybrid match_chunks ──────────────────────────────────────────
DROP FUNCTION IF EXISTS dground.match_chunks(vector, uuid, int);

CREATE OR REPLACE FUNCTION dground.match_chunks(
  query_embedding vector(1536),
  query_text text,
  p_room_id uuid,
  match_count int DEFAULT 6
)
RETURNS TABLE (
  chunk_id uuid,
  content text,
  page int,
  filename text,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH room_chunks AS (
    SELECT
      c.id,
      c.content,
      c.page,
      c.embedding,
      c.content_tsv,
      COALESCE(rd.display_filename, sd.original_filename) AS filename
    FROM dground.chunks c
    JOIN dground.room_documents rd ON rd.shared_doc_id = c.shared_doc_id
    JOIN dground.shared_documents sd ON sd.id = c.shared_doc_id
    WHERE rd.room_id = p_room_id
      AND c.embedding IS NOT NULL
  ),
  dense AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY embedding OPERATOR(extensions.<=>) query_embedding
      ) AS rank
    FROM room_chunks
    ORDER BY embedding OPERATOR(extensions.<=>) query_embedding
    LIMIT 20
  ),
  sparse AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(
          content_tsv, websearch_to_tsquery('simple', query_text)
        ) DESC
      ) AS rank
    FROM room_chunks
    WHERE content_tsv @@ websearch_to_tsquery('simple', query_text)
    ORDER BY ts_rank(
      content_tsv, websearch_to_tsquery('simple', query_text)
    ) DESC
    LIMIT 20
  ),
  -- Reciprocal Rank Fusion (k = 60).
  fused AS (
    SELECT
      COALESCE(d.id, s.id) AS id,
      COALESCE(1.0 / (60 + d.rank), 0)
        + COALESCE(1.0 / (60 + s.rank), 0) AS score
    FROM dense d
    FULL OUTER JOIN sparse s ON d.id = s.id
  )
  SELECT
    rc.id,
    rc.content,
    rc.page,
    rc.filename,
    f.score::real
  FROM fused f
  JOIN room_chunks rc ON rc.id = f.id
  ORDER BY f.score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION dground.match_chunks(vector, text, uuid, int)
  TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
