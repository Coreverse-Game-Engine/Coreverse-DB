# Identity

The `identity` schema owns everything about who a user is and what they belong to: profiles, teams, team membership, membership requests, and project archives.

## Tables

- **`profiles`** — one row per `auth.users` row, created automatically on signup (see [Triggers](../triggers.md)). Never stores a password — that's entirely Supabase Auth's responsibility.
- **`teams`** — deliberately has **no `owner_id` column**. The current owner is derived from `team_members.role = 'owner'` instead, so ownership transfer is just a role change on an existing row rather than a separate migration of a foreign key.
- **`team_members`** — the `(team_id, user_id)` membership rows, with a `role` of `owner`, `admin`, or `member`. A unique partial index enforces **at most one owner per team**.
- **`team_membership_requests`** — a single table backing three different bidirectional flows (see below), disambiguated by `type`.
- **`projects`** — user-uploaded project archive metadata; the archive file itself lives in Supabase Storage (see [Storage Security](../../security/storage-security.md)).
- **`platform_roles`** (introduced by the content-domain migration, but scoped to `identity`) — platform-wide `admin`/`moderator` roles, unrelated to team roles, gating who can write `content.news` and moderate `content.discussions`/`content.polls`.
- **`rate_limit_hits`** — a generic fixed-window rate-limit counter, added by `20260912085602_avatar_upload_and_rate_limit.sql` (see below). No client access at all, not even read; every interaction goes through `identity.hit_rate_limit()`.

See [Tables › Profiles](../tables/profiles.md), [Tables › Teams](../tables/teams.md), and [Tables › Projects](../tables/projects.md) for column-level detail.

## The membership-request state machine

`team_membership_requests.type` covers three distinct flows through one table:

| Type | Initiated by | Decided by |
|---|---|---|
| `join_request` | The user wanting to join | A team owner/admin |
| `invite` | A team owner/admin | The invited user |
| `ownership_transfer` | The current owner | The target user (member or not) |

A unique partial index allows **at most one pending request per `(team, user)`**, regardless of type, and the initiator can always cancel their own request while it's still `pending`. See [Functions › Identity](../functions/identity.md) for the full set of state-transition functions (`request_to_join`, `invite_to_team`, `offer_ownership`, `cancel_request`, `respond_to_join_request`, `respond_to_invite`, `respond_to_ownership_transfer`) and the team-management functions (`promote_to_admin`, `demote_to_member`, `remove_member`, `leave_team`).

## The 30-member cap

A `before insert` trigger on `team_members` (`identity.enforce_team_capacity`) rejects a new member once a team already has 30, raising a `check_violation`. This is enforced at the database layer specifically so it can't be bypassed by any future write path that isn't the Edge Function.

## Why membership logic is functions, not policies

Unlike `content`'s mostly-static authorization, `identity`'s team lifecycle is a genuine state machine — accepting an invite has to check the request's status, the target identity, team capacity, and perform the membership insert atomically. That's expressed as `SECURITY DEFINER` PL/pgSQL functions rather than RLS policies; RLS on these tables is read-oriented, and direct client writes to `teams`, `team_members`, and `team_membership_requests` are not granted at all.

## Generic rate limiting

`identity.hit_rate_limit(p_key, p_max_hits, p_window_seconds)` is a small, deliberately reusable fixed-window rate limiter: given an arbitrary caller-chosen `key`, it prunes expired hits for that key, counts what's left, and either records a new hit (returning `true`) or refuses (returning `false`) if the window is already at capacity. It's `SECURITY DEFINER` and granted only to `service_role` — the first (and so far only) consumer is the unauthenticated `POST /auth/password-reset` endpoint, which has no user JWT to run it as `authenticated` the way `identity`'s other `SECURITY DEFINER` functions do (see [API › Auth](../../api/resources/auth.md)). Expired hits are pruned both lazily (on every call) and by a daily `pg_cron` job that deletes anything older than a day, well past any window currently in use.

The primitive was added specifically so a *future* public, abuse-prone endpoint can reuse it rather than growing its own bespoke counter table.

## Signup metadata fallback

`identity.handle_new_auth_user()` (see [Triggers](../triggers.md)) reads `full_name` from signup metadata, falling back to a `username` key if `full_name` is absent or empty, and to `''` if neither is present. This fallback is transitional, covering client callers still migrating to the newer signup payload shape.
