# Row Level Security

Row Level Security (RLS) is enabled on every application table in the schema, including ones where every write ends up going through `service_role` (e.g. `releases.engine_releases` still has RLS enabled with only a `select` policy) — the intent is that RLS is never *accidentally* off, only deliberately unrestricted for `service_role`, which bypasses it by design.

## Patterns used

- **Public read, no client write** (`releases.*`, `docs.*`) — a `for select to anon, authenticated using (true)` policy and nothing else; writes are `service_role`-only.
- **Self-only write** (`identity.profiles`) — `using (id = auth.uid())` on both the read-scoping and the `with check` of the update policy.
- **Membership-scoped read** (`identity.teams`, `team_members`) — `using ((select private.is_team_member(id)))`.
- **Static predicate read/write** (`content.*`) — combinations of `author_id = auth.uid()` and `identity.is_platform_moderator()`.
- **No client write at all** (`identity.teams`, `team_members`, `team_membership_requests`) — every write is a `SECURITY DEFINER` function instead; RLS on these tables is entirely read-oriented.

## Avoiding RLS recursion

A policy that queries another RLS-protected table can recurse into that table's own RLS evaluation. Coreverse DB avoids this with a specific pattern: `private.is_team_member()` and `private.is_team_admin()` are

```sql
security definer
set search_path = ''
set row_security = off
```

`security definer` lets the function read `team_members` with the function owner's privileges rather than the caller's; `row_security = off` additionally disables RLS *within the function's own execution*, so its internal `select` against `team_members` doesn't itself trigger `team_members`' RLS policies again. Without `row_security = off`, a policy on `teams` calling a function that reads `team_members` (also RLS-protected, also potentially checking `teams`) risks infinite recursion.

See [Policies](policies.md) for the full policy inventory and [Database › Conventions](../database/conventions.md) for the naming/structure rules new policies follow.
