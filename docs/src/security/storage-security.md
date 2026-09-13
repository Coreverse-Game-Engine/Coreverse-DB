# Storage Security

See [Database › Domains › Storage](../database/domains/storage.md) for the bucket layout. This page focuses on the security reasoning.

## `avatars`

Public bucket for reads (`avatars_public_read`), but as of `20260912085602_avatar_upload_and_rate_limit.sql` there are no client-side write policies at all — `avatars_self_write`/`_update`/`_delete` were dropped. All writes now go through `POST /profiles/me/avatar` (see [API › Profiles](../api/resources/profiles.md)), which validates the upload server-side and writes it to Storage with the **service role**, bypassing RLS entirely. This closed a gap the old self-write policy couldn't cover: format/size were previously only as trustworthy as the client, whereas the Edge Function now checks both itself. Accepts PNG or WebP, up to 5 MB (widened from PNG-only, 2 MB). The Edge Function reads the caller's existing `avatar_path` before writing, so switching between PNG and WebP removes the old object instead of leaving it orphaned.

## `project-archives`

Private bucket. Two different access paths exist, deliberately kept separate:

1. **Owner, direct Storage access** — RLS on `storage.objects` checks that the first path segment of the object name equals `auth.uid()`. This is enough for the archive's own owner.
2. **Team member, via the API** — a team member does **not** get a Storage RLS policy granting them direct access. Instead, `/projects/{id}/download` checks `identity.projects` RLS with the caller's own client (owner OR team member passes), and only then uses a service-role client to mint a short-lived (5 minute) signed URL.

This split exists so that "who can access this project" is decided in exactly one place — `identity.projects` RLS — rather than being re-implemented (and potentially drifting) inside Storage's own policy language, which doesn't have an easy way to express "is a member of the team that owns this project" without duplicating the `private.is_team_member` logic.

## Uploads

There is no bucket-level size limit on `project-archives` (unlike the 2 MB cap on `avatars`); size is instead recorded per-project in `identity.projects.archive_size_bytes` for informational/integrity purposes and constrained only by the project's overall Supabase plan limits.
