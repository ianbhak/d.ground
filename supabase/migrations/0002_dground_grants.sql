-- d.ground migration 0002 — role grants for the dground schema
--
-- Why this is needed:
--   A freshly created schema does NOT inherit Supabase's default
--   privileges (those are configured only for the `public` schema).
--   PostgREST checks table-level GRANTs *before* RLS — without these
--   grants, `authenticated` users get "permission denied" even though
--   RLS policies exist.
--
-- This is separate from exposing the schema to the Data API — that is
-- handled by migration 0003_expose_dground_schema.sql.
--
-- Run this in Supabase SQL Editor after 0001, before/with 0003.

BEGIN;

GRANT USAGE ON SCHEMA dground TO authenticated, anon, service_role;

-- Existing tables/sequences/functions
GRANT ALL ON ALL TABLES    IN SCHEMA dground TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dground TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dground TO authenticated, anon, service_role;

-- Future objects created in dground inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA dground
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dground
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dground
  GRANT EXECUTE ON FUNCTIONS TO authenticated, anon, service_role;

COMMIT;

-- Row-level access is still fully governed by the RLS policies from
-- 0001 — these grants only allow the role to *reach* the tables.
