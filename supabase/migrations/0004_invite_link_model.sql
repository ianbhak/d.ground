-- d.ground migration 0004 — single invite-link access model
--
-- Replaces the password / invite-code access controls with one
-- per-room invite token. Sharing the link IS the access mechanism;
-- the room owner can regenerate the token to revoke an old link.
--
-- Run in Supabase SQL Editor after 0001–0003.

BEGIN;

-- Per-room invite token — 128-bit, URL-safe hex.
ALTER TABLE dground.rooms
  ADD COLUMN IF NOT EXISTS join_token text NOT NULL
    DEFAULT encode(gen_random_bytes(16), 'hex');

ALTER TABLE dground.rooms DROP CONSTRAINT IF EXISTS rooms_join_token_unique;
ALTER TABLE dground.rooms
  ADD CONSTRAINT rooms_join_token_unique UNIQUE (join_token);

-- Password-based access is removed in favour of the invite link.
ALTER TABLE dground.rooms DROP COLUMN IF EXISTS password_hash;

-- Join-by-link: resolves the room by token and adds the caller as a
-- member. SECURITY DEFINER so a not-yet-member can resolve the room
-- (the rooms RLS policy would otherwise hide it). The token itself is
-- the secret; only the calling user (auth.uid()) is ever added.
CREATE OR REPLACE FUNCTION dground.join_room_by_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO r_id
    FROM dground.rooms
   WHERE join_token = p_token AND deleted_at IS NULL;

  IF r_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO dground.memberships (room_id, user_id, role, joined_via)
  VALUES (r_id, auth.uid(), 'member', 'invite')
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN r_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dground.join_room_by_token(text) TO authenticated;

COMMIT;

-- Let PostgREST pick up the new column and function.
NOTIFY pgrst, 'reload schema';
