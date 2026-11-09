-- Tests for delta Engine updates (0.6.0):
--   releases.engine_deltas constraints + direction trigger,
--   engine_artifacts manifest consistency,
--   releases.plan_delta, RLS and the engine-deltas bucket.
--
-- Run with:
--   supabase test db
--
-- Requires the pgTAP extension.

begin;

select plan(19);

-- ---------------------------------------------------------------------
-- Test data: five releases above every existing one (A < B < C < D < E),
-- each with a linux/x86_64 artifact of 1000 bytes. A-D have a manifest,
-- E has none.
--
-- Deltas (bytes):  A->B 100   B->C 100   C->D 100   A->D 500   A->C 700
-- Best chain A->D is therefore A->B->C->D (300 bytes, 3 steps); with a
-- 2-step limit only the direct A->D delta (500 bytes) is allowed.
-- ---------------------------------------------------------------------

create temp table tv as
select n::text || '.0.0' as a,
       n::text || '.1.0' as b,
       n::text || '.2.0' as c,
       n::text || '.3.0' as d,
       n::text || '.4.0' as e
from (select coalesce(max(version_major), 0) + 1 as n
      from releases.engine_releases) base;

grant select on tv to anon, authenticated;

insert into releases.engine_releases (version, version_major, version_minor, version_patch, release_date, status)
select v, split_part(v, '.', 1)::int, split_part(v, '.', 2)::int, 0, date '2026-01-01', 'stable'
from tv, lateral (values (a), (b), (c), (d), (e)) as x (v);

insert into releases.engine_artifacts
(release_id, os, architecture, download_url, sha256, size_bytes, min_requirements, compiler,
 manifest_path, manifest_sha256, manifest_size_bytes)
select r.id, 'linux', 'x86_64', 'https://example.com/' || r.version || '.tar.gz',
       repeat('a', 64), 1000, '{}'::jsonb, '{}'::jsonb,
       case when r.version = (select e from tv) then null else 'linux-x86_64/' || r.version || '/manifest.json' end,
       case when r.version = (select e from tv) then null else repeat('c', 64) end,
       case when r.version = (select e from tv) then null else 2000 end
from releases.engine_releases r, tv
where r.version in (a, b, c, d, e);

create function pg_temp.add_delta(p_from text, p_to text, p_bytes bigint)
  returns void
  language sql
as $$
insert into releases.engine_deltas (from_release_id, to_release_id, os, architecture, storage_path, sha256, size_bytes)
select f.id, t.id, 'linux', 'x86_64',
       'linux-x86_64/' || p_from || '__' || p_to || '/delta.zip', repeat('b', 64), p_bytes
from releases.engine_releases f, releases.engine_releases t
where f.version = p_from and t.version = p_to;
$$;

select pg_temp.add_delta(a, b, 100) from tv;
select pg_temp.add_delta(b, c, 100) from tv;
select pg_temp.add_delta(c, d, 100) from tv;
select pg_temp.add_delta(a, d, 500) from tv;
select pg_temp.add_delta(a, c, 700) from tv;

-- ---------------------------------------------------------------------
-- plan_delta
-- ---------------------------------------------------------------------

-- 1-4: the cheapest chain wins, in order
select is(
         (select releases.plan_delta(a, d, 'linux', 'x86_64') ->> 'recommended' from tv),
         'delta',
         'plan_delta recommends a delta when a small enough chain exists'
       );

select is(
         (select (releases.plan_delta(a, d, 'linux', 'x86_64') ->> 'delta_bytes')::bigint from tv),
         300::bigint,
         'plan_delta picks the chain with the fewest bytes (3 x 100, not 500)'
       );

select is(
         (select jsonb_array_length(releases.plan_delta(a, d, 'linux', 'x86_64') -> 'steps') from tv),
         3,
         'plan_delta returns three steps for A->B->C->D'
       );

select is(
         (select releases.plan_delta(a, d, 'linux', 'x86_64') -> 'steps' -> 0 ->> 'from_version' from tv),
         (select a from tv),
         'plan_delta steps are ordered oldest first'
       );

