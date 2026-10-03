# `content.events`

| Column                      | Type                    | Notes                                                                          |
|-----------------------------|-------------------------|--------------------------------------------------------------------------------|
| `id`                        | `uuid`, PK              |                                                                                |
| `title`                     | `text`                  |                                                                                |
| `slug`                      | `text`, unique          |                                                                                |
| `description`               | `text`                  |                                                                                |
| `location`                  | `text`, nullable        | Free text (venue or "Online"), not a structured address                        |
| `starts_at`                 | `timestamptz`           |                                                                                |
| `ends_at`                   | `timestamptz`, nullable | `CHECK (ends_at IS NULL OR ends_at >= starts_at)`                              |
| `registration_url`          | `text`, nullable        | External link only — registrations/attendees are deliberately not tracked here |
| `author_id`                 | `uuid`                  | References `identity.profiles(id)`                                             |
| `status`                    | `text`                  | `draft` (default) \| `published`                                               |
| `published_at`              | `timestamptz`, nullable |                                                                                |
| `created_at` / `updated_at` | `timestamptz`           | `updated_at` maintained by `trg_events_updated_at`                             |

RLS mirrors [`content.news`](news.md): `anon` can read only `published` rows; `authenticated` can also read their own drafts, and moderators/admins can read everything. Insert requires `identity.is_platform_moderator()` **and** `author_id = auth.uid()`; update and delete require `identity.is_platform_moderator()`. The `author_id` foreign key has no `ON DELETE` clause, which is why [account deletion](../../api/resources/profiles.md) is blocked (`409`) while a user still authors events. See [API › Events](../../api/resources/events.md).
