# Profiles

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/profiles/me` | Required | The caller's own profile, with `avatar_path` resolved to a public `avatar_url` |
| `PATCH` | `/profiles/me` | Required | Update the caller's own profile |

There is no endpoint to fetch or list *other* users' profiles by ID — `identity.profiles` is publicly readable at the RLS level (for joins from other domains, e.g. showing an author's name on a news article), but the API deliberately exposes only the "me" shape rather than a general `/profiles/{id}` lookup.

Avatar upload itself goes through Supabase Storage directly against the `avatars` bucket (see [Security › Storage Security](../../security/storage-security.md)), not through this Edge Function — `profiles` only ever stores/returns the resulting `avatar_path`.
