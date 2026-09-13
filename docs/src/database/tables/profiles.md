# `identity.profiles`

One row per `auth.users` row, created automatically by the `identity.handle_new_auth_user()` trigger on signup (see [Triggers](../triggers.md)). Password is never stored here — Supabase Auth owns it entirely.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | References `auth.users(id)`, `on delete cascade` |
| `full_name` | `text` | Defaults to `''`, populated from `auth.users.raw_user_meta_data->>'full_name'` at signup if present. Free-text display name — no format or uniqueness constraint |
| `username` | `text`, nullable | Unique (case-insensitive, via `idx_profiles_username_lower`), alphanumeric/underscore handle, 3–24 chars. Distinct from `full_name`: derived and de-duplicated automatically at signup, independently settable through `PATCH /profiles/me` |
| `avatar_path` | `text`, nullable | Storage path in the `avatars` bucket, written exclusively by the `profiles` Edge Function's service-role upload (`POST /profiles/me/avatar`) — never by a direct client Storage write. PNG or WebP, up to 5 MB |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Maintained by `identity.set_updated_at()` trigger |

**RLS:** public read (`anon`, `authenticated`); a user may `update` only their own row (`id = auth.uid()`).

**API:** [`GET/PATCH /profiles/me`](../../api/resources/profiles.md).
