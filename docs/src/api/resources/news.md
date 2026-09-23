# News

| Method   | Path             | Auth                                  | Does                                             |
|----------|------------------|---------------------------------------|--------------------------------------------------|
| `GET`    | `/news`          | Public (published only)               | List news, filterable by `status` for moderators |
| `GET`    | `/news/{newsId}` | Public (published) / Required (draft) | Fetch one article                                |
| `POST`   | `/news`          | Required (moderator/admin)            | Create an article                                |
| `PATCH`  | `/news/{newsId}` | Required (moderator/admin)            | Edit an article, including publishing it         |
| `DELETE` | `/news/{newsId}` | Required (moderator/admin)            | Delete an article                                |

Write access is gated by `identity.is_platform_moderator()` — platform-wide `admin`/`moderator` roles, unrelated to team roles. See [Database › Domains › Content](../../database/domains/content.md) for why anonymous callers must never trigger that check (it reads a table `anon` has no grant on) and how the RLS policies avoid it.
