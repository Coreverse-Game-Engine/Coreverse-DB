# Storage Security

See [Database › Domains › Storage](../database/domains/storage.md) for the bucket layout. This page focuses on the security reasoning.

## `avatars`

Public bucket for reads only. As of `20260912085602_avatar_upload_and_rate_limit.sql`, there is **no client-facing write policy on this bucket at all** — uploading is exclusively done server-side by the `profiles` Edge Function's `POST /profiles/me/avatar` route, using a service-role client after validating the file (PNG or WebP, up to 5 MB) itself. This is a deliberate move away from the bucket's original self-only-write design: validation now lives entirely in application code that's easy to reason about and extend, rather than being split between Storage's own MIME/size limits and RLS. See [API › Profiles](../api/resources/profiles.md) for the upload flow and [Database › Domains › Storage](../database/domains/storage.md) for the bucket policy history.

## `project-archives`

Private bucket. Two different access paths exist, deliberately kept separate:

1. **Owner, direct Storage access** — RLS on `storage.objects` checks that the first path segment of the object name equals `auth.uid()`. This is enough for the archive's own owner.
2. **Team member, via the API** — a team member does **not** get a Storage RLS policy granting them direct access. Instead, `/projects/{id}/download` checks `identity.projects` RLS with the caller's own client (owner OR team member passes), and only then uses a service-role client to mint a short-lived (5 minute) signed URL.

This split exists so that "who can access this project" is decided in exactly one place — `identity.projects` RLS — rather than being re-implemented (and potentially drifting) inside Storage's own policy language, which doesn't have an easy way to express "is a member of the team that owns this project" without duplicating the `private.is_team_member` logic.

## Uploads

There is no bucket-level size limit on `project-archives` (unlike the 2 MB cap on `avatars`); size is instead recorded per-project in `identity.projects.archive_size_bytes` for informational/integrity purposes and constrained only by the project's overall Supabase plan limits.
