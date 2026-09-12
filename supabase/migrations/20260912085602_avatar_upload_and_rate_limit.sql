-- =====================================================================
-- AVATAR UPLOAD (server-controlled) + RATE LIMITING
-- =====================================================================
--
-- Part of the v0.1.1 "strict API-first" plan:
--   1. Avatars are no longer written by the client directly to Storage.
--      The `profiles` edge function now exposes POST /profiles/me/avatar
--      (multipart upload), validates the file itself, and writes to
--      Storage with the service role. Client-side Storage write policies
--      are therefore removed -- avatars_public_read is the only policy
--      client credentials still need on this bucket.
--   2. A small generic rate-limiting primitive (identity.rate_limit_hits
--      + identity.hit_rate_limit()) is added so the new unauthenticated
--      POST /auth/password-reset endpoint (and any future public,
--      abuse-prone endpoint) can enforce a fixed-window limit without
--      each edge function reinventing its own counter table.
--   3. identity.handle_new_auth_user() now falls back to the `username`
--      signup metadata key when `full_name` is absent, as a defensive
--      measure while the Website migrates fully to sending `full_name`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- avatars bucket: widen to PNG + WebP, 5 MB limit (was PNG-only, 2 MB)
-- ---------------------------------------------------------------------

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/webp']
where id = 'avatars';

comment on column identity.profiles.avatar_path is
  'Storage path (bucket: avatars). Written exclusively by the profiles '
  'edge function (service role) via POST /profiles/me/avatar -- never '
  'by a direct client Storage write. PNG or WebP, up to 5 MB.';

-- ---------------------------------------------------------------------
-- avatars: drop client-side write policies.
--
-- All avatar writes now go through the profiles edge function's
-- POST /profiles/me/avatar route, which uploads via the service role
-- (bypasses RLS entirely) after validating the file server-side.
-- avatars_public_read is untouched -- reads stay public.
-- ---------------------------------------------------------------------

drop policy if exists avatars_self_write on storage.objects;
drop policy if exists avatars_self_update on storage.objects;
drop policy if exists avatars_self_delete on storage.objects;


-- ---------------------------------------------------------------------
-- Generic rate limiting primitive
--
-- A fixed-window counter keyed by an arbitrary text key (the caller
-- decides the namespacing, e.g. 'pwreset:email:<email>' or
-- 'pwreset:ip:<ip>'). identity.hit_rate_limit() atomically expires old
-- hits for that key, counts what's left, and either records a new hit
-- (returning true) or refuses (returning false) if the window's already
-- at capacity. Intentionally generic so future public endpoints can
-- reuse it instead of each growing its own counter table.
-- ---------------------------------------------------------------------

create table identity.rate_limit_hits (
                                        id         bigint generated always as identity primary key,
                                        key        text not null,
                                        created_at timestamptz not null default now()
);

comment on table identity.rate_limit_hits is
  'Fixed-window rate limit hits. Rows are namespaced by an arbitrary '
  'caller-chosen `key` (e.g. pwreset:email:<email>, pwreset:ip:<ip>) '
  'and pruned both on read (hit_rate_limit) and by a daily cron job.';

create index rate_limit_hits_key_created_at_idx
  on identity.rate_limit_hits (key, created_at desc);

-- No client access whatsoever -- callers only ever go through
-- identity.hit_rate_limit(), never touch the table directly.
alter table identity.rate_limit_hits enable row level security;

create function identity.hit_rate_limit(
  p_key text,
  p_max_hits int,
  p_window_seconds int
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
v_count int;
begin
  if p_key is null or p_key = '' then
    raise exception 'p_key must not be empty';
end if;
  if p_max_hits <= 0 or p_window_seconds <= 0 then
    raise exception 'p_max_hits and p_window_seconds must be positive';
end if;

delete from identity.rate_limit_hits
where key = p_key
  and created_at < now() - make_interval(secs => p_window_seconds);

select count(*) into v_count
from identity.rate_limit_hits
where key = p_key;

if v_count >= p_max_hits then
    return false;
end if;

insert into identity.rate_limit_hits (key) values (p_key);
return true;
end;
$$;

comment on function identity.hit_rate_limit(text, int, int) is
  'Records a hit for `p_key` and returns false if that key already has '
  '`p_max_hits` or more hits within the trailing `p_window_seconds`. '
  'Expired hits for the key are pruned on every call. SECURITY DEFINER '
  'so it can write to identity.rate_limit_hits without granting table '
  'access to anon/authenticated/service_role directly.';

alter function identity.hit_rate_limit(text, int, int) owner to postgres;

revoke all on function identity.hit_rate_limit(text, int, int) from public;

-- Called from the auth edge function via the service-role client
-- (this endpoint is unauthenticated, so there is no authenticated-user
-- JWT to run it as -- unlike the identity domain's other SECURITY
-- DEFINER functions, which run as `authenticated`).
grant execute on function identity.hit_rate_limit(text, int, int)
  to service_role;


-- ---------------------------------------------------------------------
-- full_name / username fallback
--
-- Defensive measure: some signup callers may still send `username`
-- instead of `full_name` in raw_user_meta_data during the Website's
-- migration to the new signup payload. Prefer full_name; fall back to
-- username; otherwise empty string, same as before.
-- ---------------------------------------------------------------------

create or replace function identity.handle_new_auth_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
insert into identity.profiles (id, full_name)
values (
         new.id,
         coalesce(
           nullif(new.raw_user_meta_data ->> 'full_name', ''),
           nullif(new.raw_user_meta_data ->> 'username', ''),
           ''
         )
       );

return new;
end;
$$;

comment on function identity.handle_new_auth_user() is
  'Auto-creates an identity.profiles row on signup. Reads full_name '
  'from signup metadata, falling back to username if full_name is '
  'absent/empty (transitional -- remove the username fallback once '
  'the Website only ever sends full_name).';


-- ---------------------------------------------------------------------
-- Rate limit hit cleanup
--
-- Requires pg_cron (already enabled by the identity domain migration).
-- Runs daily and deletes rate limit hits older than 1 day -- well past
-- any window currently in use (password reset uses 15 min / 1 hour
-- windows), just keeping the table small.
-- ---------------------------------------------------------------------

do $$
begin

    if exists (
      select 1
      from pg_extension
      where extname = 'pg_cron'
    ) then

      if exists (
        select 1
        from cron.job
        where jobname = 'cleanup-rate-limit-hits'
      ) then

        perform cron.unschedule(
          'cleanup-rate-limit-hits'
                );

end if;

      perform cron.schedule(
        'cleanup-rate-limit-hits',
        '0 3 * * *',
        $cron$
                delete from identity.rate_limit_hits
                where created_at < now() - interval '1 day';
            $cron$
              );

end if;

end
$$;
