-- d.ground migration 0013 — cited-page thumbnails
--
-- Each PDF page is rendered to a small PNG at upload time and stored
-- in a private `dground-figures` bucket at `<content_hash>/p<N>.png`.
-- Answers can then show a thumbnail of every cited page.
--
-- match_chunks gains a `content_hash` column so the chat route can
-- build the thumbnail path for each retrieved chunk.
--
-- Run in Supabase SQL Editor after 0001–0012.

BEGIN;

-- Private bucket for page thumbnails. Access is gated by the
-- /api/figures route (auth check + service-role download), so the
-- bucket itself needs no authenticated policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dground-figures', 'dground-figures', false)
ON CONFLICT (id) DO NOTHING;

-- ── match_chunks — add content_hash to the result ────────────────
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
      sd.content_hash
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
