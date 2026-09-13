-- =====================================================================
-- BACKFILL: legacy public.profiles / avatars for pre-identity-domain users
-- =====================================================================
--
-- Before this package's identity domain existed, the Website repo ran
-- its own signup-time schema directly (Website
-- src/supabase/migrations/):
--   public.profiles(id, username)
--   public.handle_new_user() + trigger on_auth_user_created
--     (AFTER INSERT ON auth.users)
--   public.password_reset_throttle(email, last_requested_at)
--
-- identity.handle_new_auth_user() / trg_handle_new_auth_user (added by
-- 20260829162935_create_identity_domain.sql) has been creating
-- identity.profiles rows for every *new* signup since that migration
-- was applied -- both triggers fire on every signup from that point on,
-- writing to two different tables. This migration only backfills users
-- who signed up *before* trg_handle_new_auth_user existed, and
-- therefore have no identity.profiles row at all.
--
-- Idempotent and safe to run in any environment, including one that
-- never had the legacy schema (fresh `supabase db reset`, a new
-- contributor's local DB, or a Launcher-only deployment with no
-- Website): the `to_regclass(...) is not null` guard makes the legacy
-- branch a no-op when public.profiles doesn't exist, and the `not
-- exists` guard against identity.profiles means re-running this after
-- trg_handle_new_auth_user (or a previous run of this same migration)
-- has already covered a user is also a no-op. Also safe to re-run after
-- the legacy trigger/table are eventually dropped (see
-- supabase/maintenance/drop_legacy_identity_objects.sql) -- at that
-- point every user already has an identity.profiles row (this backfill
-- or the new trigger created it), so there's nothing left to do.
--
-- This migration does NOT drop the legacy trigger/function/tables --
-- that's a separate, manually-run step once each environment has been
-- audited for other consumers of public.profiles /
-- public.password_reset_throttle and the Website has cut over to this
-- package's endpoints. See supabase/maintenance/drop_legacy_identity_objects.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- full_name backfill
--
-- Priority mirrors the legacy trigger's own derivation (Website
-- src/supabase/migrations/20260713140900_username_add.sql):
-- public.profiles.username was already computed with this exact
-- fallback chain at signup time, so it's preferred over redoing the
-- derivation from raw_user_meta_data. The metadata keys are repeated
-- here as a fallback only for a user with no legacy profiles row at all
-- (username null/empty), or for environments where public.profiles
-- never existed.
-- ---------------------------------------------------------------------

do $$
  begin
    if to_regclass('public.profiles') is not null then
      insert into identity.profiles (id, full_name, created_at)
      select
        u.id,
        coalesce(
          nullif(p.username, ''),
          nullif(u.raw_user_meta_data ->> 'username', ''),
          nullif(u.raw_user_meta_data ->> 'user_name', ''),
          nullif(u.raw_user_meta_data ->> 'preferred_username', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          nullif(u.raw_user_meta_data ->> 'name', ''),
          split_part(u.email, '@', 1),
          ''
        ),
        u.created_at
      from auth.users as u
             left join public.profiles as p on p.id = u.id
      where not exists (
        select 1 from identity.profiles as ip where ip.id = u.id
      );
    else
      insert into identity.profiles (id, full_name, created_at)
      select
        u.id,
        coalesce(
          nullif(u.raw_user_meta_data ->> 'username', ''),
          nullif(u.raw_user_meta_data ->> 'user_name', ''),
          nullif(u.raw_user_meta_data ->> 'preferred_username', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          nullif(u.raw_user_meta_data ->> 'name', ''),
          split_part(u.email, '@', 1),
          ''
        ),
        u.created_at
      from auth.users as u
      where not exists (
        select 1 from identity.profiles as ip where ip.id = u.id
      );
    end if;
  end
$$;


-- ---------------------------------------------------------------------
-- avatar_path backfill
--
-- The Website's signup flow (src/services/avatar-storage.ts) wrote
-- avatars to `{user_id}/avatar.webp` in the avatars bucket directly via
-- the service role -- a different naming convention than this
-- package's flat `{user_id}.<ext>` (see profiles/index.ts
-- avatarStoragePath()). Point avatar_path at the legacy object as-is;
-- no need to move/rename it -- the next time that user uploads a new
-- avatar through POST /profiles/me/avatar, the new flat-named object
-- replaces it in avatar_path and the old nested object is simply left
-- behind as an orphaned (harmless) Storage object.
--
-- Only fills rows that are still null -- never overwrites an
-- avatar_path a user has already set through the new upload endpoint.
-- ---------------------------------------------------------------------

update identity.profiles as ip
set avatar_path = legacy.name
from storage.objects as legacy
where legacy.bucket_id = 'avatars'
  and legacy.name = ip.id::text || '/avatar.webp'
  and ip.avatar_path is null;
