-- ---------------------------------------------------------------------
-- Expose the API schemas to PostgREST on the hosted project
--
-- Every Edge Function reads through the Supabase client with an explicit
-- `.schema('identity' | 'content' | 'releases' | 'docs')`. PostgREST only
-- serves schemas listed in its `db-schemas` setting, and that setting comes
-- from two different places:
--
--   * local (`supabase start`):  [api] schemas in supabase/config.toml
--   * hosted project:            Dashboard -> Settings -> API -> Exposed
--                                schemas, stored as the authenticator role's
--                                `pgrst.db_schemas`
--
-- `supabase db push` applies neither, and config.toml's [api] block is never
-- sent to the hosted project by a deploy. A hosted project therefore only
-- exposes `public` and `graphql_public` until someone changes it by hand, and
-- every request for another schema is refused by PostgREST (PGRST106
-- "Invalid schema: content", HTTP 406). The handlers deliberately turn any
-- PostgREST failure into the generic `500 query_error`, so the symptom is
-- every list/profile call failing at once with "Something went wrong
-- processing the request" while local development works.
--
-- This migration makes the hosted setting part of the migration history so it
-- can no longer be forgotten. Keep the list in sync with [api] schemas in
-- supabase/config.toml (scripts/ops/static-checks.mjs check 11 enforces it).
-- `private` is intentionally NOT listed: it holds RLS helper functions that
-- must never be reachable over HTTP.
-- ---------------------------------------------------------------------

alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, releases, identity, content, docs';

-- Ask the running PostgREST to pick up the new configuration and schema
-- cache now, instead of at its next restart.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
