-- Tests for content domain functions and triggers.
-- Run with: supabase test db

begin;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'func-mod@example.com', crypt('x', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'func-voter1@example.com', crypt('x', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'func-voter2@example.com', crypt('x', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into identity.platform_roles (user_id, role)
values ('ffffffff-0000-0000-0000-000000000001', 'moderator');

-- ---------------------------------------------------------------------
-- identity.is_platform_moderator()
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}';

select ok(identity.is_platform_moderator(), 'is_platform_moderator() is true for a moderator');

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}';

select ok(not identity.is_platform_moderator(), 'is_platform_moderator() is false for a regular user');

reset role;

-- ---------------------------------------------------------------------
-- content.enforce_vote_option_matches_poll trigger
-- ---------------------------------------------------------------------
insert into content.polls (id, question, created_by)
values
  ('11223344-0000-0000-0000-000000000001', 'Poll A', 'ffffffff-0000-0000-0000-000000000001'),
  ('11223344-0000-0000-0000-000000000002', 'Poll B', 'ffffffff-0000-0000-0000-000000000001');

insert into content.poll_options (id, poll_id, label, display_order)
values
  ('11223344-0000-0000-0000-000000000011', '11223344-0000-0000-0000-000000000001', 'A1', 1),
  ('11223344-0000-0000-0000-000000000012', '11223344-0000-0000-0000-000000000001', 'A2', 2),
  ('11223344-0000-0000-0000-000000000021', '11223344-0000-0000-0000-000000000002', 'B1', 1);

select throws_like(
         $$ insert into content.poll_votes (poll_id, option_id, user_id)
     values ('11223344-0000-0000-0000-000000000001', '11223344-0000-0000-0000-000000000021', 'ffffffff-0000-0000-0000-000000000002') $$,
         '%does not belong to poll%',
         'voting with an option from a different poll is rejected'
       );

-- ---------------------------------------------------------------------
-- content.poll_results aggregation
-- ---------------------------------------------------------------------
insert into content.poll_votes (poll_id, option_id, user_id)
values
  ('11223344-0000-0000-0000-000000000001', '11223344-0000-0000-0000-000000000011', 'ffffffff-0000-0000-0000-000000000002'),
  ('11223344-0000-0000-0000-000000000001', '11223344-0000-0000-0000-000000000011', 'ffffffff-0000-0000-0000-000000000003');

select is(
         (select vote_count from content.poll_results('11223344-0000-0000-0000-000000000001')
          where option_id = '11223344-0000-0000-0000-000000000011'),
         2::bigint,
         'poll_results tallies votes for the chosen option correctly'
       );

select is(
         (select vote_count from content.poll_results('11223344-0000-0000-0000-000000000001')
          where option_id = '11223344-0000-0000-0000-000000000012'),
         0::bigint,
         'poll_results reports zero for an option with no votes'
       );

select is(
         (select count(*)::int from content.poll_results('11223344-0000-0000-0000-000000000001')),
         2,
         'poll_results returns exactly one row per option'
       );

-- ---------------------------------------------------------------------
-- content.create_faq_item_with_translations
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}';

select ok(
         (select content.create_faq_item_with_translations(
                   'billing',
                   1,
                   '{"en": {"question": "Is it free?", "answer": "Yes."}, "tr": {"question": "Ücretsiz mi?", "answer": "Evet."}}'::jsonb
                 )) is not null,
         'create_faq_item_with_translations returns a new id for a moderator'
       );

select is(
         (
           select t.question
           from content.faq_translations t
                  join content.faq_items i on i.id = t.faq_item_id
           where i.category = 'billing' and t.locale = 'en'
           order by i.created_at desc
           limit 1
         ),
         'Is it free?',
         'create_faq_item_with_translations writes the given question/answer per locale'
       );

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$ select content.create_faq_item_with_translations(
    'should-fail', 0, '{"en": {"question": "Q", "answer": "A"}}'::jsonb
  ) $$,
         '42501',
         null,
         'create_faq_item_with_translations rejects a non-moderator'
       );

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_like(
         $$ select content.create_faq_item_with_translations('billing', 0, '{}'::jsonb) $$,
         '%at least one translation%',
         'create_faq_item_with_translations rejects an empty translations object'
       );

reset role;

-- ---------------------------------------------------------------------
-- content.events: events_ends_at_after_starts_at check constraint
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_like(
         $$ insert into content.events (title, slug, description, starts_at, ends_at, author_id)
     values ('Bad Event', 'func-test-bad-event', 'desc', now(), now() - interval '1 hour', 'ffffffff-0000-0000-0000-000000000001') $$,
         '%events_ends_at_after_starts_at%',
         'events rejects ends_at before starts_at'
       );

reset role;

select * from finish();
rollback;
