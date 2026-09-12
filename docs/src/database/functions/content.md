# Content Functions

| Function | Signature | Does |
|---|---|---|
| `identity.is_platform_moderator` | `() → boolean` | `stable`; checks `identity.platform_roles` for the calling user having `admin` or `moderator` — used as an RLS-policy predicate on `content.news`/moderation actions |
| `content.poll_results` | `(...) → table(...)` | `stable`; returns per-option vote counts as an anonymous aggregate. Exists specifically because `poll_votes` itself must never be exposed row-by-row (that would reveal who voted for what), yet the public still needs to see results |
| `content.create_poll_with_options` | `(...) → uuid` | Atomically inserts a poll and its options in one call, so a client never observes a poll that exists without any options |

See [Domains › Content](../domains/content.md) for why most of this domain's authorization lives in RLS rather than functions, and [Triggers](../triggers.md) for `content.enforce_vote_option_matches_poll`, the vote-integrity check that runs alongside these functions.
