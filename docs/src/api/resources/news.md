# News

| Method   | Path             | Auth                                  | Does                                             |
|----------|------------------|---------------------------------------|--------------------------------------------------|
| `GET`    | `/news`          | Public (published only)               | List news, filterable by `status` for moderators |
| `GET`    | `/news/{newsId}` | Public (published) / Required (draft) | Fetch one article                                |
| `POST`   | `/news`          | Required (moderator/admin)            | Create an article                                |
| `PATCH`  | `/news/{newsId}` | Required (moderator/admin)            | Edit an article, including publishing it         |
| `DELETE` | `/news/{newsId}` | Required (moderator/admin)            | Delete an article                                |

`GET /news` is cursor-paginated (`?limit=&?cursor=`, response is `{ items, next_cursor }`) — see [Conventions › Pagination](../conventions.md#pagination). Every item carries a nested `author` (`{ id, username, avatar_url }`), an optional `summary` (a short standalone blurb, distinct from `body` — not auto-derived from it), and `cover_image_url` (resolved from `cover_image_path`, a Storage path in the `news-covers` bucket — moderator/admin-write only, same shape as avatars but without the self-serve upload route; a moderator sets `cover_image_path` directly through `PATCH`/`POST`, which is safe here specifically because news writes are already role-gated, unlike `avatar_path` on `PATCH /profiles/me` pre-Faz-1). `GET /news/{newsIdOrSlug}` accepts either the article's uuid `id` or its `slug` — Website's article URLs are slug-based; `PATCH`/`DELETE` stay uuid-only since moderators already have the id from their own listing.

Write access is gated by `identity.is_platform_moderator()` — platform-wide `admin`/`moderator` roles, unrelated to team roles. See [Database › Domains › Content](../../database/domains/content.md) for why anonymous callers must never trigger that check (it reads a table `anon` has no grant on) and how the RLS policies avoid it.
