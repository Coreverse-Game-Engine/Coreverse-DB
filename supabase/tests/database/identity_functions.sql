-- Tests for the identity domain's write functions.
-- Run with: supabase test db

begin;

select plan(20);


-- ---------------------------------------------------------------------
-- Fixture users
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  (
    'cccccccc-0000-0000-0000-' ||
    lpad(n::text, 12, '0')
    )::uuid,
  'authenticated',
  'authenticated',
  'func-test-' || n || '@example.com',
  crypt('x', gen_salt('bf')),
  now(),
  now(),
  now()
from generate_series(1, 35) as n
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- Test context
--
-- Store the generated team ID in a transaction-local setting.
-- This prevents later RLS context changes from making the fixture
-- team impossible to locate.
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select set_config(
            'test.identity_team_id',
            identity.create_team('Function Test Team')::text,
            true
        )
    $$,
         'create_team succeeds for an authenticated user'
       );


select is(
         (
           select role
           from identity.team_members
           where team_id =
                 current_setting('test.identity_team_id')::uuid
             and user_id =
                 'cccccccc-0000-0000-0000-000000000001'
         ),
         'owner',
         'create_team makes the caller the owner'
       );

reset role;


-- ---------------------------------------------------------------------
-- request_to_join + respond_to_join_request
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
         $$
        select identity.request_to_join(
            current_setting('test.identity_team_id')::uuid
        )
    $$,
         'request_to_join succeeds for a non-member'
       );


select throws_like(
         $$
        select identity.request_to_join(
            current_setting('test.identity_team_id')::uuid
        )
    $$,
         '%pending request already exists%',
         'a second request_to_join while one is pending is rejected'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select identity.respond_to_join_request(
            (
                select id
                from identity.team_membership_requests
                where team_id =
                    current_setting('test.identity_team_id')::uuid
                  and user_id =
                    'cccccccc-0000-0000-0000-000000000003'
                  and type = 'join_request'
                  and status = 'pending'
            ),
            'accept'
        )
    $$,
         'owner can accept a join request'
       );


select is(
         (
           select role
           from identity.team_members
           where team_id =
                 current_setting('test.identity_team_id')::uuid
             and user_id =
                 'cccccccc-0000-0000-0000-000000000003'
         ),
         'member',
         'accepted join request results in role=member'
       );

reset role;


-- ---------------------------------------------------------------------
-- cancel_request: only the initiator can cancel
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select identity.invite_to_team(
            current_setting('test.identity_team_id')::uuid,
            'cccccccc-0000-0000-0000-000000000004'
        )
    $$,
         'owner can invite an outsider'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_like(
         $$
        select identity.cancel_request(
            (
                select id
                from identity.team_membership_requests
                where team_id =
                    current_setting('test.identity_team_id')::uuid
                  and user_id =
                    'cccccccc-0000-0000-0000-000000000004'
                  and type = 'invite'
                  and status = 'pending'
            )
        )
    $$,
         '%only the initiator%',
         'the invited user cannot cancel the invite'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select identity.cancel_request(
            (
                select id
                from identity.team_membership_requests
                where team_id =
                    current_setting('test.identity_team_id')::uuid
                  and user_id =
                    'cccccccc-0000-0000-0000-000000000004'
                  and type = 'invite'
                  and status = 'pending'
            )
        )
    $$,
         'the inviter can cancel their own invite'
       );

reset role;


-- ---------------------------------------------------------------------
-- promote / demote authorization
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select identity.promote_to_admin(
            current_setting('test.identity_team_id')::uuid,
            'cccccccc-0000-0000-0000-000000000003'
        )
    $$,
         'owner can promote a member to admin'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_like(
         $$
        select identity.demote_to_member(
            current_setting('test.identity_team_id')::uuid,
            'cccccccc-0000-0000-0000-000000000003'
        )
    $$,
         '%only the owner can demote%',
         'an admin cannot demote an admin -- only the owner can demote'
       );

reset role;


-- ---------------------------------------------------------------------
-- remove_member
--
-- User 2 is invited and accepts the invitation.
-- User 3 is already an admin.
-- User 3 must not be able to remove the owner.
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        select identity.invite_to_team(
            current_setting('test.identity_team_id')::uuid,
            'cccccccc-0000-0000-0000-000000000002'
        )
    $$,
         'setup: owner invites another user'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
         $$
        select identity.respond_to_invite(
            (
                select id
                from identity.team_membership_requests
                where team_id =
                    current_setting('test.identity_team_id')::uuid
                  and user_id =
                    'cccccccc-0000-0000-0000-000000000002'
                  and type = 'invite'
                  and status = 'pending'
            ),
            'accept'
        )
    $$,
         'setup: invited user accepts their own invite'
       );

reset role;


set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_like(
         $$
        select identity.remove_member(
            current_setting('test.identity_team_id')::uuid,
            'cccccccc-0000-0000-0000-000000000001'
        )
    $$,
         '%cannot remove the owner%',
         'an admin cannot remove the owner'
       );

reset role;


-- ---------------------------------------------------------------------
-- leave_team: owner cannot leave
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_like(
         $$
        select identity.leave_team(
            current_setting('test.identity_team_id')::uuid
        )
    $$,
         '%owner cannot leave%',
         'the owner cannot leave the team'
       );

reset role;


-- ---------------------------------------------------------------------
-- identity.is_username_available
--
-- Fixture users 1/2/3 already have profiles (with generated usernames)
-- via trg_handle_new_auth_user, fired when they were inserted into
-- auth.users above -- looked up dynamically rather than hardcoded,
-- since the generator's exact output isn't this test's concern.
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims"
  to '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
         (
           select identity.is_username_available(
                    (select username from identity.profiles where id = 'cccccccc-0000-0000-0000-000000000001')
                  )
         ),
         true,
         'is_username_available treats the caller''s own current username as available'
       );

select is(
         (
           select identity.is_username_available(
                    (select username from identity.profiles where id = 'cccccccc-0000-0000-0000-000000000002')
                  )
         ),
         false,
         'is_username_available reports another user''s username as taken'
       );

select is(
         (select identity.is_username_available('func-test-definitely-unused-handle')),
         true,
         'is_username_available reports an unused username as available'
       );

select is(
         (
           select identity.is_username_available(
                    upper((select username from identity.profiles where id = 'cccccccc-0000-0000-0000-000000000002'))
                  )
         ),
         false,
         'is_username_available is case-insensitive'
       );

reset role;


set local role anon;

set local "request.jwt.claims" to '{"role":"anon"}';

select is(
         (
           select identity.is_username_available(
                    (select username from identity.profiles where id = 'cccccccc-0000-0000-0000-000000000002')
                  )
         ),
         false,
         'is_username_available reports a taken username as unavailable for anon too (auth.uid() is null)'
       );

reset role;


select * from finish();

rollback;
