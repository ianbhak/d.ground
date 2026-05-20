-- d.ground migration 0009 — sender names + Realtime for shared threads
--
-- - Denormalize the sender's display name onto each message so the
--   shared thread can show who said what without a profiles join
--   (works for d.ground-only users who have no d.connect profile).
-- - Publish dground.messages so the shared thread updates live.
--
-- Run in Supabase SQL Editor after 0001–0008.

BEGIN;

ALTER TABLE dground.messages
  ADD COLUMN IF NOT EXISTS sender_name text;

COMMIT;

-- Add dground.messages to the Realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'dground'
       AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dground.messages;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
