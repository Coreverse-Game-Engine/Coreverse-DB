# Storage Security

See [Database › Domains › Storage](../database/domains/storage.md) for the bucket layout. This page focuses on the security reasoning.

## `avatars`

Public bucket, but writes are constrained by policy to exactly the caller's own object name (`{user_id}.png`), so no user can overwrite another's avatar even though the bucket itself is public for reads. The fixed naming scheme also means there's never an orphaned old avatar to clean up.

## `project-archives`

Private bucket. Two different access paths exist, deliberately kept separate:

1. **Owner, direct Storage access** — RLS on `storage.objects` checks that the first path segment of the object name equals `auth.uid()`. This is enough for the archive's own owner.
2. **Team member, via the API** — a team member does **not** get a Storage RLS policy granting them direct access. Instead, `/projects/{id}/download` checks `identity.projects` RLS with the caller's own client (owner OR team member passes), and only then uses a service-role client to mint a short-lived (5 minute) signed URL.

This split exists so that "who can access this project" is decided in exactly one place — `identity.projects` RLS — rather than being re-implemented (and potentially drifting) inside Storage's own policy language, which doesn't have an easy way to express "is a member of the team that owns this project" without duplicating the `private.is_team_member` logic.

## Uploads

There is no bucket-level size limit on `project-archives` (unlike the 2 MB cap on `avatars`); size is instead recorded per-project in `identity.projects.archive_size_bytes` for informational/integrity purposes and constrained only by the project's overall Supabase plan limits.
