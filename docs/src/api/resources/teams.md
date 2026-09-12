# Teams

| Method | Path | Auth | Does |
|---|---|---|---|
| `POST` | `/teams` | Required | Create a team; caller becomes owner |
| `PATCH` | `/teams/{teamId}` | Required | Rename a team (owner/admin) |
| `DELETE` | `/teams/{teamId}` | Required | Delete a team (owner only) |
| `GET` | `/teams/{teamId}/members` | Required | List a team's members |
| `PATCH` | `/teams/{teamId}/members/{userId}` | Required | Promote, demote, or remove a member (see role rules below) |
| `POST` | `/teams/{teamId}/join-requests` | Required | Request to join a team |
| `POST` | `/teams/{teamId}/invites` | Required | Invite a specific user (owner/admin only) |
| `POST` | `/teams/{teamId}/ownership-transfer` | Required | Offer ownership to a user (owner only; target's consent required) |
| `POST` | `/teams/{teamId}/leave` | Required | Leave a team (the owner cannot leave without transferring ownership first) |

## Role rules for `PATCH /teams/{teamId}/members/{userId}`

- **Owner** can promote a member to admin, demote an admin to member, or remove any member/admin.
- **Admin** can promote a member to admin, or remove members — but cannot affect other admins or the owner.

See [Database › Functions › Identity](../../database/functions/identity.md) for the underlying functions and [Database › Domains › Identity](../../database/domains/identity.md) for the full membership state machine, including the 30-member cap and the 3-day auto-expiry of unanswered requests/invites.
