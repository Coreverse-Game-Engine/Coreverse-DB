# Overview

Security in Coreverse DB is layered rather than centralized in one place:

1. **Authentication** — Supabase Auth issues and verifies JWTs; Coreverse DB never handles a password. See [Authentication](authentication.md).
2. **Request validation** — every Edge Function validates its input with Zod before touching the database.
3. **Authorization** — Row Level Security, `SECURITY DEFINER` functions, and triggers decide what a given caller can see or change, enforced by PostgreSQL itself rather than application code. See [Authorization](authorization.md), [Row Level Security](rls.md), and [Policies](policies.md).
4. **Storage** — avatars and project archives have their own `storage.objects` policies, plus a signed-URL flow for team-shared downloads. See [Storage Security](storage-security.md).

This layering means a bug in an Edge Function's own logic — forgetting a check, say — still can't grant access RLS wouldn't otherwise allow, because the database connection an Edge Function uses (outside of the few explicit service-role cases) is scoped to the caller's own JWT, not a privileged one.

See [Architecture › Security Model](../architecture/security-model.md) for the same material framed around the request flow rather than the mechanism.
