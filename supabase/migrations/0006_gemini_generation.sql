-- d.ground migration 0006 — switch generation LLM to Gemini
--
-- The whole d.connect family runs on Gemini. Using Gemini for
-- generation too (in addition to embeddings) means one vendor, one
-- API key, no ANTHROPIC_API_KEY — and ~8x lower cost than Claude
-- Sonnet at comparable Korean/RAG quality.
--
-- Run in Supabase SQL Editor after 0001–0005.

BEGIN;

-- New rooms default to Gemini 2.5 Flash.
ALTER TABLE dground.rooms ALTER COLUMN model SET DEFAULT 'gemini-2.5-flash';

-- Migrate any existing rooms still pointing at a Claude model.
UPDATE dground.rooms
   SET model = 'gemini-2.5-flash'
 WHERE model LIKE 'claude-%';

COMMIT;
