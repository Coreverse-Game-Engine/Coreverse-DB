# Database Architecture

The database is organized into domain-oriented PostgreSQL schemas rather than one flat `public` schema:

| Schema | Purpose |
|---|---|
| `releases` | Coreverse Engine release metadata and per-platform artifacts |
| `identity` | Profiles, teams, team membership, membership requests, projects, platform roles |
| `content` | News, polls, poll options/votes, discussions, discussion replies |
| `docs` | Documentation source catalog and full-text search index |
| `private` | Internal `SECURITY DEFINER` helper functions used by RLS policies (never exposed to clients) |

This mirrors the API's tag structure: each schema is the backing store for one or more Edge Functions, and (with the exception of `identity`, which both `identity` and `content` domains write into for `platform_roles`) a migration that adds a domain is self-contained.

## Design principles

- **Read paths are usually plain tables + RLS.** A `select` from a client, scoped by their JWT, is filtered directly by row-level security policies — no function call needed for reads.
- **Non-trivial writes are `SECURITY DEFINER` functions, not raw table grants.** Anything with more than one invariant to check (team capacity, single-owner-per-team, only-the-initiator-can-cancel, vote-belongs-to-poll, etc.) is a PL/pgSQL function that performs every check and the write together, atomically. Direct `INSERT`/`UPDATE`/`DELETE` grants to `anon`/`authenticated` are deliberately withheld on those tables; only `service_role` (which bypasses RLS) or the SECURITY DEFINER functions can write.
- **RLS helper functions live in `private`, not the domain schema**, and are `SECURITY DEFINER` with `set row_security = off`. This is required to avoid infinite recursion: a policy on `identity.teams` that itself queried `identity.team_members` (RLS-protected) would re-trigger RLS evaluation. The helper functions in `private` read the underlying table directly, bypassing that recursion.
- **Static predicates go directly in RLS policies; multi-step authorization goes in functions.** `content`'s authorization (e.g. "is this the author, or a moderator?") is simple enough to express directly as a `using` clause. `identity`'s team lifecycle (invite → accept → member; owner → transfer → new owner) is a state machine, so it's expressed as functions instead.

See [Database › Overview](../database/overview.md) for the full schema reference, and [Security Model](security-model.md) for how this connects to Auth and the Edge Function layer above it.
