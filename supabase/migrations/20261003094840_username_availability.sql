-- Phase 5: GET /profiles/username-availability support.
--
-- identity.profiles is already publicly readable (profiles_public_read),
-- so this is a plain SECURITY INVOKER function -- it grants no access
-- the caller didn't already have at the RLS level -- rather than a
-- SECURITY DEFINER one.
--
-- Why a function instead of a PostgREST .ilike() from the edge
-- function: usernames may contain '_', which LIKE/ILIKE treats as a
-- single-character wildcard, so `ilike 'a_b'` would report "taken" for
-- 'aXb'. Comparing lower(username) = lower(p_username) is an exact,
-- case-insensitive match and hits idx_profiles_username_lower (the
-- same functional index the uniqueness constraint uses).
--
-- The caller's own current username counts as available (id is
-- distinct from auth.uid()): a profile-edit form that re-checks the
-- value already in the field must not tell the user their own handle is
-- taken. auth.uid() is null for anon, so for signed-out callers this
-- excludes nothing.

create or replace function identity.is_username_available(p_username text)
  returns boolean
  language sql
  stable
  set search_path = identity, public
as $$
select not exists (
  select 1
  from identity.profiles
  where lower(username) = lower(p_username)
    and id is distinct from auth.uid()
);
$$;

revoke all on function identity.is_username_available(text) from public;

grant execute on function identity.is_username_available(text)
  to anon, authenticated;
