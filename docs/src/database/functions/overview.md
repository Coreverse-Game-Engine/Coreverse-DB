# Overview

Coreverse DB pushes as much business logic as possible into PostgreSQL functions, for one reason: **authorization and invariants enforced in the database hold no matter what calls them** — a future Edge Function, a script, or a different client entirely. Two different kinds of function appear in the schema, and it matters which one a given piece of logic is:

## `SECURITY DEFINER` state-transition functions

Used when a write involves more than one check, or changes more than one row atomically — team creation, invite/accept flows, ownership transfer, promotion/demotion, poll creation with options. These run as the function's owner (not the caller), so they can perform the write even though the underlying tables have no direct `INSERT`/`UPDATE`/`DELETE` grant for `anon`/`authenticated`. All such functions:

- Explicitly check the caller's authorization inside the function body (they don't rely on RLS for this, since RLS is either absent or read-only on these tables).
- Raise a Postgres exception (conventionally with `errcode = 42501` for "not authorized", mapped by the Edge Function's `statusForPgError` to HTTP 403) rather than silently no-op'ing on failure.
- Are the *only* way to perform these writes — see [Identity](identity.md) for the full list.

## `stable`/plain SQL read and helper functions

Used for reads that are either public aggregates (`content.poll_results`), multi-table joins that would be awkward to express as an RLS-filtered `select` (`releases.get_by_version`, `docs.search`), or small reusable RLS predicates (`private.is_team_member`, `identity.is_platform_moderator`). These don't need `SECURITY DEFINER` unless they must read past the caller's own RLS visibility (the `private` helpers do, specifically to avoid RLS recursion — see [Row Level Security](../../security/rls.md)).

See [Identity](identity.md), [Releases](releases.md), and [Content](content.md) for the function inventory per domain, and [Triggers](../triggers.md) for logic that runs automatically on row changes rather than being called directly.
