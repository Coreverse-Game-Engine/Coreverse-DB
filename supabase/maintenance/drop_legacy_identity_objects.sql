-- =====================================================================
-- MANUAL, AUDITED CLEANUP -- NOT A MIGRATION.
--
-- This file deliberately does NOT live in supabase/migrations/. It is
-- not applied by `supabase db push` / `supabase migration up`, and it
-- must not be moved into migrations/ and auto-run. Run each section by
-- hand (psql / SQL editor), per environment, only after that
-- environment satisfies the section's precondition.
--
-- Run 20260912120000_backfill_legacy_identity.sql (a real migration)
-- first, in every environment -- both sections below assume it has
-- already run there.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1 -- drop the legacy signup trigger + function
--
-- Precondition before running this section in an environment:
--   1. 20260912120000_backfill_legacy_identity.sql has been applied
--      there (every existing user has an identity.profiles row).
--   2. public.profiles / public.handle_new_user() / on_auth_user_created
--      have been audited in *that* environment for consumers beyond
--      what the Website's repo (as reviewed) shows -- their only
--      known effect is inserting into public.profiles, but production/
--      staging may have been modified since. Confirm nothing else reads
--      or writes public.profiles (queries, other triggers, views,
--      scheduled jobs) before dropping.
--
-- After this section runs, new signups only get an identity.profiles
-- row (via trg_handle_new_auth_user) -- public.profiles stops
-- receiving new rows but is not itself dropped yet (see Section 2).
-- ---------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();


-- ---------------------------------------------------------------------
-- SECTION 2 -- drop the legacy tables
--
-- Run ONLY after Section 1 has been applied AND verified (new test
-- signups produce no new public.profiles row), and after:
--
--   public.profiles:
--     Every consumer of it has moved to identity.profiles. In the
--     reviewed Website code, that's src/hooks/use-current-user.ts,
--     src/lib/avatar-url.ts and anywhere else reading
--     username/avatar -- confirm the Website deploy that reads
--     identity.profiles (via this package) instead is live in this
--     environment before dropping.
--
--   public.password_reset_throttle:
--     The Website's requestPasswordReset Server Action
--     (src/features/auth/actions.ts) has been switched from its own
--     admin.auth.admin.generateLink() + this throttle table to calling
--     this package's POST /auth/password-reset (which throttles via
--     identity.hit_rate_limit instead). Confirm that deploy is live in
--     this environment before dropping -- until then, dropping this
--     table breaks the Website's *current* reset flow entirely, since
--     it queries this table directly.
--
-- These two are independent -- drop whichever precondition is met;
-- they don't have to happen in the same session.
-- ---------------------------------------------------------------------

-- drop table if exists public.profiles;
-- drop table if exists public.password_reset_throttle;
