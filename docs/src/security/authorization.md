# Authorization

Authorization answers "given who you are, what can you do?" — and in this codebase, that answer lives in PostgreSQL, not in the Edge Functions.

## Three mechanisms, by kind of rule

| Rule kind | Mechanism | Example |
|---|---|---|
| "Can this caller see this row?" | RLS `select` policy | `teams_member_read`: only current members can see a team |
| "Can this caller change this row?" | RLS `update`/`insert`/`delete` policy, where one exists | `profiles_self_update`: a user can only update their own profile |
| Multi-step state transition | `SECURITY DEFINER` function with an explicit check | `identity.remove_member`: an admin may remove members but not other admins or the owner |
| Data-integrity rule independent of who's writing | Trigger / constraint | `content.enforce_vote_option_matches_poll`: an option must belong to its poll, for *any* writer |

The rule of thumb used throughout the schema: **if the check is a single predicate over the row and the caller's identity, it's an RLS policy; if it requires reading other rows and coordinating a write, it's a function.**

## The shared-secret and service-role exceptions

A small number of operations are authorized outside the normal "caller's own JWT + RLS" path, each for a specific reason documented in [Security Model](../architecture/security-model.md):

- `/docs/reindex` — a shared secret, because the caller isn't a person.
- `/projects/{id}/download` — a normal JWT-scoped access check first, then a service-role client only for minting the signed URL.

Every other write in the API goes through the caller's own JWT-scoped Supabase client, meaning RLS and the `SECURITY DEFINER` functions' internal checks are the *only* authorization boundary — there is no separate application-level permission system layered on top.