-- 5-6: max_steps is honoured
select is(
         (select (releases.plan_delta(a, d, 'linux', 'x86_64', 2) ->> 'delta_bytes')::bigint from tv),
         500::bigint,
         'with max_steps = 2 only the direct A->D delta qualifies'
       );

select is(
         (select jsonb_array_length(releases.plan_delta(a, d, 'linux', 'x86_64', 2) -> 'steps') from tv),
         1,
         'with max_steps = 2 the plan has a single step'
       );

-- 7-8: max_ratio is honoured, steps are empty when the answer is "full"
select is(
         (select releases.plan_delta(a, d, 'linux', 'x86_64', 5, 0.1) ->> 'reason' from tv),
         'too_large',
         'plan_delta answers too_large when the chain exceeds max_ratio of the full artifact'
       );

select is(
         (select jsonb_array_length(releases.plan_delta(a, d, 'linux', 'x86_64', 5, 0.1) -> 'steps') from tv),
         0,
         'plan_delta returns no steps when it recommends the full artifact'
       );

-- 9: no chain
select is(
         (select releases.plan_delta(b, a, 'linux', 'x86_64') ->> 'reason' from tv),
         'not_newer',
         'plan_delta answers not_newer when the source is not older than the target'
       );

-- 10: no manifest on the target
select is(
         (select releases.plan_delta(a, e, 'linux', 'x86_64') ->> 'reason' from tv),
         'no_manifest',
         'plan_delta answers no_manifest when the target artifact has no manifest'
       );

-- 11-12: unknown inputs give NULL (the API answers 404)
select is(
         (select releases.plan_delta(a, '999999.0.0', 'linux', 'x86_64') from tv),
         null::jsonb,
         'plan_delta returns NULL for an unknown target version'
       );

select is(
         (select releases.plan_delta(a, d, 'windows', 'x86_64') from tv),
         null::jsonb,
         'plan_delta returns NULL when the target has no artifact for the platform'
       );

-- ---------------------------------------------------------------------
-- constraints
-- ---------------------------------------------------------------------

-- 13: direction trigger
select throws_ok(
         $$select pg_temp.add_delta((select d from tv), (select a from tv), 10)$$,
         '23514',
         NULL,
         'a delta cannot go from a newer release to an older one'
       );

-- 14: both ends must have an artifact for the platform
select throws_ok(
         $$
  insert into releases.engine_deltas (from_release_id, to_release_id, os, architecture, storage_path, sha256, size_bytes)
  select f.id, t.id, 'windows', 'x86_64', 'x', repeat('b', 64), 10
  from releases.engine_releases f, releases.engine_releases t, tv
  where f.version = tv.a and t.version = tv.b
  $$,
         '23503',
         NULL,
         'a delta needs an artifact for the platform on both releases'
       );

-- 15: manifest columns are all-or-nothing and the hash is checked
select throws_ok(
         $$
  update releases.engine_artifacts
  set manifest_sha256 = 'not-a-hash'
  where release_id = (select id from releases.engine_releases where version = (select a from tv))
  $$,
         '23514',
         NULL,
         'engine_artifacts rejects a malformed manifest_sha256'
       );

-- ---------------------------------------------------------------------
-- RLS and Storage
-- ---------------------------------------------------------------------

set local role anon;

-- 16
select isnt_empty(
         $$select 1 from releases.engine_deltas$$,
         'anon can SELECT from engine_deltas'
       );

-- 17
select is(
         (select releases.plan_delta(a, d, 'linux', 'x86_64') ->> 'recommended' from tv),
         'delta',
         'anon can call plan_delta'
       );

-- 18
select throws_ok(
         $$delete from releases.engine_deltas$$,
         '42501',
         NULL,
         'anon cannot DELETE from engine_deltas'
       );

reset role;

-- 19: the bucket is public and nothing but SELECT is allowed on it
select ok(
         (select public from storage.buckets where id = 'engine-deltas')
           and not exists (
           select 1
           from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             and (qual ilike '%engine-deltas%' or with_check ilike '%engine-deltas%')
         ),
         'engine-deltas bucket is public with no client-side write policy'
       );

select * from finish();

rollback;
