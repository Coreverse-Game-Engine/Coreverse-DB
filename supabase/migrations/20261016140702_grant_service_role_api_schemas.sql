-- ---------------------------------------------------------------------
-- service_role access to the API schemas
--
-- Every domain migration grants USAGE on its schema and the table/function
-- privileges to `anon` / `authenticated` only. `service_role` was never
-- granted anything on `identity`, `content`, `docs` or `releases`.
--
-- `service_role` has BYPASSRLS, which is often mistaken for "can read
-- everything". It is not: BYPASSRLS only skips row-level security policies.
-- Schema USAGE and table/function privileges are still checked, and Supabase
-- only pre-grants them to service_role for the `public` schema. For any
-- custom schema they must be granted by hand (Supabase docs: "Using custom
-- schemas"). Without them every call a service-role client makes into these
-- schemas fails with Postgres 42501 "permission denied for schema ...".
--
-- Edge Function routes that use the service-role client and were therefore
-- broken on a real project:
--   * identity.hit_rate_limit() -- the rate limiter behind POST /discussions,
--     POST /discussions/{id}/replies, polls, news, GET
--     /profiles/username-availability and POST /auth/password-reset. The RPC
--     error is thrown on purpose (a failure is a 500, never a fake 429), which
--     the handler answers with `500 internal_error`.
--   * identity.profiles (select + update) -- POST/DELETE /profiles/me/avatar.
--   * docs.sources / docs.pages (upsert + delete) -- POST /docs/reindex.
--
-- pgTAP never noticed: the existing tests run as `postgres`, `anon` or
-- `authenticated`, never as `service_role`.
--
-- service_role is only ever used server-side (Edge Functions, dashboard) and
-- already bypasses RLS, so full privileges on these four schemas widen
-- nothing a leaked service key could not do anyway. `private` is
-- deliberately left out: it holds RLS helper functions only.
-- ---------------------------------------------------------------------

grant usage on schema identity, content, docs, releases to service_role;

grant all on all tables in schema identity, content, docs, releases to service_role;
grant all on all sequences in schema identity, content, docs, releases to service_role;
grant execute on all functions in schema identity, content, docs, releases to service_role;

-- Objects added by later migrations (run as `postgres`) get the same grants,
-- so this cannot silently regress for the next table or function.
alter default privileges in schema identity, content, docs, releases
  grant all on tables to service_role;
alter default privileges in schema identity, content, docs, releases
  grant all on sequences to service_role;
alter default privileges in schema identity, content, docs, releases
  grant execute on functions to service_role;
