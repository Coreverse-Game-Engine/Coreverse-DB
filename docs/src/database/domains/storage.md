# Storage

Supabase Storage is a platform service, not a PostgreSQL application schema — but it's provisioned by a migration (`20260830143509_create_storage_buckets.sql`) and secured with the same RLS mechanism as any table (`storage.objects`), so it's documented here alongside the database domains.

## Buckets

| Bucket | Visibility | Naming | Limits |
|---|---|---|---|
| `avatars` | Public | Flat: `{user_id}.png` | 2 MB, `image/png` only |
| `project-archives` | Private | `{owner_id}/{project_id}.tar.zst` | No bucket-level size limit (falls back to the project plan's global upload cap) |

## `avatars`

Public read, self-only write. Because the object name is always exactly `{user_id}.png`, uploading a new avatar overwrites the previous one in place — there's no orphaned-old-avatar cleanup to do, by construction.

## `project-archives`

Private bucket, owner-only *direct* Storage access (the `storage.objects` RLS policies check that the first path segment matches `auth.uid()`). **Team-member reads do not go through Storage RLS at all** — they go through the `projects` Edge Function's `/projects/{id}/download` endpoint, which:

1. Checks the caller's access to the project using their own user-scoped Supabase client, so `identity.projects` RLS applies (project owner, or a member of the project's team).
2. Only after that check passes, constructs a **service-role** client and mints a short-lived (5 minute) signed URL.

This keeps cross-member access control in exactly one place — the `identity.projects` RLS policy — instead of duplicating team-membership logic inside Storage's own policies.

See [Storage Security](../../security/storage-security.md) for the security-focused version of this page, and [API › Projects](../../api/resources/projects.md) for the download endpoint.
