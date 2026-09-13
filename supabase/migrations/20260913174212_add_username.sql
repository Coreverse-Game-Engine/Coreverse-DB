-- =====================================================================
-- USERNAME
-- =====================================================================
--
-- identity.profiles has had full_name (free-text display name, no
-- format/uniqueness) since 20260829162935. This adds a second, distinct
-- field: username -- a unique, alphanumeric/underscore handle. The two
-- serve different purposes and are independently settable through
-- PATCH /profiles/me: full_name is "what to call you", username is
-- "how to find/mention you".
--
-- Legacy context: the Website's original registration form only ever
-- collected what it called "username" (public.profiles.username /
-- raw_user_meta_data.username), but enforced no uniqueness anywhere --
-- neither a DB constraint nor an application-level check before insert
-- (confirmed against the Website source: 20260713140900_username_add.sql
-- has no unique index, and src/features/auth/actions.ts's register
-- action never queries for an existing username first). That's exactly
-- why 20260912120000_backfill_legacy_identity.sql mapped it into
-- full_name rather than a unique field. This migration is what makes a
-- *real* unique username possible: it adds the column, backfills every
-- existing user with a value that's guaranteed to satisfy the new
-- constraints (deduplicating any real collisions the legacy system
-- never prevented), and updates the signup trigger so every new user
-- gets a collision-free username from day one.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Column + constraints
--
-- Case-insensitive uniqueness via a functional index on lower(username)
-- rather than the citext extension -- avoids introducing a new
-- extension dependency for what's otherwise a plain text column; the
-- original case the user chose is still what's stored and displayed.
-- Nullable: a user always has *a* username (backfilled below / assigned
-- at signup), but the column itself doesn't need a NOT NULL to express
-- that -- it's enforced by every code path that creates a row, and
-- leaving it nullable means this migration can't itself be the thing
-- that fails a legitimate future row insert some other way.
-- ---------------------------------------------------------------------

alter table identity.profiles
  add column username text;

comment on column identity.profiles.username is
  'Unique (case-insensitive, see idx_profiles_username_lower), alphanumeric/underscore handle, 3-24 chars -- distinct from full_name, which is a free-text display name with no format or uniqueness constraint.';

alter table identity.profiles
  add constraint profiles_username_format
    check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$');

create unique index idx_profiles_username_lower
  on identity.profiles (lower(username))
  where username is not null;


-- ---------------------------------------------------------------------
-- Signup trigger: derive + dedupe a username for every new user
--
-- Runs inside the same transaction as the auth.users insert, so an
-- unhandled unique_violation here would fail signup itself with an
-- opaque error -- unacceptable for a field the user never even
-- explicitly chose to make unique. Instead: derive a candidate the same
-- way the legacy trigger did, sanitize it to the format constraint, and
-- loop-append a numeric suffix until it's free. The loop reads
-- identity.profiles directly (not through RLS) since this function is
-- SECURITY DEFINER, and sees its own prior iterations' hypothetical
-- candidates correctly because nothing is inserted until a free one is
-- found.
--
-- full_name intentionally still only reads raw_user_meta_data.full_name
-- (unchanged from 20260829162935) and is left '' when absent, rather
-- than defaulting it to the derived username -- the Website's signup
-- form does not currently collect a full name at all (only username),
-- so until it does, every new user's full_name will read as empty
-- until they set one via PATCH /profiles/me. That's an intentional
-- product gap for the Website to close, not a DB-side bug: keeping the
-- two fields visibly distinct from day one instead of quietly copying
-- username into full_name reflects what the fields actually mean.
-- ---------------------------------------------------------------------

create or replace function identity.handle_new_auth_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  raw_candidate text;
  base_username text;
  candidate_username text;
  suffix int := 0;
begin
  raw_candidate := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'user_name', ''),
    nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
    split_part(new.email, '@', 1),
    'user'
                   );

  base_username := regexp_replace(raw_candidate, '[^a-zA-Z0-9_]', '', 'g');
  if base_username = '' then
    base_username := 'user' || substr(new.id::text, 1, 8);
  elsif length(base_username) < 3 then
    base_username := base_username || substr(new.id::text, 1, 8);
  end if;
  base_username := left(base_username, 24);

  candidate_username := base_username;
  while exists (
    select 1 from identity.profiles where lower(username) = lower(candidate_username)
  ) loop
      suffix := suffix + 1;
      candidate_username := left(base_username, 24 - length(suffix::text) - 1) || '_' || suffix;
    end loop;

  insert into identity.profiles (id, full_name, username)
  values (
           new.id,
           coalesce(new.raw_user_meta_data ->> 'full_name', ''),
           candidate_username
         );

  return new;
