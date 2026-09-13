# Profiles

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/profiles/me` | Required | The caller's own profile, with `avatar_path` resolved to a public `avatar_url` |
| `PATCH` | `/profiles/me` | Required | Update the caller's own profile — `full_name`, `username`, and/or `avatar_path` (at least one required; setting `avatar_path` directly only accepts clearing it with `null`) |
| `POST` | `/profiles/me/avatar` | Required | Upload a new avatar (multipart, PNG or WebP, up to 5 MB) |

There is no endpoint to fetch or list *other* users' profiles by ID — `identity.profiles` is publicly readable at the RLS level (for joins from other domains, e.g. showing an author's name on a news article), but the API deliberately exposes only the "me" shape rather than a general `/profiles/{id}` lookup.

**Username.** A unique (case-insensitive), alphanumeric/underscore handle, 3–24 chars, distinct from `full_name`. A taken username on `PATCH /profiles/me` returns `409`. Every user is assigned a collision-free username automatically at signup — see [Database › Triggers](../../database/triggers.md).

**Avatar upload.** As of `20260912085602_avatar_upload_and_rate_limit.sql`, clients no longer write to the `avatars` bucket directly — `POST /profiles/me/avatar` validates the file server-side and writes it to Storage with the service role, then updates `avatar_path`, returning the updated profile including the new `avatar_url`. Switching between PNG and WebP removes the previous object rather than leaving it orphaned. See [Security › Storage Security](../../security/storage-security.md).
