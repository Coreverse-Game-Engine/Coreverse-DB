# Writing Migrations

Follow the structure and conventions in [Database › Conventions](../database/conventions.md); this page is the practical checklist for a new migration file.

## Structure, top to bottom

1. A comment block explaining the domain and any non-obvious design decisions — future readers (including you, in six months) will thank you.
2. `create schema if not exists <schema>;` if this is a new domain.
3. Table definitions, with `comment on table`/`comment on column` for anything non-obvious.
4. Indexes.
5. Trigger functions and their triggers (`set_updated_at`, any business-rule enforcement).
6. RLS: `enable row level security`, then policies.
7. `SECURITY DEFINER` functions, if the domain needs state-transition logic beyond RLS.
8. Grants — explicit `grant select/execute` for exactly what `anon`/`authenticated` need; nothing broader.

## Checklist

- [ ] Every table has `id uuid primary key default gen_random_uuid()` (unless it's a pure join table using a composite key, like `team_members`).
- [ ] Every table with mutable rows has `created_at`/`updated_at` and a `set_updated_at()` trigger.
- [ ] RLS is enabled, even if the only policy is public read or none at all.
- [ ] Any `SECURITY DEFINER` function that's a private RLS helper lives in `private`, sets `search_path = ''`, and (if it must avoid recursion) `row_security = off`.
- [ ] Enumerated columns use a `check (... in (...))` constraint.
- [ ] Foreign keys specify the intended `on delete` behavior explicitly (`cascade`, `set null`, or the default `restrict`) rather than leaving it implicit.
- [ ] Grants to `anon`/`authenticated` are the minimum needed — writes default to withheld unless there's a `SECURITY DEFINER` function or explicit reason.
- [ ] pgTAP tests exist for new RLS policies and new functions (see [Database Testing](database-testing.md), [RLS Testing](rls-testing.md)).
- [ ] SQLFluff passes (see [Contributing › SQL Style](../contributing/sql-style.md)).
