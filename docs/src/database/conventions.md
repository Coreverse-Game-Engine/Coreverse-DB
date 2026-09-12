# Conventions

These conventions are enforced by review, and partly by [SQLFluff](../contributing/sql-style.md) in CI:

- **One schema per domain.** New application data goes into an existing domain schema, or a new one if it's a genuinely new bounded context — never into `public`.
- **`gen_random_uuid()` primary keys.** Every table uses a `uuid primary key default gen_random_uuid()`.
- **`created_at` / `updated_at` timestamptz columns**, with a `before update` trigger (`<schema>.set_updated_at()`) maintaining `updated_at` automatically. Each domain defines its own copy of this trigger function rather than sharing one across schemas.
- **`check` constraints for closed enumerations** (`status`, `role`, `type`, `os`, `architecture`, etc.) instead of a separate lookup table, since these value sets are small and effectively fixed at the application layer.
- **RLS is enabled on every table** that clients can reach, even ones that end up with no client-facing write policies at all (writes-via-service-role-only tables like `releases.engine_releases` still enable RLS and grant only `select`).
- **RLS helper functions live in `private`**, are `security definer`, and set `search_path = ''` and `row_security = off` to avoid both search-path hijacking and RLS recursion. See [Row Level Security](../security/rls.md).
- **Non-trivial writes are `SECURITY DEFINER` functions**, not raw grants — see [Functions › Overview](functions/overview.md) for when a function is used instead of a plain policy.
- **Comments matter.** Every non-obvious table and function has a `comment on table`/`comment on function` explaining *why*, not just what — migrations are read far more often than they're written, and the rationale (e.g. why `teams` has no `owner_id` column) isn't otherwise recoverable from the schema alone.
- **Grants are explicit and minimal.** `anon`/`authenticated` get exactly the `select`/`execute` grants a domain's public surface requires; write access is either a `SECURITY DEFINER` function's `execute` grant or withheld entirely (service-role only).

See [Reference › Database Conventions](../reference/database-conventions.md) for a condensed checklist version of this page.
