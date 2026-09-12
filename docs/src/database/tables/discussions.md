# `content.discussions`, `discussion_replies`

## `content.discussions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `title` / `body` | `text` | |
| `author_id` | `uuid` | References `identity.profiles(id)` |
| `category` | `text`, nullable | Indexed |
| `is_locked` | `boolean` | Default `false`; locked discussions reject new replies |
| `created_at` / `updated_at` | `timestamptz` | |

## `content.discussion_replies`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `discussion_id` | `uuid` | References `discussions(id)`, `on delete cascade` |
| `author_id` | `uuid` | |
| `body` | `text` | |
| `deleted_at` | `timestamptz`, nullable | Soft delete — see below |
| `created_at` / `updated_at` | `timestamptz` | |

Replies use **soft delete** rather than a hard `delete`, so removing a reply doesn't break the thread's structure; a tombstoned row is rendered as "[deleted]" by the client/Edge Function rather than being filtered out entirely.

See [API › Discussions](../../api/resources/discussions.md).
