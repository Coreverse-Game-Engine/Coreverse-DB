-- Delta (incremental) Engine updates -- Coreverse DB 0.6.0.
--
-- Instead of downloading a full artifact for every new version, the
-- Launcher can build the new version from an installed older one:
--
--   1. GET /releases/{to}/delta?from=..&os=..&architecture=.. returns a
--      plan: the target's file manifest and an ordered chain of delta
--      packages (older -> newer), or a recommendation to download the
--      full artifact instead.
--   2. The Launcher copies the installed version, applies the delta
--      packages (binary patches for changed files, full copies for new
--      files, removals), and verifies every file against the manifest.
--
-- The database stores only metadata. Manifests and delta packages are
-- objects in the public `engine-deltas` Storage bucket; this migration
-- records their path, SHA-256 and size so the Launcher can verify them
-- independently of whoever serves the bytes (same trust model as
-- engine_artifacts.sha256).
--
-- Object layout inside `engine-deltas`:
--   {os}-{architecture}/{version}/manifest.json
--   {os}-{architecture}/{from}__{to}/delta.zip
--
-- Writes are service_role only (release/CI pipeline); there are no
-- INSERT/UPDATE/DELETE policies for anon/authenticated on the table or
-- on the bucket.

-- ---------------------------------------------------------------------
-- 1. File manifest per artifact (all three columns set together, or none)
-- ---------------------------------------------------------------------

alter table releases.engine_artifacts
  add column manifest_path       text,
  add column manifest_sha256     text,
  add column manifest_size_bytes bigint;

alter table releases.engine_artifacts
  add constraint engine_artifacts_manifest_consistent
    check (
      (manifest_path is null
        and manifest_sha256 is null
        and manifest_size_bytes is null)
        or
      (manifest_path is not null
        and coalesce(manifest_sha256 ~ '^[a-f0-9]{64}$', false)
        and coalesce(manifest_size_bytes > 0, false))
      );

-- ---------------------------------------------------------------------
-- 2. Delta packages between two releases of the same platform
-- ---------------------------------------------------------------------

create table releases.engine_deltas
(
  id              uuid        primary key default gen_random_uuid(),
  from_release_id uuid        not null,
  to_release_id   uuid        not null,
  os              text        not null,
  architecture    text        not null,
  storage_path    text        not null check (length(storage_path) between 1 and 512),
  sha256          text        not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes      bigint      not null check (size_bytes > 0),
  algorithm       text        not null default 'bsdiff' check (algorithm in ('bsdiff')),
  format_version  int         not null default 1 check (format_version > 0),
  created_at      timestamptz not null default now(),

  -- Both ends must be real artifacts of the SAME platform.
  constraint engine_deltas_from_artifact_fk
    foreign key (from_release_id, os, architecture)
      references releases.engine_artifacts (release_id, os, architecture)
      on delete cascade,
  constraint engine_deltas_to_artifact_fk
    foreign key (to_release_id, os, architecture)
      references releases.engine_artifacts (release_id, os, architecture)
      on delete cascade,
  constraint engine_deltas_distinct_releases
    check (from_release_id <> to_release_id),
  constraint engine_deltas_unique_pair
    unique (from_release_id, to_release_id, os, architecture)
);

-- A delta always goes from an older release to a newer one. This also
-- makes the delta graph acyclic, which releases.plan_delta relies on.
create or replace function releases.check_delta_direction()
  returns trigger
  language plpgsql
as $$
declare
  v_from record;
  v_to   record;
begin
  select version_major, version_minor, version_patch
  into v_from
  from releases.engine_releases
  where id = new.from_release_id;
  if not found then
    return new; -- the foreign key reports the missing release
  end if;

  select version_major, version_minor, version_patch
  into v_to
  from releases.engine_releases
  where id = new.to_release_id;
  if not found then
    return new;
  end if;

  if (v_to.version_major, v_to.version_minor, v_to.version_patch)
    <= (v_from.version_major, v_from.version_minor, v_from.version_patch) then
    raise exception 'an engine delta must go from an older release to a newer one'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_engine_deltas_direction
  before insert or update on releases.engine_deltas
  for each row
execute function releases.check_delta_direction();

alter table releases.engine_deltas enable row level security;

create policy engine_deltas_public_read
  on releases.engine_deltas
  for select
  to anon, authenticated
  using (true);

grant select on releases.engine_deltas to anon, authenticated;
grant all on releases.engine_deltas to service_role;

-- ---------------------------------------------------------------------
-- 3. Planner
--
-- releases.plan_delta(from, to, os, architecture, max_steps, max_ratio)
--
-- Returns NULL when the target release, the source release or the
-- target's artifact for the platform does not exist (the API answers
-- 404). Otherwise returns one jsonb object:
--
--   recommended  'delta' | 'full'
--   reason       'delta'        a chain was found and is small enough
--                'not_newer'    from >= to
--                'no_manifest'  the target artifact has no manifest yet
--                'no_chain'     no chain of <= max_steps deltas exists
--                'too_large'    chain bytes > max_ratio * full artifact
--   steps        ordered delta chain; empty unless recommended = 'delta'
--   delta_bytes  total size of the best chain (null when none found)
--
-- The best chain is the one with the fewest bytes (ties: fewest steps).
-- Paths are returned as storage paths; the Edge Function turns them
-- into public URLs.
-- ---------------------------------------------------------------------

