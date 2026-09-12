begin;

select plan(5);

-- ---------------------------------------------------------------------
-- 1-2. Bucket config: 5 MB limit, PNG + WebP
-- ---------------------------------------------------------------------

select is(
         (select file_size_limit from storage.buckets where id = 'avatars'),
         5242880::bigint,
         'avatars bucket file_size_limit is 5 MB'
       );

select is(
         (select allowed_mime_types from storage.buckets where id = 'avatars'),
         array['image/png', 'image/webp']::text[],
         'avatars bucket accepts PNG and WebP'
       );

-- ---------------------------------------------------------------------
-- 3. Public read policy is untouched
-- ---------------------------------------------------------------------

select ok(
         exists (
           select 1
           from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and policyname = 'avatars_public_read'
         ),
         'avatars_public_read still exists'
       );

-- ---------------------------------------------------------------------
-- 4-5. Client-side write policies were removed
-- ---------------------------------------------------------------------

select ok(
         not exists (
           select 1
           from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and policyname in ('avatars_self_write', 'avatars_self_update')
         ),
         'avatars_self_write and avatars_self_update no longer exist'
       );

select ok(
         not exists (
           select 1
           from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and policyname = 'avatars_self_delete'
         ),
         'avatars_self_delete no longer exists'
       );

select * from finish();

rollback;
