-- d.ground migration 0016 — lower the dground-docs file size limit to 32 MB
--
-- Supersedes 0015 (200 MB). The 200 MB limit only took effect on the
-- Supabase Pro plan; staying on the Free plan, the per-file ceiling is
-- 50 MB. We cap at 32 MB so uploads stay comfortably inside that
-- ceiling and large PDFs are downsized locally before upload instead.
--
-- Run in Supabase SQL Editor after 0001–0015.

BEGIN;

UPDATE storage.buckets
   SET file_size_limit = 33554432,             -- 32 MB
       allowed_mime_types = ARRAY['application/pdf']
 WHERE id = 'dground-docs';

COMMIT;