create or replace function releases.plan_delta(
  p_from         text,
  p_to           text,
  p_os           text,
  p_architecture text,
  p_max_steps    int     default 5,
  p_max_ratio    numeric default 0.6
)
  returns jsonb
  language plpgsql
  stable
as $$
declare
  v_max_steps  int := least(greatest(coalesce(p_max_steps, 5), 1), 20);
  v_from       releases.engine_releases%rowtype;
  v_to         releases.engine_releases%rowtype;
  v_from_art   releases.engine_artifacts%rowtype;
  v_to_art     releases.engine_artifacts%rowtype;
  v_chain      uuid[];
  v_total      bigint;
  v_recommend  text := 'full';
  v_reason     text;
  v_steps_json jsonb := '[]'::jsonb;
begin
  select * into v_to from releases.engine_releases where version = p_to;
  select * into v_from from releases.engine_releases where version = p_from;
  if v_to.id is null or v_from.id is null then
    return null;
  end if;

  select * into v_to_art
  from releases.engine_artifacts
  where release_id = v_to.id and os = p_os and architecture = p_architecture;
  if v_to_art.id is null then
    return null;
  end if;

  select * into v_from_art
  from releases.engine_artifacts
  where release_id = v_from.id and os = p_os and architecture = p_architecture;

  if (v_from.version_major, v_from.version_minor, v_from.version_patch)
    >= (v_to.version_major, v_to.version_minor, v_to.version_patch) then
    v_reason := 'not_newer';
  elsif v_to_art.manifest_path is null then
    v_reason := 'no_manifest';
  else
    select c.ids, c.total
    into v_chain, v_total
    from (
           with recursive walk as (
             select d.to_release_id as cur,
                    array[d.id]     as ids,
                    d.size_bytes    as total,
                    1               as steps
             from releases.engine_deltas d
                    join releases.engine_releases tr on tr.id = d.to_release_id
             where d.from_release_id = v_from.id
               and d.os = p_os
               and d.architecture = p_architecture
               and (tr.version_major, tr.version_minor, tr.version_patch)
               <= (v_to.version_major, v_to.version_minor, v_to.version_patch)

             union all

             select d.to_release_id,
                    w.ids || d.id,
                    w.total + d.size_bytes,
                    w.steps + 1
             from walk w
                    join releases.engine_deltas d on d.from_release_id = w.cur
                    join releases.engine_releases tr on tr.id = d.to_release_id
             where w.steps < v_max_steps
               and d.os = p_os
               and d.architecture = p_architecture
               and (tr.version_major, tr.version_minor, tr.version_patch)
               <= (v_to.version_major, v_to.version_minor, v_to.version_patch)
           )
           select ids, total, steps
           from walk
           where cur = v_to.id
         ) c
    order by c.total asc, c.steps asc
    limit 1;

    if v_chain is null then
      v_reason := 'no_chain';
    elsif v_total::numeric > p_max_ratio * v_to_art.size_bytes then
      v_reason := 'too_large';
    else
      v_recommend := 'delta';
      v_reason := 'delta';

      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'from_version', fr.version,
                   'to_version', tr.version,
                   'storage_path', d.storage_path,
                   'sha256', d.sha256,
                   'size_bytes', d.size_bytes,
                   'algorithm', d.algorithm,
                   'format_version', d.format_version
                 )
                 order by u.ord
               ),
               '[]'::jsonb
             )
      into v_steps_json
      from unnest(v_chain) with ordinality as u (delta_id, ord)
             join releases.engine_deltas d on d.id = u.delta_id
             join releases.engine_releases fr on fr.id = d.from_release_id
             join releases.engine_releases tr on tr.id = d.to_release_id;
    end if;
  end if;

  return jsonb_build_object(
    'from_version', p_from,
    'to_version', p_to,
    'os', p_os,
    'architecture', p_architecture,
    'recommended', v_recommend,
    'reason', v_reason,
    'full', jsonb_build_object(
      'download_url', v_to_art.download_url,
      'sha256', v_to_art.sha256,
      'size_bytes', v_to_art.size_bytes
            ),
    'to_manifest', case
                     when v_to_art.manifest_path is null then null
                     else jsonb_build_object(
                       'storage_path', v_to_art.manifest_path,
                       'sha256', v_to_art.manifest_sha256,
                       'size_bytes', v_to_art.manifest_size_bytes
                          )
      end,
    'from_manifest', case
                       when v_from_art.manifest_path is null then null
                       else jsonb_build_object(
                         'storage_path', v_from_art.manifest_path,
                         'sha256', v_from_art.manifest_sha256,
                         'size_bytes', v_from_art.manifest_size_bytes
                            )
      end,
    'steps', v_steps_json,
    'delta_bytes', v_total,
    'max_steps', v_max_steps,
    'max_ratio', p_max_ratio
         );
end;
$$;

grant execute on function releases.plan_delta(text, text, text, text, int, numeric)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Storage bucket: public read, service_role-only write
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('engine-deltas', 'engine-deltas', true, null,
        array['application/json', 'application/zip', 'application/octet-stream'])
on conflict (id) do nothing;

create policy engine_deltas_bucket_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'engine-deltas');

-- No insert/update/delete policies: objects are written only with the
-- service role (scripts/ops/publish-delta.mjs), which bypasses RLS.