end;
$$;

-- CREATE OR REPLACE keeps the existing owner/privileges from
-- 20260829162935 (same name, same signature) -- no need to repeat the
-- `alter function ... owner to postgres` / `revoke all ... from public`
-- statements.


-- ---------------------------------------------------------------------
-- Backfill: existing users
--
-- Assumption this block relies on: it runs once, immediately after this
-- column is added (username is null for every existing row, since the
-- column is brand new) -- so the only collisions to resolve are within
-- this single pass, not against already-assigned usernames elsewhere in
-- the table. If this ever needs re-running by hand against a
-- partially-populated column, that assumption no longer holds and the
-- dedup logic below would need to also check already-assigned values.
--
-- Re-derives the candidate from the legacy source (public.profiles.
-- username / auth metadata) rather than reusing the already-backfilled
-- full_name column, because full_name may since have been edited by
-- the user through PATCH /profiles/me -- the raw legacy source is what
-- should seed username, not whatever the user has since renamed their
-- display name to.
--
-- Sanitizes to the format constraint (strips disallowed characters,
-- pads short results, truncates long ones) before dedup, since a raw
-- email-local-part fallback (e.g. "john.doe+test") can easily contain
-- characters profiles_username_format rejects.
-- ---------------------------------------------------------------------

-- The naive version of this (a single static statement with
-- `left join public.profiles legacy on to_regclass(...) is not null and
-- ...`) fails on any environment that never had the legacy schema at
-- all (confirmed against a fresh `supabase start`: ERROR relation
-- "public.profiles" does not exist, 42P01) -- PL/pgSQL prepares a
-- statement's SQL text as a whole the first time it's reached, so a
-- table name appearing anywhere in that text must resolve at that
-- point regardless of a runtime condition on the join. Building the
-- statement as a string via EXECUTE format(...) instead defers parsing
-- to when it actually runs, so `public.profiles` is only ever mentioned
-- in the text that gets executed on an environment where it exists.
do $$
  declare
    legacy_source text;
    legacy_join text;
  begin
    if to_regclass('public.profiles') is not null then
      legacy_source := $frag$nullif(legacy.username, ''),$frag$;
      legacy_join := 'left join public.profiles legacy on legacy.id = ip.id';
    else
      legacy_source := '';
      legacy_join := '';
    end if;

    execute format(
      $q$
    with candidates as (
      select
        ip.id,
        coalesce(
          %s
          nullif(u.raw_user_meta_data ->> 'username', ''),
          nullif(u.raw_user_meta_data ->> 'user_name', ''),
          nullif(u.raw_user_meta_data ->> 'preferred_username', ''),
          split_part(u.email, '@', 1),
          'user'
        ) as raw_candidate,
        u.created_at
      from identity.profiles ip
      join auth.users u on u.id = ip.id
      %s
      where ip.username is null
    ),
    sanitized as (
      select
        id,
        created_at,
        case
          when regexp_replace(raw_candidate, '[^a-zA-Z0-9_]', '', 'g') = ''
            then 'user' || substr(id::text, 1, 8)
          when length(regexp_replace(raw_candidate, '[^a-zA-Z0-9_]', '', 'g')) < 3
            then left(regexp_replace(raw_candidate, '[^a-zA-Z0-9_]', '', 'g') || substr(id::text, 1, 8), 24)
          else left(regexp_replace(raw_candidate, '[^a-zA-Z0-9_]', '', 'g'), 24)
        end as base_username
      from candidates
    ),
    numbered as (
      select
        id,
        base_username,
        row_number() over (
          partition by lower(base_username)
          order by created_at, id
        ) as dup_rank
      from sanitized
    ),
    final as (
      select
        id,
        case
          when dup_rank = 1 then base_username
          else left(base_username, 24 - length(dup_rank::text) - 1) || '_' || dup_rank
        end as final_username
      from numbered
    )
    update identity.profiles ip
    set username = final.final_username
    from final
    where ip.id = final.id
    $q$,
      legacy_source,
      legacy_join
            );
  end
$$;
