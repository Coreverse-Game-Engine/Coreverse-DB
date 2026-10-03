-- RLS tests for the content domain.
-- Run with: supabase db test

begin;

select plan(24);

-- ---------------------------------------------------------------------
-- Fixture users: one moderator, one regular user, one outsider
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
values
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'content-mod@example.com',
    crypt('x', gen_salt('bf')),
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'content-user@example.com',
    crypt('x', gen_salt('bf')),
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dddddddd-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'content-other@example.com',
    crypt('x', gen_salt('bf')),
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

insert into identity.platform_roles (
  user_id,
  role
)
values (
         'dddddddd-0000-0000-0000-000000000001',
         'moderator'
       )
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- news: draft is hidden from the public, moderator-only write
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.news (
            title,
            slug,
            body,
            author_id,
            status
        )
        values (
            'RLS Test News',
            'rls-test-news',
            'body',
            'dddddddd-0000-0000-0000-000000000001',
            'draft'
        )
    $$,
         'a moderator can INSERT a draft news item'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select is_empty(
         $$
        select 1
        from content.news
        where slug = 'rls-test-news'
    $$,
         'anon cannot SELECT a draft news item'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$
        insert into content.news (
            title,
            slug,
            body,
            author_id,
            status
        )
        values (
            'Should Fail',
            'should-fail',
            'body',
            'dddddddd-0000-0000-0000-000000000002',
            'draft'
        )
    $$,
         '42501',
         null,
         'a non-moderator cannot INSERT news'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        update content.news
        set
            status = 'published',
            published_at = now()
        where slug = 'rls-test-news'
    $$,
         'a moderator can publish news'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select isnt_empty(
         $$
        select 1
        from content.news
        where slug = 'rls-test-news'
    $$,
         'anon can SELECT published news'
       );

reset role;

-- ---------------------------------------------------------------------
-- polls / poll_votes: public read, self-only vote visibility, one vote each
-- ---------------------------------------------------------------------

insert into content.polls (
  id,
  question,
  created_by
)
values (
         'eeeeeeee-0000-0000-0000-000000000001',
         'RLS test poll?',
         'dddddddd-0000-0000-0000-000000000001'
       );

insert into content.poll_options (
  id,
  poll_id,
  label
)
values (
         'eeeeeeee-0000-0000-0000-000000000002',
         'eeeeeeee-0000-0000-0000-000000000001',
         'Option A'
       );

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.poll_votes (
            poll_id,
            option_id,
            user_id
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000001',
            'eeeeeeee-0000-0000-0000-000000000002',
            'dddddddd-0000-0000-0000-000000000002'
        )
    $$,
         'a user can cast a vote for themselves'
       );

select throws_ok(
         $$
        insert into content.poll_votes (
            poll_id,
            option_id,
            user_id
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000001',
            'eeeeeeee-0000-0000-0000-000000000002',
            'dddddddd-0000-0000-0000-000000000003'
        )
    $$,
         '42501',
         null,
         'a user cannot cast a vote on someone else''s behalf'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}';

select is_empty(
         $$
        select 1
        from content.poll_votes
        where user_id = 'dddddddd-0000-0000-0000-000000000002'
    $$,
         'a user cannot SELECT another user''s individual vote'
       );

reset role;

-- ---------------------------------------------------------------------
-- discussions: author-or-moderator write, locked discussions block replies
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.discussions (
            id,
            title,
            body,
            author_id
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000003',
            'RLS test discussion',
            'body',
            'dddddddd-0000-0000-0000-000000000002'
        )
    $$,
         'a user can start a discussion as themselves'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}';

update content.discussions
set title = 'hijacked'
where id = 'eeeeeeee-0000-0000-0000-000000000003';

