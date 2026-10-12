-- The hosted project only serves the schemas listed in the authenticator
-- role's `pgrst.db_schemas`. This guards the migration that sets it
-- (20261012090000_expose_api_schemas.sql): without it every Edge Function
-- query against identity/content/releases/docs fails with a generic 500.
-- Run with: supabase test db

begin;

select plan(7);

create temporary table _exposed on commit drop as
select trim(s) as schema_name
from pg_db_role_setting d
       join pg_roles r on r.oid = d.setrole and r.rolname = 'authenticator'
       cross join lateral unnest(d.setconfig) as c
       cross join lateral unnest(
  string_to_array(split_part(c, '=', 2), ',')
                          ) as s
where c like 'pgrst.db_schemas=%';

select ok(
         exists (select 1 from _exposed),
         'authenticator has a pgrst.db_schemas setting'
       );

select ok(
         exists (select 1 from _exposed where schema_name = 'releases'),
         'releases is exposed'
       );
select ok(
         exists (select 1 from _exposed where schema_name = 'identity'),
         'identity is exposed'
       );
select ok(
         exists (select 1 from _exposed where schema_name = 'content'),
         'content is exposed'
       );
select ok(
         exists (select 1 from _exposed where schema_name = 'docs'),
         'docs is exposed'
       );
select ok(
         exists (select 1 from _exposed where schema_name = 'public'),
         'public stays exposed'
       );
select ok(
         not exists (select 1 from _exposed where schema_name = 'private'),
         'private (RLS helper functions) is never exposed'
       );

select * from finish();

rollback;
