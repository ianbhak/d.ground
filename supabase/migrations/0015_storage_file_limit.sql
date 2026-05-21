-- d.ground migration 0015 — raise the dground-docs file size limit
--
-- Large PDFs are uploaded straight to Storage (see the documents
-- upload-url route). This sets the dground-docs bucket's per-file
-- limit to 200 MB.
--
-- IMPORTANT: a bucket limit cannot exceed the project-wide Storage
-- upload limit. On the Supabase Free plan that ceiling is 50 MB and
-- cannot be raised — uploading files larger than 50 MB requires the
-- Pro plan, after which the global limit must also be raised in
-- Dashboard → Storage → Settings.
--
-- Run in Supabase SQL Editor after 0001–0014.

BEGIN;

UPDATE storage.buckets
   SET file_size_limit = 209715200,            -- 200 MB
       allowed_mime_types = ARRAY['application/pdf']
 WHERE id = 'dground-docs';

COMMIT;