select is(
         (
           select title
           from content.discussions
           where id = 'eeeeeeee-0000-0000-0000-000000000003'
         ),
         'RLS test discussion',
         'a non-author, non-moderator cannot UPDATE someone else''s discussion'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        update content.discussions
        set is_locked = true
        where id = 'eeeeeeee-0000-0000-0000-000000000003'
    $$,
         'a moderator can lock someone else''s discussion'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$
        insert into content.discussion_replies (
            discussion_id,
            author_id,
            body
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000003',
            'dddddddd-0000-0000-0000-000000000002',
            'too late'
        )
    $$,
         '42501',
         null,
         'replying to a locked discussion is blocked'
       );

reset role;

-- ---------------------------------------------------------------------
-- events: draft is hidden from the public, moderator-only write
-- (same shape as news, above)
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.events (
            title,
            slug,
            description,
            starts_at,
            author_id,
            status
        )
        values (
            'RLS Test Event',
            'rls-test-event',
            'description',
            now() + interval '7 days',
            'dddddddd-0000-0000-0000-000000000001',
            'draft'
        )
    $$,
         'a moderator can INSERT a draft event'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select is_empty(
         $$
        select 1
        from content.events
        where slug = 'rls-test-event'
    $$,
         'anon cannot SELECT a draft event'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$
        insert into content.events (
            title,
            slug,
            description,
            starts_at,
            author_id,
            status
        )
        values (
            'Should Fail',
            'should-fail-event',
            'description',
            now() + interval '7 days',
            'dddddddd-0000-0000-0000-000000000002',
            'draft'
        )
    $$,
         '42501',
         null,
         'a non-moderator cannot INSERT an event'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        update content.events
        set
            status = 'published',
            published_at = now()
        where slug = 'rls-test-event'
    $$,
         'a moderator can publish an event'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select isnt_empty(
         $$
        select 1
        from content.events
        where slug = 'rls-test-event'
    $$,
         'anon can SELECT a published event'
       );

reset role;

-- ---------------------------------------------------------------------
-- faq_items / faq_translations: always public read (no draft state),
-- moderator-only write
-- ---------------------------------------------------------------------

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.faq_items (
            id,
            category,
            created_by
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000004',
            'billing',
            'dddddddd-0000-0000-0000-000000000001'
        )
    $$,
         'a moderator can INSERT a faq_item'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$
        insert into content.faq_items (
            category,
            created_by
        )
        values (
            'should-fail',
            'dddddddd-0000-0000-0000-000000000002'
        )
    $$,
         '42501',
         null,
         'a non-moderator cannot INSERT a faq_item'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select isnt_empty(
         $$
        select 1
        from content.faq_items
        where id = 'eeeeeeee-0000-0000-0000-000000000004'
    $$,
         'anon can SELECT a faq_item (no draft state to hide)'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
         $$
        insert into content.faq_translations (
            faq_item_id,
            locale,
            question,
            answer
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000004',
            'en',
            'Is it free?',
            'Yes.'
        )
    $$,
         'a moderator can INSERT a faq_translation'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
         $$
        insert into content.faq_translations (
            faq_item_id,
            locale,
            question,
            answer
        )
        values (
            'eeeeeeee-0000-0000-0000-000000000004',
            'tr',
            'Ücretsiz mi?',
            'Evet.'
        )
    $$,
         '42501',
         null,
         'a non-moderator cannot INSERT a faq_translation'
       );

reset role;

set local role anon;

set local "request.jwt.claims" to
  '{"role":"anon"}';

select isnt_empty(
         $$
        select 1
        from content.faq_translations
        where faq_item_id = 'eeeeeeee-0000-0000-0000-000000000004'
          and locale = 'en'
    $$,
         'anon can SELECT a faq_translation'
       );

reset role;

set local role authenticated;

set local "request.jwt.claims" to
  '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';

update content.faq_items
set category = 'hijacked'
where id = 'eeeeeeee-0000-0000-0000-000000000004';

select is(
         (
           select category
           from content.faq_items
           where id = 'eeeeeeee-0000-0000-0000-000000000004'
         ),
         'billing',
         'a non-moderator cannot UPDATE a faq_item'
       );

reset role;

select * from finish();

rollback;
