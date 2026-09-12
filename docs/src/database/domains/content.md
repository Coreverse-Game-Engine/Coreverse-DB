# Content

The `content` schema holds the website's user-facing content: news, polls, and discussions.

## Tables

- **`news`** — `draft`/`published` articles, gated for writes by `identity.is_platform_moderator()`.
- **`polls`** and **`poll_options`** — a poll's question and its options.
- **`poll_votes`** — one row per `(poll, user)`, enforced by a composite primary key so a user can only vote once per poll.
- **`discussions`** and **`discussion_replies`** — community threads. Replies use **soft delete** (`deleted_at`) instead of a hard delete, so moderation doesn't break a thread's structure — the application layer renders a tombstoned reply as "[deleted]" rather than removing it, preserving the reply chain.

See [Tables › Discussions](../tables/discussions.md), [Tables › Polls](../tables/polls.md), and [Tables › News](../tables/news.md).

## Why this domain is mostly RLS, not functions

Most of `content`'s authorization is a simple, static predicate — "is this user a moderator?", "is this their own row?" — rather than a multi-step transition, so it's expressed directly in RLS policies rather than `SECURITY DEFINER` functions. The two real functions in this domain exist for different reasons:

- **`identity.is_platform_moderator()`** — a small, reusable RLS-policy helper (not a write path).
- **`content.poll_results()`** — has to aggregate across *every* user's votes despite `poll_votes` being effectively self-read-only; it exists to expose an anonymous aggregate without ever exposing individual vote rows.

## Vote integrity

A poll option must belong to the poll it's being voted on — not expressible as a plain foreign key, since `poll_votes` references `poll_id` and `option_id` independently. This is enforced by a `before insert` trigger, `content.enforce_vote_option_matches_poll()`, deliberately implemented as a trigger rather than a function: it's a data-integrity rule, not an authorization rule, so it belongs at the constraint layer regardless of who's writing.

## The moderator/admin exception for `news`

Anonymous users must never trigger `identity.is_platform_moderator()`, because that function reads `identity.platform_roles`, and `anon` has no `select` grant on that table — the RLS policies on `content.news` are written so the moderator check only ever runs for `authenticated` callers.

See [Functions › Content](../functions/content.md) and [Reference › Glossary](../../reference/glossary.md) for platform vs. team roles.
