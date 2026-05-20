-- d.ground migration 0010 — fix the shared_documents SELECT policy
--
-- BUG: 0001's shared_documents_select policy compared
--   `rd.shared_doc_id = id`
-- where the unqualified `id` resolved to room_documents.id (the
-- subquery's table) instead of shared_documents.id. The subquery
-- therefore never matched, so the `authenticated` role could never
-- SELECT shared_documents. Symptoms:
--   - room document list showed "0 B / 색인 중" (the embedded
--     shared_documents join returned null)
--   - RAG chat found nothing (match_chunks joins shared_documents
--     under RLS and got zero rows)
--
-- FIX: qualify the column as shared_documents.id.
--
-- Run in Supabase SQL Editor after 0001–0009.

DROP POLICY IF EXISTS shared_documents_select ON dground.shared_documents;

CREATE POLICY shared_documents_select ON dground.shared_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM dground.room_documents rd
       WHERE rd.shared_doc_id = shared_documents.id
         AND dground.is_member(rd.room_id)
    )
  );
