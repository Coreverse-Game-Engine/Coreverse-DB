# `content.polls`, `poll_options`, `poll_votes`

## `content.polls`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `question` | `text` | |
| `created_by` | `uuid` | |
| `closes_at` | `timestamptz`, nullable | |
| `created_at` | `timestamptz` | |

## `content.poll_options`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `poll_id` | `uuid` | References `polls(id)`, cascade |
| `label` | `text` | |
| `display_order` | `int` | Default `0` |

## `content.poll_votes`

| Column | Type | Notes |
|---|---|---|
| `poll_id` | `uuid` | Part of composite PK |
| `option_id` | `uuid` | References `poll_options(id)`, cascade |
| `user_id` | `uuid` | Part of composite PK — one vote per user per poll |
| `voted_at` | `timestamptz` | |

A `before insert` trigger (`content.enforce_vote_option_matches_poll`) rejects a vote whose `option_id` doesn't belong to `poll_id`. Individual votes are never exposed publicly — only the aggregate from `content.poll_results()` (see [Functions › Content](../functions/content.md)) is. Polls (with their options nested) and results are created atomically via `content.create_poll_with_options()`.

See [API › Polls](../../api/resources/polls.md).
