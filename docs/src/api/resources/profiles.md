# Profiles

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/profiles/me` | Required | The caller's own profile, with `avatar_path` resolved to a public `avatar_url` |
| `PATCH` | `/profiles/me` | Required | Update the caller's own profile |
| `POST` | `/profiles/me/avatar` | Required | Upload a new avatar (multipart), replacing the caller's current one |

There is no endpoint to fetch or list *other* users' profiles by ID — `identity.profiles` is publicly readable at the RLS level (for joins from other domains, e.g. showing an author's name on a news article), but the API deliberately exposes only the "me" shape rather than a general `/profiles/{id}` lookup.

## Avatar upload

As of the `20260912085602_avatar_upload_and_rate_limit.sql` migration, avatar upload is **server-controlled**, not a direct client write to Storage:

1. The client sends the image as `multipart/form-data` (field name `file`) to `POST /profiles/me/avatar` — PNG or WebP, up to 5 MB.
2. The `profiles` Edge Function validates the file server-side, derives the storage extension from the validated content type (never from anything the client names), and uploads it to the `avatars` bucket using a **service-role** client.
3. It updates `avatar_path` on the caller's profile and, if the previous avatar was at a different path (e.g. switching PNG ↔ WebP), best-effort deletes the old object so nothing orphaned is left behind.
4. It returns the updated profile with `avatar_url` resolved.

This replaced an earlier design where the client uploaded directly to the `avatars` bucket and then just told the API the resulting path — see [Security › Storage Security](../../security/storage-security.md) for why that changed and [Database › Domains › Storage](../../database/domains/storage.md) for the current bucket policy.

`PATCH /profiles/me` can still set `avatar_path` directly (e.g. to `null`, to clear an avatar), but the documented way to *upload* a new image is `POST /profiles/me/avatar` — not a raw Storage write plus a `PATCH`.
