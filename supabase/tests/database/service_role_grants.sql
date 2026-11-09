-- service_role must be able to reach the API schemas. It bypasses RLS but
-- still needs schema USAGE and object privileges; without them the rate
-- limiter (identity.hit_rate_limit), avatar upload (identity.profiles) and
-- docs reindex (docs.*) fail with 42501 and surface as a generic 500.
-- Guards 20261015090000_grant_service_role_api_schemas.sql.
-- Run with: supabase test db

begin;

select plan(11);

select ok(has_schema_privilege('service_role', 'identity', 'USAGE'), 'service_role has USAGE on identity');
select ok(has_schema_privilege('service_role', 'content', 'USAGE'), 'service_role has USAGE on content');
select ok(has_schema_privilege('service_role', 'docs', 'USAGE'), 'service_role has USAGE on docs');
select ok(has_schema_privilege('service_role', 'releases', 'USAGE'), 'service_role has USAGE on releases');

select ok(
         has_table_privilege('service_role', 'identity.profiles', 'SELECT')
           and has_table_privilege('service_role', 'identity.profiles', 'UPDATE'),
         'service_role can select and update identity.profiles (avatar upload/removal)'
       );

select ok(
         has_table_privilege('service_role', 'docs.pages', 'INSERT')
           and has_table_privilege('service_role', 'docs.pages', 'DELETE')
           and has_table_privilege('service_role', 'docs.sources', 'INSERT'),
         'service_role can write docs.sources and docs.pages (docs reindex)'
       );

select ok(
         has_function_privilege('service_role', 'identity.hit_rate_limit(text, int, int)', 'EXECUTE'),
         'service_role can execute identity.hit_rate_limit'
       );

-- The real thing: act as service_role, the way the Edge Functions do.
set local role service_role;

select lives_ok(
         $$ select identity.hit_rate_limit('test:service-role:grants', 5, 60) $$,
         'service_role can call identity.hit_rate_limit'
       );

select lives_ok(
         $$ select id, avatar_path from identity.profiles limit 1 $$,
         'service_role can read identity.profiles'
       );

select lives_ok(
         $$ select count(*) from docs.pages $$,
         'service_role can read docs.pages'
       );

reset role;

select ok(
         not has_function_privilege('anon', 'identity.hit_rate_limit(text, int, int)', 'EXECUTE'),
         'anon still cannot execute identity.hit_rate_limit'
       );

select * from finish();

rollback;
