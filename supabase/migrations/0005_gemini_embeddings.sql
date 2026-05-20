-- d.ground migration 0005 — switch embeddings to Gemini (768-dim)
--
-- The d.connect family already runs on Gemini API keys, so d.ground
-- uses gemini-embedding-001 (truncated to 768 dims) instead of Voyage —
-- no new vendor, free tier, strong Korean quality.
--
-- Safe to run as-is: no documents indexed yet, so the embedding column
-- is empty. Run in Supabase SQL Editor after 0001–0004.

BEGIN;

-- Vector dimension changes 512 → 768. Drop + re-add (column is empty).
DROP INDEX IF EXISTS dground.chunks_embedding_idx;
ALTER TABLE dground.chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE dground.chunks ADD COLUMN embedding vector(768);

CREATE INDEX chunks_embedding_idx
  ON dground.chunks USING hnsw (embedding vector_cosine_ops);

-- Update the SharedDocument metadata defaults.
ALTER TABLE dground.shared_documents
  ALTER COLUMN embedding_model SET DEFAULT 'gemini-embedding-001';
ALTER TABLE dground.shared_documents
  ALTER COLUMN embedding_dim SET DEFAULT 768;

COMMIT;

NOTIFY pgrst, 'reload schema';
