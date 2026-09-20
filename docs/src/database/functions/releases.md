# Releases Functions

All three functions in `releases` are `stable` SQL functions, granted to `anon` and `authenticated`, returning the same row shape (a release row with `artifacts` nested as a `jsonb` array) so the API's `Release`/`Artifact` schema maps onto them 1:1.

| Function         | Signature                                                                                   | Does                                                                                                                 |
|------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `get_by_version` | `(p_version text) → table(...)`                                                             | One release by exact version string                                                                                  |
| `get_latest`     | `(p_status text default 'stable') → table(...)`                                             | The highest-versioned release with the given status, ordered by `(version_major, version_minor, version_patch) desc` |
| `list_releases`  | `(p_status text default null, p_limit int default 20, p_offset int default 0) → table(...)` | Paginated list, optionally filtered by status                                                                        |

Each aggregates `engine_artifacts` per release with `jsonb_agg(jsonb_build_object(...)) filter (where a.id is not null)`, coalescing to `'[]'::jsonb` for a release with no artifacts yet, so the API never has to special-case a `null` artifacts array.

See [Domains › Releases](../domains/releases.md), [Tables › Releases](../tables/releases.md), and [API › Releases](../../api/resources/releases.md).
