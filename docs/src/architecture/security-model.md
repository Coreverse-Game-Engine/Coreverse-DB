# Security Model

Security is enforced in layers, and each layer only does the part it's positioned to do well:

```text
Supabase Auth JWT
       │
       ▼
Edge Function
       │
       ├── Request validation (Zod)
       ▼
User-scoped Supabase client
       │
       ▼
Row Level Security (RLS)
       │
       ├── PostgreSQL functions / RPCs
       ├── Constraints
       └── Triggers
```

- **Authentication** is entirely Supabase Auth's responsibility — Coreverse DB never stores or handles a password. See [Security › Authentication](../security/authentication.md).
- **Request shape** validation (types, required fields, enum values) happens in the Edge Function with Zod, before anything touches the database.
- **Authorization** — who can see or change which row — is enforced by PostgreSQL itself via RLS, not by application code, so it holds even if an Edge Function has a bug. See [Row Level Security](../security/rls.md) and [Policies](../security/policies.md).
- **Multi-step invariants** (team capacity, single owner, vote-belongs-to-poll, etc.) are enforced by `SECURITY DEFINER` functions and triggers, which run the check and the write in the same transaction. See [Database › Functions](../database/functions/overview.md) and [Database › Triggers](../database/triggers.md).

For the small number of operations that require privileged (service-role) access:

```text
Authenticated / secret-authorized request
                │
                ▼
        Access validation
                │
                ▼
        Service-role operation
```

Two concrete cases:

- **`/docs/reindex`** authenticates via a shared `X-Reindex-Token` secret instead of a user JWT, because the caller is CI in another repository (the engine or a tutorial repo), not a signed-in user.
- **`/projects/{id}/download`** first checks the caller's access to the project using their own user-scoped client (so `identity.projects` RLS applies normally), and only *after* that check passes does it construct a service-role client to mint a short-lived (5 minute) signed Storage URL.

See [Storage Security](../security/storage-security.md) for how avatar and project-archive access is controlled.
