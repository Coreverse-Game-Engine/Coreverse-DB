# Polls

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/polls` | Public | List polls (with their options nested) |
| `POST` | `/polls/{pollId}/vote` | Required | Cast (or attempt to change) the caller's vote |
| `GET` | `/polls/{pollId}/results` | Public | Anonymous aggregated vote counts per option |

Individual votes are **never** exposed by this API — `GET /polls/{pollId}/results` calls `content.poll_results()`, which reads across every user's `poll_votes` row but returns only per-option counts (see [Database › Functions › Content](../../database/functions/content.md)). `POST /polls/{pollId}/vote` will `409`/`400` if the caller has already voted (enforced by the `(poll_id, user_id)` primary key) or if the chosen option doesn't belong to the poll (enforced by a trigger — see [Database › Triggers](../../database/triggers.md)).

Poll creation (with its options) is not shown as a separate public endpoint here because it's created atomically via `content.create_poll_with_options()` through the moderator-facing creation flow, alongside `news`.
