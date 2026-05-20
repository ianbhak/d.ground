-- d.ground migration 0007 — vector similarity search for RAG
--
-- match_chunks() returns the chunks of a room nearest to a query
-- embedding. SECURITY INVOKER: it runs as the calling user, so the
-- RLS policies on chunks / room_documents already guarantee the user
-- only ever sees rooms they belong to. The p_room_id filter narrows
-- to the one room being queried.
--
-- Run in Supabase SQL Editor after 0001–0006.

CREATE OR REPLACE FUNCTION dground.match_chunks(
  query_embedding vector(768),
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
  SELECT
    c.id,
    c.content,
    c.page,
    COALESCE(rd.display_filename, sd.original_filename),
    (1 - (c.embedding <=> query_embedding))::real
  FROM dground.chunks c
  JOIN dground.room_documents rd ON rd.shared_doc_id = c.shared_doc_id
  JOIN dground.shared_documents sd ON sd.id = c.shared_doc_id
  WHERE rd.room_id = p_room_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION dground.match_chunks(vector, uuid, int)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
