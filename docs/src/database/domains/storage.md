# Storage

Supabase Storage is a platform service, not a PostgreSQL application schema — but it's provisioned by migration (`20260830143509_create_storage_buckets.sql`, updated by `20260912085602_avatar_upload_and_rate_limit.sql`) and secured with the same RLS mechanism as any table (`storage.objects`), so it's documented here alongside the database domains.

## Buckets

| Bucket | Visibility | Naming | Limits |
|---|---|---|---|
| `avatars` | Public | Flat: `{user_id}.<ext>` (`png` or `webp`) | 5 MB, `image/png` or `image/webp` |
| `project-archives` | Private | `{owner_id}/{project_id}.tar.zst` | No bucket-level size limit (falls back to the project plan's global upload cap) |

## `avatars`

Public read only — as of `20260912085602_avatar_upload_and_rate_limit.sql`, **there are no client-facing write policies on this bucket at all** (`avatars_self_write`/`_self_update`/`_self_delete` were dropped). Every avatar write now goes through the `profiles` Edge Function's `POST /profiles/me/avatar` route, which uploads with a **service-role** client after validating the file server-side — see [API › Profiles](../../api/resources/profiles.md).

This replaced the original design, where the client uploaded directly to the bucket at a fixed `{user_id}.png` path and RLS alone enforced "only your own object." Two things motivated the change: centralizing file-type/size validation in one place (the Edge Function) instead of relying on bucket-level MIME/size limits alone, and widening the accepted formats (PNG or WebP) without widening what a client is trusted to write unsupervised. Because the extension now varies with format, the object name is `{user_id}.<ext>` rather than always `.png`; the Edge Function does a best-effort delete of the previous object when the extension changes (e.g. PNG → WebP), so switching formats doesn't leave an orphaned file behind.

## `project-archives`

Private bucket, owner-only *direct* Storage access (the `storage.objects` RLS policies check that the first path segment matches `auth.uid()`). **Team-member reads do not go through Storage RLS at all** — they go through the `projects` Edge Function's `/projects/{id}/download` endpoint, which:

1. Checks the caller's access to the project using their own user-scoped Supabase client, so `identity.projects` RLS applies (project owner, or a member of the project's team).
2. Only after that check passes, constructs a **service-role** client and mints a short-lived (5 minute) signed URL.

This keeps cross-member access control in exactly one place — the `identity.projects` RLS policy — instead of duplicating team-membership logic inside Storage's own policies.

See [Storage Security](../../security/storage-security.md) for the security-focused version of this page, and [API › Projects](../../api/resources/projects.md) for the download endpoint.
