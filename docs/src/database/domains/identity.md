# Identity

The `identity` schema owns everything about who a user is and what they belong to: profiles, teams, team membership, membership requests, and project archives.

## Tables

- **`profiles`** — one row per `auth.users` row, created automatically on signup (see [Triggers](../triggers.md)). Never stores a password — that's entirely Supabase Auth's responsibility. Carries both a free-text `full_name` and a unique, auto-derived `username` (see [Tables › Profiles](../tables/profiles.md)).
- **`teams`** — deliberately has **no `owner_id` column**. The current owner is derived from `team_members.role = 'owner'` instead, so ownership transfer is just a role change on an existing row rather than a separate migration of a foreign key.
- **`team_members`** — the `(team_id, user_id)` membership rows, with a `role` of `owner`, `admin`, or `member`. A unique partial index enforces **at most one owner per team**.
- **`team_membership_requests`** — a single table backing three different bidirectional flows (see below), disambiguated by `type`.
- **`projects`** — user-uploaded project archive metadata; the archive file itself lives in Supabase Storage (see [Storage Security](../../security/storage-security.md)).
- **`platform_roles`** (introduced by the content-domain migration, but scoped to `identity`) — platform-wide `admin`/`moderator` roles, unrelated to team roles, gating who can write `content.news` and moderate `content.discussions`/`content.polls`.

See [Tables › Profiles](../tables/profiles.md), [Tables › Teams](../tables/teams.md), and [Tables › Projects](../tables/projects.md) for column-level detail.

## The membership-request state machine

`team_membership_requests.type` covers three distinct flows through one table:

| Type                 | Initiated by             | Decided by                      |
|----------------------|--------------------------|---------------------------------|
| `join_request`       | The user wanting to join | A team owner/admin              |
| `invite`             | A team owner/admin       | The invited user                |
| `ownership_transfer` | The current owner        | The target user (member or not) |

A unique partial index allows **at most one pending request per `(team, user)`**, regardless of type, and the initiator can always cancel their own request while it's still `pending`. See [Functions › Identity](../functions/identity.md) for the full set of state-transition functions (`request_to_join`, `invite_to_team`, `offer_ownership`, `cancel_request`, `respond_to_join_request`, `respond_to_invite`, `respond_to_ownership_transfer`) and the team-management functions (`promote_to_admin`, `demote_to_member`, `remove_member`, `leave_team`).

## The 30-member cap

A `before insert` trigger on `team_members` (`identity.enforce_team_capacity`) rejects a new member once a team already has 30, raising a `check_violation`. This is enforced at the database layer specifically so it can't be bypassed by any future write path that isn't the Edge Function.

## Rate limiting

`identity.rate_limit_hits` + `identity.hit_rate_limit()` (added in `20260912085602_avatar_upload_and_rate_limit.sql`) is a generic, service-role-only fixed-window rate limiter, not specific to any one endpoint. It currently backs `POST /auth/password-reset` (see [API › Auth](../../api/resources/auth.md)); any future public, abuse-prone endpoint can reuse it rather than inventing its own counter table. Rows are pruned lazily on write and via a daily `pg_cron` job.

## Legacy backfill

Before this package's `identity` domain existed, the Website ran its own signup-time schema directly (`public.profiles`, `public.handle_new_user()`). `20260912120000_backfill_legacy_identity.sql` backfills `identity.profiles` rows for any user who signed up before `trg_handle_new_auth_user` existed, and is idempotent — safe to re-run, and a no-op on an environment that never had the legacy schema. It does not drop the legacy objects themselves; that's a separate, manually-run step once each environment is confirmed clear of other consumers — see `supabase/maintenance/drop_legacy_identity_objects.sql`.

## Why membership logic is functions, not policies

Unlike `content`'s mostly-static authorization, `identity`'s team lifecycle is a genuine state machine — accepting an invite has to check the request's status, the target identity, team capacity, and perform the membership insert atomically. That's expressed as `SECURITY DEFINER` PL/pgSQL functions rather than RLS policies; RLS on these tables is read-oriented, and direct client writes to `teams`, `team_members`, and `team_membership_requests` are not granted at all.
