# `content.news`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `title` | `text` | |
| `slug` | `text`, unique | |
| `body` | `text` | |
| `author_id` | `uuid` | References `identity.profiles(id)` |
| `status` | `text` | `draft` (default) \| `published` |
| `published_at` | `timestamptz`, nullable | |
| `created_at` / `updated_at` | `timestamptz` | |

Indexed on `status` and `published_at desc` for the common "latest published articles" query. Writes are gated by `identity.is_platform_moderator()` — see [Domains › Content](../domains/content.md) for why anonymous callers must never trigger that check, and [API › News](../../api/resources/news.md) for the HTTP surface.
