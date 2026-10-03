-- Tests for 20260928100000_account_deletion_readiness.sql: which rows
-- referencing a deleted auth.users row now cascade/null out, and which
-- are still deliberately left blocking (see that migration's comment
-- for the reasoning).
--
-- Deletes directly from auth.users (what DELETE /profiles/me's admin
-- API call ultimately does), not through the edge function -- this
-- file is exercising the DB's FK behavior, not the route.
--
-- Run with: supabase test db

begin;

select plan(9);


-- ---------------------------------------------------------------------
-- Fixture users
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000', 'eeeeffff-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'func-test-del-1@example.com',
    crypt('x', gen_salt('bf')), now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', 'eeeeffff-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'func-test-del-2@example.com',
    crypt('x', gen_salt('bf')), now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', 'eeeeffff-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'func-test-del-3@example.com',
    crypt('x', gen_salt('bf')), now(), now(), now()
  )
on conflict (id) do nothing;

-- trg_handle_new_auth_user already created a identity.profiles row for
-- each of the three above.


-- ---------------------------------------------------------------------
-- User 1: only has the kinds of references the migration loosened --
-- deleting them must succeed and leave the related rows intact
-- (null'd/cascaded), not deleted wholesale.
-- ---------------------------------------------------------------------

insert into identity.teams (id, name, created_by)
values ('eeeeffff-1000-0000-0000-000000000001', 'Deletion Test Team', 'eeeeffff-0000-0000-0000-000000000001');

insert into identity.team_members (team_id, user_id, role)
values ('eeeeffff-1000-0000-0000-000000000001', 'eeeeffff-0000-0000-0000-000000000003', 'owner');

insert into identity.team_membership_requests (id, team_id, user_id, type, initiated_by)
values (
         'eeeeffff-2000-0000-0000-000000000001',
         'eeeeffff-1000-0000-0000-000000000001',
         'eeeeffff-0000-0000-0000-000000000003',
         'invite',
         'eeeeffff-0000-0000-0000-000000000001'
       );

insert into content.polls (id, question, created_by)
values ('eeeeffff-3000-0000-0000-000000000001', 'Deletion test poll?', 'eeeeffff-0000-0000-0000-000000000003');

insert into content.poll_options (id, poll_id, label)
values ('eeeeffff-4000-0000-0000-000000000001', 'eeeeffff-3000-0000-0000-000000000001', 'Yes');

insert into content.poll_votes (poll_id, option_id, user_id)
values (
         'eeeeffff-3000-0000-0000-000000000001',
         'eeeeffff-4000-0000-0000-000000000001',
         'eeeeffff-0000-0000-0000-000000000001'
       );

select lives_ok(
         $$ delete from auth.users where id = 'eeeeffff-0000-0000-0000-000000000001' $$,
         'deleting a user whose only references are votes/team-creation/request-initiation succeeds'
       );

select is_empty(
         $$ select 1 from identity.profiles where id = 'eeeeffff-0000-0000-0000-000000000001' $$,
         'the deleted user''s own profile is gone (cascade from auth.users)'
       );

select is_empty(
         $$
        select 1
        from content.poll_votes
        where user_id = 'eeeeffff-0000-0000-0000-000000000001'
    $$,
         'their poll_votes row is gone too (on delete cascade)'
       );

select isnt_empty(
         $$
        select 1
        from content.polls
        where id = 'eeeeffff-3000-0000-0000-000000000001'
    $$,
         'the poll itself is untouched by the voter''s deletion'
       );

select is(
         (
           select initiated_by
           from identity.team_membership_requests
           where id = 'eeeeffff-2000-0000-0000-000000000001'
         ),
         null,
         'the membership request they initiated is kept, with initiated_by set to null'
       );

select is(
         (
           select created_by
           from identity.teams
           where id = 'eeeeffff-1000-0000-0000-000000000001'
         ),
         null,
         'the team they created is kept, with created_by set to null'
       );

select isnt_empty(
         $$
        select 1
        from identity.team_members
        where team_id = 'eeeeffff-1000-0000-0000-000000000001'
          and role = 'owner'
    $$,
         'the team''s actual current owner (a different user) is unaffected'
       );


-- ---------------------------------------------------------------------
-- User 2: authored a news article -- this reference was deliberately
-- left blocking. Deleting them must still fail with a 23503, exactly
-- as it did before this migration, so DELETE /profiles/me's
-- precondition check isn't silently defeated by a future change here.
-- ---------------------------------------------------------------------

insert into content.news (id, title, slug, body, author_id)
values (
         'eeeeffff-5000-0000-0000-000000000001',
         'Deletion Test Article',
         'func-test-deletion-article',
         'body',
         'eeeeffff-0000-0000-0000-000000000002'
       );

select throws_ok(
         $$ delete from auth.users where id = 'eeeeffff-0000-0000-0000-000000000002' $$,
         '23503',
         null,
         'deleting a user who authored news still fails (deliberately left blocking)'
       );

select isnt_empty(
         $$ select 1 from identity.profiles where id = 'eeeeffff-0000-0000-0000-000000000002' $$,
         'the failed delete did not remove their profile either (whole statement rolled back)'
       );


select * from finish();

rollback;
