# `identity.projects`

User-uploaded project archive metadata. The archive file itself lives in Supabase Storage (bucket `project-archives`, `.tar.zst`); this row is metadata plus an integrity checksum.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `owner_id` | `uuid` | References `profiles(id)` |
| `team_id` | `uuid`, nullable | References `teams(id)`, `on delete set null` |
| `name` | `text` | |
| `description` | `text`, nullable | |
| `archive_path` | `text` | Storage object path |
| `archive_size_bytes` | `bigint` | `> 0` |
| `archive_sha256` | `text` | Must match `^[a-f0-9]{64}$` |
| `created_at` / `updated_at` | `timestamptz` | |

A team may own any number of projects — it's not a 1:1 relationship. **RLS:** the owner can always read/write their project; team members can read (but not write) a team-owned project.

See [Domains › Storage](../domains/storage.md) for how the archive file itself is protected, and [API › Projects](../../api/resources/projects.md) for the `/projects/{id}/download` signed-URL flow.
