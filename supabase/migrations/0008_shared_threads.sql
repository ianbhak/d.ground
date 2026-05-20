-- d.ground migration 0008 — one shared thread per room
--
-- Each room gets a single shared thread (visibility='shared') that all
-- members read and post to. New rooms create it at creation time; this
-- migration backfills the shared thread for any existing room.
--
-- Run in Supabase SQL Editor after 0001–0007.

INSERT INTO dground.threads (room_id, visibility, user_id, title)
SELECT r.id, 'shared', NULL, '공용 스레드'
  FROM dground.rooms r
 WHERE r.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM dground.threads t
      WHERE t.room_id = r.id
        AND t.visibility = 'shared'
   );
