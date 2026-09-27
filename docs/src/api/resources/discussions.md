# Discussions

| Method  | Path                                            | Auth                        | Does                                                           |
|---------|-------------------------------------------------|-----------------------------|----------------------------------------------------------------|
| `GET`   | `/discussions`                                  | Public                      | List discussions, filterable by `category`                     |
| `POST`  | `/discussions`                                  | Required                    | Create a discussion                                            |
| `GET`   | `/discussions/{discussionId}`                   | Public                      | Fetch one discussion                                           |
| `PATCH` | `/discussions/{discussionId}`                   | Required (author/moderator) | Edit, lock, or unlock a discussion                             |
| `GET`   | `/discussions/{discussionId}/replies`           | Public                      | List replies to a discussion                                   |
| `POST`  | `/discussions/{discussionId}/replies`           | Required                    | Reply to a discussion (rejected if the discussion `is_locked`) |
| `PATCH` | `/discussions/{discussionId}/replies/{replyId}` | Required (author/moderator) | Edit or soft-delete a reply                                    |

`GET /discussions` and `GET /discussions/{discussionId}/replies` are both cursor-paginated (`?limit=&?cursor=`, response is `{ items, next_cursor }`) — see [Conventions › Pagination](../conventions.md#pagination). `sort=active`/`sort=replies` on the list endpoint are single-page only for now (`next_cursor` is always `null`, and passing `cursor` with either is a `400`) — a keyset cursor on `(created_at, id)` doesn't resume correctly under a different sort column; see the comment in `supabase/functions/discussions/index.ts`.

List items (`DiscussionSummary`) carry an `excerpt` (body truncated to ~280 chars) instead of the full `body` — fetch `GET /discussions/{discussionId}` for that. Both list items and the single-discussion shape include a nested `author` (`{ id, username, avatar_url }`), `reply_count`, and `last_activity_at` (bumped when a new reply is posted — not by reply edits, soft-deletes, or editing the discussion itself). Both are denormalized columns maintained by triggers (`content.trg_discussion_replies_count`), not computed per-request — see the Faz 3 migration.

Categories are free text, trimmed + lowercased at write time (so "Modding", " modding ", and "modding" all land in one bucket) — **not** a fixed or localized set. `GET /discussions/categories` reflects whatever's actually been used, for building a filter UI without hardcoding a list.

A reply's `edited_at` is set only on a genuine body edit, distinct from `updated_at` (touched on any write, including soft-delete) and `deleted_at` (soft-delete specifically).

Deleting a reply is a **soft delete** (`deleted_at` set, row otherwise retained) rather than a hard `DELETE`, so a thread's structure survives moderation — the client renders a tombstoned reply as "[deleted]". See [Database › Domains › Content](../../database/domains/content.md) and [Database › Tables › Discussions](../../database/tables/discussions.md).
