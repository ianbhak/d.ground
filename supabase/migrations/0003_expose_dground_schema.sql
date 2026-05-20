-- d.ground migration 0003 — expose the dground schema to the Data API
--
-- PostgREST only serves schemas listed in its `db-schemas` config.
-- The Supabase dashboard exposes this under Settings → API → Exposed
-- schemas, but the dashboard just writes the `authenticator` role's
-- `pgrst.db_schemas` setting under the hood. This migration sets it
-- directly so no dashboard navigation is needed.
--
-- Without this, every dground query fails with:
--   PGRST106 — "Invalid schema: dground"
--
-- Run this in Supabase SQL Editor after 0001 and 0002.

-- Preserve the existing defaults (public, graphql_public) and add dground.
ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, graphql_public, dground';

-- Reload config (picks up the new db_schemas) AND the schema cache
-- (so PostgREST discovers the dground tables). Both are needed —
-- reloading config alone leaves the table cache stale → PGRST205.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
