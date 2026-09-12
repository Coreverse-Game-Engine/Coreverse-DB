# `identity.teams`, `team_members`, `team_membership_requests`

## `identity.teams`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `name` | `text` | |
| `created_by` | `uuid` | References `identity.profiles(id)` |
| `created_at` / `updated_at` | `timestamptz` | |

**No `owner_id` column by design** — the current owner is read from `team_members.role = 'owner'`. **RLS:** only current members may `select` a team (`private.is_team_member(id)`).

## `identity.team_members`

| Column | Type | Notes |
|---|---|---|
| `team_id` | `uuid` | Part of composite PK; references `teams(id)`, `on delete cascade` |
| `user_id` | `uuid` | Part of composite PK; references `profiles(id)`, `on delete cascade` |
| `role` | `text` | `owner` \| `admin` \| `member` |
| `joined_at` | `timestamptz` | |

A unique partial index (`role = 'owner'`) enforces at most one owner per team. A `before insert` trigger enforces the 30-member cap. **RLS:** only members of the team may `select` its membership rows.

## `identity.team_membership_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `team_id` | `uuid` | References `teams(id)`, cascade |
| `user_id` | `uuid` | The target of the request |
| `type` | `text` | `join_request` \| `invite` \| `ownership_transfer` |
| `initiated_by` | `uuid` | Who created the request |
| `status` | `text` | `pending` (default) \| `accepted` \| `rejected` \| `cancelled` |
| `requested_at` / `decided_at` | `timestamptz` | |
| `decided_by` | `uuid`, nullable | Who accepted/rejected it |

A unique partial index (`status = 'pending'`) allows at most one pending request per `(team, user)` regardless of type. **RLS:** visible to the target user, the initiator, or a team owner/admin.

See [Domains › Identity](../domains/identity.md) for the state machine this table implements, [Functions › Identity](../functions/identity.md) for the functions that write to these three tables, and [API › Teams](../../api/resources/teams.md) / [API › Requests](../../api/resources/requests.md) for the HTTP surface.
