# Identity Functions

All of these are `SECURITY DEFINER` PL/pgSQL functions in the `identity` schema. Each performs its own authorization check and raises an exception (mapped to HTTP 403/400 by the Edge Function) rather than relying on RLS, since the underlying tables (`teams`, `team_members`, `team_membership_requests`) grant no direct write access to `anon`/`authenticated`.

## Team lifecycle

| Function | Signature | Does |
|---|---|---|
| `create_team` | `(p_name text) → uuid` | Creates a team and inserts the caller as `owner` |
| `rename_team` | `(p_team_id uuid, p_name text)` | Renames a team; caller must be owner/admin |
| `delete_team` | `(p_team_id uuid)` | Deletes a team; caller must be owner |
| `leave_team` | `(p_team_id uuid)` | Removes the caller from a team; the owner cannot leave without transferring ownership first |

## Membership requests (create side)

| Function | Signature | Does |
|---|---|---|
| `request_to_join` | `(p_team_id uuid) → uuid` | Creates a `join_request` from the caller |
| `invite_to_team` | `(p_team_id uuid, p_user_id uuid) → uuid` | Owner/admin creates an `invite` for a user |
| `offer_ownership` | `(p_team_id uuid, p_user_id uuid) → uuid` | Owner creates an `ownership_transfer` targeting any user (member or not) |
| `cancel_request` | `(p_request_id uuid)` | The original initiator withdraws their own pending request |

## Membership requests (respond side)

| Function | Signature | Does |
|---|---|---|
| `respond_to_join_request` | `(p_request_id uuid, p_decision text)` | Owner/admin accepts or rejects a join request |
| `respond_to_invite` | `(p_request_id uuid, p_decision text)` | Invited user accepts or rejects |
| `respond_to_ownership_transfer` | `(p_request_id uuid, p_decision text)` | Target accepts or rejects; on accept, if the target wasn't already a member and the team is at its 30-cap, the previous owner is evicted to make room — if the target was already a member, it's a pure role swap with no eviction |

## Team management (owner/admin actions on existing members)

| Function | Signature | Does |
|---|---|---|
| `promote_to_admin` | `(p_team_id uuid, p_target uuid)` | Owner promotes a member to admin |
| `demote_to_member` | `(p_team_id uuid, p_target uuid)` | Owner demotes an admin to member |
| `remove_member` | `(p_team_id uuid, p_target uuid)` | Owner can remove any member/admin; an admin can remove members only — not other admins or the owner |

## Rules encoded across these functions

- At most one **pending** request per `(team, user)` — enforced by a unique partial index, so a conflicting create raises a constraint violation rather than a silent duplicate.
- An **owner cannot self-demote or leave** without transferring ownership to someone else first (`leave_team` rejects the owner; ownership must move via `offer_ownership` → `respond_to_ownership_transfer`).
- **Requests idle for 3 days are auto-deleted** (a scheduled cleanup, not one of these request-response functions themselves).
- The 30-member cap is enforced by a trigger, not by these functions — see [Triggers](../triggers.md).

See [Domains › Identity](../domains/identity.md) for the design rationale and [API › Teams](../../api/resources/teams.md) / [API › Requests](../../api/resources/requests.md) for how these are exposed over HTTP.

## Helper functions (`private` schema)

`private.is_team_member(_team_id)` and `private.is_team_admin(_team_id)` are `SECURITY DEFINER`, `set row_security = off` predicates used inside RLS policies on `teams`, `team_members`, and `team_membership_requests`. See [Row Level Security](../../security/rls.md) for why they must live outside the normal RLS path.
