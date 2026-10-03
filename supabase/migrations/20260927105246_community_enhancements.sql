-- Phase 3 (Coreverse-DB v0.5.0 plan, community field gaps):
--   - content.discussions: denormalized reply_count / last_activity_at
--     (avoids an aggregate subquery on every list request), plus a
--     'simple'-config search_vector, same convention as
--     docs.pages.search_vector (see 20260831093008_create_docs_domain.sql).
--   - content.discussion_replies: edited_at, set by the edge function
--     only when `body` actually changes (not on soft-delete), distinct
--     from updated_at which the existing set_updated_at trigger touches
--     on *any* update including soft-delete.
--   - content.discussion_categories(): distinct categories + counts,
--     for a filter UI. Not SECURITY DEFINER -- runs as the caller, same
--     RLS as a normal `select category from discussions` would.
--   - content.news: summary / cover_image_path, both nullable (optional
--     fields, not required to already exist on old rows).

alter table content.discussions
  add column reply_count integer not null default 0,
  add column last_activity_at timestamptz not null default now(),
  add column search_vector tsvector generated always as
    (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')))
    stored;

comment on column content.discussions.reply_count is
  'Count of non-deleted replies. Maintained by trg_discussion_replies_count, '
    'not recomputed per-request.';
comment on column content.discussions.last_activity_at is
  'Bumped to a reply''s created_at when it''s inserted. NOT bumped by '
    'reply edits or soft-deletes -- this tracks "last new reply", not '
    '"last write to this thread".';

create index idx_discussions_search on content.discussions using gin (search_vector);
create index idx_discussions_last_activity on content.discussions (last_activity_at desc);
create index idx_discussions_reply_count on content.discussions (reply_count desc);

-- One-time backfill for rows that existed before reply_count /
-- last_activity_at did. New rows get correct values from the trigger
-- below going forward.
update content.discussions d
set
  reply_count = coalesce((
                           select count(*) from content.discussion_replies as r
                           where r.discussion_id = d.id and r.deleted_at is null
                         ), 0),
  last_activity_at = greatest(d.created_at, coalesce((
                                                       select max(r.created_at) from content.discussion_replies as r
                                                       where r.discussion_id = d.id
                                                     ), d.created_at));

alter table content.discussion_replies
  add column edited_at timestamptz;

comment on column content.discussion_replies.edited_at is
  'Set by the discussions edge function when body is edited (not on '
    'soft-delete). null if the reply has never been edited.';

create function content.trg_discussion_replies_count()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update content.discussions
    set reply_count = reply_count + 1,
        last_activity_at = new.created_at
    where id = new.discussion_id;
    return new;
  end if;

  -- Soft-delete transition (deleted_at null -> not null): the reply
  -- drops out of the "active" count. An edit (body change, deleted_at
  -- still null) doesn't hit this branch at all -- reply_count only
  -- reacts to the deleted_at column specifically, via the trigger's
  -- own WHEN clause below.
  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    update content.discussions
    set reply_count = greatest(reply_count - 1, 0)
    where id = new.discussion_id;
  end if;
  return new;
end;
$$;

comment on function content.trg_discussion_replies_count() is
  'Keeps discussions.reply_count / last_activity_at in sync with '
    'discussion_replies, so list endpoints don''t need a per-row aggregate.';

alter function content.trg_discussion_replies_count() owner to postgres;

create trigger trg_discussion_replies_count_insert
  after insert on content.discussion_replies
  for each row
execute function content.trg_discussion_replies_count();

create trigger trg_discussion_replies_count_delete
  after update of deleted_at on content.discussion_replies
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
execute function content.trg_discussion_replies_count();

create function content.discussion_categories()
  returns table (category text, count bigint)
  language sql
  stable
as $$
select d.category, count(*)
from content.discussions d
where d.category is not null
group by d.category
order by count(*) desc, d.category asc;
$$;

comment on function content.discussion_categories() is
  'Distinct discussion categories with counts, for a filter UI. Not '
    'SECURITY DEFINER -- runs with the caller''s own privileges, same as '
    'a plain `select category from discussions` (discussions_public_read '
    'already grants anon+authenticated select).';

grant execute on function content.discussion_categories() to anon, authenticated;

-- Batch total-vote-count for GET /polls, same trust level as the
-- existing content.poll_results(p_poll_id) (SECURITY DEFINER,
-- aggregate-only, no per-user data exposed) -- just plural, so the
-- list endpoint isn't making one RPC call per poll on the page.
create function content.poll_vote_totals(p_poll_ids uuid[])
  returns table (poll_id uuid, total_votes bigint)
  language sql
  stable
  security definer
  set search_path = content, public
as $$
select v.poll_id, count(*)
from content.poll_votes v
where v.poll_id = any (p_poll_ids)
group by v.poll_id;
$$;

comment on function content.poll_vote_totals(uuid[]) is
  'Batch version of the per-poll count in poll_results(), for GET /polls '
    'listing several polls at once. Aggregate-only, same as poll_results.';

alter function content.poll_vote_totals(uuid[]) owner to postgres;
revoke all on function content.poll_vote_totals(uuid[]) from public;
grant execute on function content.poll_vote_totals(uuid[]) to anon, authenticated;

alter table content.news
  add column summary text,
  add column cover_image_path text;

comment on column content.news.summary is
  'Optional short standalone summary, distinct from the article body -- '
    'for list views and link previews. Not auto-derived from body.';
comment on column content.news.cover_image_path is
  'Storage path in a public bucket (mirrors profiles.avatar_path), not a '
    'URL -- the edge function resolves it to a public URL same as avatars.';

-- ---------------------------------------------------------------------
-- news-covers: public bucket for content.news.cover_image_path.
--
-- Unlike avatars (self-write, flat {user_id}.png), write access here
-- is moderator/admin-only, matching news' own RLS
-- (identity.is_platform_moderator()) -- so a raw path in
-- CreateNewsSchema/UpdateNewsSchema isn't the same "arbitrary storage
-- object" hazard avatar_path was on PATCH /profiles/me before the Phase 1
-- fix (supabase/functions/profiles/schemas.ts): that endpoint was
-- writable by any authenticated user about their own profile, this one
-- already requires an elevated, trusted role to write at all.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('news-covers', 'news-covers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy news_covers_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'news-covers');

create policy news_covers_moderator_write
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'news-covers' and identity.is_platform_moderator());

create policy news_covers_moderator_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'news-covers' and identity.is_platform_moderator())
  with check (bucket_id = 'news-covers' and identity.is_platform_moderator());

create policy news_covers_moderator_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'news-covers' and identity.is_platform_moderator());
