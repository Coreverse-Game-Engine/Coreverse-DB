-- Phase 5 (Coreverse-DB v0.5.0 plan): account/profile/email.
--
-- This migration is the "account" piece: DELETE /profiles/me (added in
-- the profiles function) needs identity.profiles to actually be
-- deletable, and as shipped it mostly isn't. Every FK below was
-- checked by reading the original create_identity_domain /
-- create_content_domain migrations directly (not assumed): none of
-- them had an ON DELETE clause, which in Postgres defaults to NO
-- ACTION -- i.e. deleting a profile with ANY row referencing it, in
-- ANY of these tables, currently fails outright with a 23503 foreign
-- key violation. In practice that's not a rare edge case: every user
-- who has ever voted in a poll, requested to join a team, or had their
-- invite decided by someone, has at least one such row -- so almost no
-- account could actually be deleted today.
--
-- This migration only loosens the FKs that are safe to loosen without
-- making a product decision on this team's behalf:
--
--   * content.poll_votes.user_id -> ON DELETE CASCADE. A vote is a
--     personal record with no structural role -- content.poll_vote_totals()
--     is an aggregate count, not an attributed list, so losing a
--     deleted user's individual vote rows changes nothing anyone else
--     can see.
--   * identity.team_membership_requests.initiated_by and .decided_by
--     -> ON DELETE SET NULL (decided_by was already nullable;
--     initiated_by's NOT NULL is dropped here). These columns record
--     *who* acted on a request, not the request itself (team_id,
--     user_id, type, status, timestamps all stay put) -- same "actor
--     deleted, record stays" shape as discussion_replies.deleted_at
--     already uses elsewhere in this schema.
--   * identity.teams.created_by -> ON DELETE SET NULL (NOT NULL
--     dropped). Per this table's own existing comment ("No owner_id
--     column by design -- current owner is read from
--     team_members.role = owner"), created_by is documented as
--     historical metadata, not the live ownership record -- nulling it
--     doesn't touch who currently owns the team.
--
-- Deliberately NOT touched here, because resolving them requires a
-- product decision this migration shouldn't make unilaterally (same
-- reasoning as Phase 3's deferred report/complaint mechanism and poll
-- vote-changing):
--
--   * identity.team_members where role = 'owner': not an FK problem at
--     all (team_id/user_id both already cascade) -- a sole owner's
--     account deletion would silently leave their team with zero
--     owner rows. DELETE /profiles/me's precondition check below
--     blocks this itself (by querying team_members directly) rather
--     than relying on this migration.
--   * identity.projects.owner_id, content.news/events.author_id,
--     content.faq_items.created_by, content.discussions/
--     discussion_replies.author_id, content.polls.created_by: these
--     are the actual "who made this" field the API surfaces back to
--     every reader (see fetchAuthors()/withAuthor() across the content
--     functions) -- nulling them on account deletion would silently
--     break every "by {author}" display for existing content. Still
--     intentionally blocking; DELETE /profiles/me surfaces these as
--     named blockers instead of a raw 23503.

alter table content.poll_votes
  drop constraint poll_votes_user_id_fkey,
  add constraint poll_votes_user_id_fkey
    foreign key (user_id) references identity.profiles (id)
      on delete cascade;

alter table identity.team_membership_requests
  alter column initiated_by drop not null;

alter table identity.team_membership_requests
  drop constraint team_membership_requests_initiated_by_fkey,
  add constraint team_membership_requests_initiated_by_fkey
    foreign key (initiated_by) references identity.profiles (id)
      on delete set null;

alter table identity.team_membership_requests
  drop constraint team_membership_requests_decided_by_fkey,
  add constraint team_membership_requests_decided_by_fkey
    foreign key (decided_by) references identity.profiles (id)
      on delete set null;

alter table identity.teams
  alter column created_by drop not null;

alter table identity.teams
  drop constraint teams_created_by_fkey,
  add constraint teams_created_by_fkey
    foreign key (created_by) references identity.profiles (id)
      on delete set null;
