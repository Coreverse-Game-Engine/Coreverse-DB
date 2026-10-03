# Events

| Method   | Path                | Auth                                  | Does                                                                |
|----------|---------------------|---------------------------------------|---------------------------------------------------------------------|
| `GET`    | `/events`           | Public (published only)               | List events, filterable by `status` (moderators) and `upcoming`     |
| `GET`    | `/events/{eventId}` | Public (published) / Required (draft) | Fetch one event by uuid `id` or `slug`                              |
| `POST`   | `/events`           | Required (moderator/admin)            | Create an event as a draft                                          |
| `PATCH`  | `/events/{eventId}` | Required (moderator/admin)            | Edit an event, including publishing it                              |
| `DELETE` | `/events/{eventId}` | Required (moderator/admin)            | Delete an event                                                     |

Events follow the same lifecycle and visibility rules as [News](news.md): a moderator or admin creates a `draft`, edits it, and publishes it through `PATCH`; anonymous callers only ever see `published` rows, while a draft is visible to its author and to moderators/admins. Write access is gated by `identity.is_platform_moderator()`, and — as with news — the RLS policies are split into an `anon` and an `authenticated` read policy so anonymous callers never trigger that check. See [Database › Domains › Content](../../database/domains/content.md).

`GET /events` is cursor-paginated (`?limit=&?cursor=`, response is `{ items, next_cursor }`) — see [Conventions › Pagination](../conventions.md#pagination). Results are ordered **newest-created first**, like every other keyset-paginated list, *not* by `starts_at`. For "what's coming up" pass `?upcoming=true`, which keeps only events whose `starts_at` is in the future; it narrows the same newest-created-first listing rather than re-sorting it.

Every item carries a nested `author` (`{ id, username, avatar_url }`). `location` is free text (a venue name or `"Online"`), not a structured address. `ends_at` is optional; when present it must not be before `starts_at` (a violation is a `400`). `GET /events/{eventIdOrSlug}` accepts either the uuid `id` or the `slug`; `PATCH`/`DELETE` stay uuid-only. A slug that already exists returns `409` on create.

**No registration tracking.** Coreverse DB deliberately does not store registrations or attendees. `registration_url` is just an external link (a form, an event page) for the Website to render as a call-to-action.
