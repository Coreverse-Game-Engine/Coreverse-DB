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

Deleting a reply is a **soft delete** (`deleted_at` set, row otherwise retained) rather than a hard `DELETE`, so a thread's structure survives moderation — the client renders a tombstoned reply as "[deleted]". See [Database › Domains › Content](../../database/domains/content.md) and [Database › Tables › Discussions](../../database/tables/discussions.md).
