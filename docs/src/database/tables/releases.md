# `releases.engine_releases`, `engine_artifacts`

## `releases.engine_releases`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `version` | `text`, unique | e.g. `1.4.2` |
| `version_major` / `version_minor` / `version_patch` | `int` | Used for sort/comparison |
| `release_date` | `date` | |
| `release_notes_summary` | `text`, nullable | |
| `status` | `text` | `stable` (default) \| `beta` \| `rc` \| `deprecated` |
| `created_at` / `updated_at` | `timestamptz` | |

## `releases.engine_artifacts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | |
| `release_id` | `uuid` | References `engine_releases(id)`, `on delete cascade` |
| `os` | `text` | `windows` \| `linux` \| `macos` |
| `architecture` | `text` | `x86_64` \| `arm64` |
| `download_url` | `text` | See [Domains › Releases](../domains/releases.md) for why this is stored rather than assumed |
| `sha256` | `text` | Must match `^[a-f0-9]{64}$` |
| `size_bytes` | `bigint` | `> 0` |
| `min_requirements` | `jsonb` | |
| `compiler` | `jsonb` | |
| `created_at` | `timestamptz` | |

Unique on `(release_id, os, architecture)` — at most one artifact per platform per release. **RLS:** public read on both tables; no `anon`/`authenticated` write policies at all.

See [Functions › Releases](../functions/releases.md) and [API › Releases](../../api/resources/releases.md).
