# Profiles

| Method   | Path                  | Auth     | Does                                                                                         |
|----------|-----------------------|----------|----------------------------------------------------------------------------------------------|
| `GET`    | `/profiles/me`        | Required | The caller's own profile, with `avatar_path` resolved to a public, cache-busted `avatar_url` |
| `PATCH`  | `/profiles/me`        | Required | Update the caller's own profile — `full_name` and/or `username` (at least one required)      |
| `POST`   | `/profiles/me/avatar` | Required | Upload a new avatar (multipart, PNG or WebP, up to 5 MB)                                     |
| `DELETE` | `/profiles/me/avatar` | Required | Remove the caller's avatar (`404` if none is set)                                            |

There is no endpoint to fetch or list *other* users' profiles by ID — `identity.profiles` is publicly readable at the RLS level (for joins from other domains, e.g. showing an author's name on a news article), but the API deliberately exposes only the "me" shape rather than a general `/profiles/{id}` lookup.

**Username.** A unique (case-insensitive), alphanumeric/underscore handle, 3–24 chars, distinct from `full_name`. A taken username on `PATCH /profiles/me` returns `409` (`username_taken`). Every user is assigned a collision-free username automatically at signup — see [Database › Triggers](../../database/triggers.md).

**Avatar upload.** As of `20260912085602_avatar_upload_and_rate_limit.sql`, clients no longer write to the `avatars` bucket directly — `POST /profiles/me/avatar` validates the file server-side and writes it to Storage with the service role, then updates `avatar_path`, returning the updated profile including the new `avatar_url`. Switching between PNG and WebP removes the previous object rather than leaving it orphaned. `DELETE /profiles/me/avatar` clears `avatar_path` and best-effort removes the object. `avatar_path` is **not** settable through `PATCH /profiles/me` — it never went through that schema on the server side either, so exposing it there only let a client point their profile at an arbitrary storage object; avatars are set/unset exclusively via these two routes. See [Security › Storage Security](../../security/storage-security.md).

**Avatar caching.** Because a re-upload overwrites the same `{user_id}.<ext>` object, the public URL by itself never changes — so `avatar_url` has a `?v=<updated_at>` query parameter appended, which busts browser/CDN caching on every write without renaming the underlying object.
