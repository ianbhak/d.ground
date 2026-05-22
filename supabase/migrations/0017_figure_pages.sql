-- d.ground migration 0017 — record which pages carry a table or figure
--
-- Page thumbnails are only worth showing for pages that actually
-- contain a table, chart, or figure — a thumbnail of a plain-text page
-- tells the reader nothing. Indexing now detects those pages and
-- records their 1-based numbers in shared_documents.figure_pages, and
-- match_chunks returns the array so the chat route can decide whether
-- a cited page deserves a thumbnail.
--
-- Run in Supabase SQL Editor after 0001–0016.

BEGIN;

ALTER TABLE dground.shared_documents
  ADD COLUMN IF NOT EXISTS figure_pages int[] NOT NULL DEFAULT '{}';

-- ── match_chunks — add figure_pages to the result ────────────────
DROP FUNCTION IF EXISTS dground.match_chunks(vector, text, uuid, int);

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
  content_hash text,
  figure_pages int[],
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
      COALESCE(rd.display_filename, sd.original_filename) AS filename,
      sd.content_hash,
      sd.figure_pages
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
    rc.content_hash,
    rc.figure_pages,
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
