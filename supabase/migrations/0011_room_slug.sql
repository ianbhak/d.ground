-- d.ground migration 0011 — readable room URLs (slug)
--
-- Adds rooms.slug — a stable, human-readable URL identifier derived
-- from the room name at creation (e.g. "논문-논의-방-a3f9c1"). The slug
-- never changes, even if the room is renamed.
--
-- Nullable: rooms created before this migration keep working at their
-- UUID URL (the room page accepts either a UUID or a slug). UNIQUE
-- still permits multiple NULLs in Postgres.
--
-- Run in Supabase SQL Editor after 0001–0010.

ALTER TABLE dground.rooms ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE dground.rooms DROP CONSTRAINT IF EXISTS rooms_slug_unique;
ALTER TABLE dground.rooms ADD CONSTRAINT rooms_slug_unique UNIQUE (slug);

NOTIFY pgrst, 'reload schema';
