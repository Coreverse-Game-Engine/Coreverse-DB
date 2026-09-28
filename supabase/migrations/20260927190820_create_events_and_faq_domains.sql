-- Faz 4 (Coreverse-DB v0.5.0 plan): two new, independent content
-- domains -- events and faq.
--
-- Design notes:
--   * content.events is deliberately modeled on content.news (same
--     draft/published lifecycle, same moderator-only write via
--     identity.is_platform_moderator(), same public/authenticated RLS
--     split, same id-or-slug GET) rather than on content.discussions --
--     per the original report, events are moderator-curated
--     announcements, not user-generated threads. Registration is via
--     an external registration_url; there is deliberately no
--     registration/attendee tracking table in this domain (see the
--     original Faz 3 plan notes).
--   * content.events keeps keyset pagination ordered by (created_at,
--     id), same as every other list endpoint in this domain (see
--     _shared/pagination.ts) -- NOT ordered by starts_at. The shared
--     pagination helper hardcodes the created_at column name in its
--     cursor filter, so reusing it for "upcoming events" ordering
--     would silently paginate incorrectly. An ?upcoming=true filter is
--     offered instead (starts_at >= now()), combined with the normal
--     created_at-ordered page.
--   * FAQ is the first translated content in this domain (unlike news/
--     events, which are single-locale per the original report). It's
--     modeled as a parent content.faq_items row (locale-independent:
--     category, display_order) plus one content.faq_translations row
--     per locale (question, answer) -- not a jsonb blob on the parent,
--     so a single-locale edit is a plain single-row upsert rather than
--     a read-modify-write of a blob, and so per-locale completeness
--     ("which locales still need translating") is a plain query
--     instead of jsonb key inspection.
--   * faq_translations.locale is constrained to the same set as
--     supabase/functions/_shared/locales.ts's WEBSITE_LOCALES. That
--     list is duplicated here (SQL can't import a TS const) -- if the
--     Website adds/removes a locale, both need updating, same
--     maintenance burden the comment on locales.ts already documents
--     for auth/send-email.
--   * FAQ has no draft/published status: unlike news/events it isn't
--     time-sensitive editorial content, it's closer to a living
--     reference page, and no draft workflow was in the original
--     report. All faq_items/faq_translations rows are public; write
--     stays moderator/admin-only via the same RLS predicate as
--     news/events/polls.

-- ---------------------------------------------------------------------
-- content.events
-- ---------------------------------------------------------------------

create table content.events (
                              id uuid primary key default gen_random_uuid(),
                              title text not null,
                              slug text not null unique,
                              description text not null,
                              location text,
                              starts_at timestamptz not null,
                              ends_at timestamptz,
                              registration_url text,
                              author_id uuid not null references identity.profiles (id),
                              status text not null default 'draft'
                                check (status in ('draft', 'published')),
                              published_at timestamptz,
                              created_at timestamptz not null default now(),
                              updated_at timestamptz not null default now(),
                              constraint events_ends_at_after_starts_at
                                check (ends_at is null or ends_at >= starts_at)
);

comment on column content.events.registration_url is
  'External registration link (e.g. an eventbrite/lu.ma/form URL). '
    'Coreverse-DB deliberately does not track registrations/attendees '
    'itself -- see the Faz 3 plan notes this domain was scoped from.';

create index idx_events_status
  on content.events (status);

create index idx_events_starts_at
  on content.events (starts_at);

create trigger trg_events_updated_at
  before update on content.events
  for each row
execute function content.set_updated_at();

alter table content.events enable row level security;

-- Same public/authenticated split as news, for the same reason: anon
-- must never reach identity.is_platform_moderator() (no SELECT grant
-- on identity.platform_roles for anon).
create policy events_public_read
  on content.events
  for select
  to anon
  using (
  status = 'published'
  );

create policy events_authenticated_read
  on content.events
  for select
  to authenticated
  using (
  status = 'published'
    or author_id = auth.uid()
    or identity.is_platform_moderator()
  );

create policy events_moderator_insert
  on content.events
  for insert
  to authenticated
  with check (
  identity.is_platform_moderator()
    and author_id = auth.uid()
  );

create policy events_moderator_update
  on content.events
  for update
  to authenticated
  using (
  identity.is_platform_moderator()
  )
  with check (
  identity.is_platform_moderator()
  );

create policy events_moderator_delete
  on content.events
  for delete
  to authenticated
  using (
  identity.is_platform_moderator()
  );

grant select on content.events
  to anon, authenticated;

grant insert, update, delete on content.events
  to authenticated;

-- ---------------------------------------------------------------------
-- content.faq_items / content.faq_translations
-- ---------------------------------------------------------------------

create table content.faq_items (
                                 id uuid primary key default gen_random_uuid(),
                                 category text,
                                 display_order int not null default 0,
                                 created_by uuid not null references identity.profiles (id),
                                 created_at timestamptz not null default now(),
                                 updated_at timestamptz not null default now()
);

create index idx_faq_items_category
  on content.faq_items (category);

create index idx_faq_items_display_order
  on content.faq_items (display_order);

create table content.faq_translations (
                                        faq_item_id uuid not null
                                          references content.faq_items (id)
                                            on delete cascade,
                                        locale text not null
                                          check (locale in (
                                                            'en', 'tr', 'fr', 'de', 'es', 'pt',
                                                            'cn', 'ru', 'jp', 'kr', 'pl', 'in', 'sa'
                                            )),
                                        question text not null,
                                        answer text not null,
                                        created_at timestamptz not null default now(),
                                        updated_at timestamptz not null default now(),
                                        primary key (faq_item_id, locale)
);

comment on constraint faq_translations_locale_check on content.faq_translations is
  'Mirrors supabase/functions/_shared/locales.ts WEBSITE_LOCALES -- keep '
    'both in sync if the Website adds/removes a locale.';

create trigger trg_faq_items_updated_at
  before update on content.faq_items
  for each row
execute function content.set_updated_at();

create trigger trg_faq_translations_updated_at
  before update on content.faq_translations
  for each row
execute function content.set_updated_at();

alter table content.faq_items enable row level security;
alter table content.faq_translations enable row level security;

-- No anon/authenticated split needed here (unlike news/events) --
-- faq_items/faq_translations carry no draft state, so there's nothing
-- for is_platform_moderator() to gate on read; both roles get the same
-- unconditional read policy.
create policy faq_items_public_read
  on content.faq_items
  for select
  to anon, authenticated
  using (true);

create policy faq_items_moderator_insert
  on content.faq_items
  for insert
  to authenticated
  with check (
  identity.is_platform_moderator()
    and created_by = auth.uid()
  );

create policy faq_items_moderator_update
  on content.faq_items
  for update
  to authenticated
  using (identity.is_platform_moderator())
  with check (identity.is_platform_moderator());

create policy faq_items_moderator_delete
  on content.faq_items
  for delete
  to authenticated
  using (identity.is_platform_moderator());

create policy faq_translations_public_read
  on content.faq_translations
  for select
  to anon, authenticated
  using (true);

create policy faq_translations_moderator_insert
  on content.faq_translations
  for insert
  to authenticated
  with check (identity.is_platform_moderator());

create policy faq_translations_moderator_update
  on content.faq_translations
  for update
  to authenticated
  using (identity.is_platform_moderator())
  with check (identity.is_platform_moderator());

create policy faq_translations_moderator_delete
  on content.faq_translations
  for delete
  to authenticated
  using (identity.is_platform_moderator());

grant select on content.faq_items
  to anon, authenticated;

grant insert, update, delete on content.faq_items
  to authenticated;

grant select on content.faq_translations
  to anon, authenticated;

grant insert, update, delete on content.faq_translations
  to authenticated;

-- ---------------------------------------------------------------------
-- content.create_faq_item_with_translations
--
-- Same rationale as content.create_poll_with_options (see
-- 20260830151432_create_content_domain.sql): a faq_item is meaningless
-- without at least one translation, and PostgREST can't do a
-- multi-table transactional insert in one call.
-- ---------------------------------------------------------------------

create or replace function content.create_faq_item_with_translations(
  p_category text,
  p_display_order int,
  p_translations jsonb -- { "<locale>": { "question": "...", "answer": "..." }, ... }
)
  returns uuid
  language plpgsql
  security definer
  set search_path = content, identity, public
as $$
declare
  v_faq_item_id uuid;
  v_locale text;
begin
  if not identity.is_platform_moderator() then
    raise exception
      'only a moderator or admin can create faq items'
      using errcode = '42501';
  end if;

  if p_translations is null or jsonb_typeof(p_translations) != 'object'
    or (select count(*) from jsonb_object_keys(p_translations)) < 1 then
    raise exception 'at least one translation is required';
  end if;

  insert into content.faq_items (
    category,
    display_order,
    created_by
  )
  values (
           p_category,
           coalesce(p_display_order, 0),
           auth.uid()
         )
  returning id into v_faq_item_id;

  for v_locale in select jsonb_object_keys(p_translations) loop
      insert into content.faq_translations (
        faq_item_id,
        locale,
        question,
        answer
      )
      values (
               v_faq_item_id,
               v_locale,
               p_translations -> v_locale ->> 'question',
               p_translations -> v_locale ->> 'answer'
             );
    end loop;

  return v_faq_item_id;
end;
$$;

grant execute on function content.create_faq_item_with_translations(
  text,
  int,
  jsonb
  ) to authenticated;
