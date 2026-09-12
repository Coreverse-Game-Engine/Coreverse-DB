# Database Conventions

Condensed checklist version of [Database › Conventions](../database/conventions.md):

- One schema per domain; nothing new in `public`.
- `uuid primary key default gen_random_uuid()`.
- `created_at`/`updated_at` + a per-domain `set_updated_at()` trigger.
- `check` constraints for closed enumerations.
- RLS enabled on every client-reachable table, even write-nothing-for-clients ones.
- RLS helper predicates live in `private`, `security definer`, `set search_path = ''`, `set row_security = off` where recursion is a risk.
- Multi-step writes are `SECURITY DEFINER` functions, not raw grants.
- Every non-obvious table/function has a `comment on ...` explaining why.
- Grants to `anon`/`authenticated` are explicit and minimal.
