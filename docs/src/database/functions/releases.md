# Releases Functions

The three read functions in `releases` are `stable` SQL functions, granted to `anon` and `authenticated`, returning the same row shape (a release row with `artifacts` nested as a `jsonb` array) so the API's `Release`/`Artifact` schema maps onto them 1:1.

| Function         | Signature                                                                                   | Does                                                                                                                 |
|------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `get_by_version` | `(p_version text) → table(...)`                                                             | One release by exact version string                                                                                  |
| `get_latest`     | `(p_status text default 'stable') → table(...)`                                             | The highest-versioned release with the given status, ordered by `(version_major, version_minor, version_patch) desc` |
| `list_releases`  | `(p_status text default null, p_limit int default 20, p_offset int default 0) → table(...)` | Paginated list, optionally filtered by status                                                                        |

Each aggregates `engine_artifacts` per release with `jsonb_agg(jsonb_build_object(...)) filter (where a.id is not null)`, coalescing to `'[]'::jsonb` for a release with no artifacts yet, so the API never has to special-case a `null` artifacts array.

See [Domains › Releases](../domains/releases.md), [Tables › Releases](../tables/releases.md), and [API › Releases](../../api/resources/releases.md).

## `releases.plan_delta` (0.6.0)

`plan_delta(p_from text, p_to text, p_os text, p_architecture text, p_max_steps int default 5, p_max_ratio numeric default 0.6) → jsonb`, `stable`, granted to `anon`, `authenticated` and `service_role`. Returns `null` when the target or source release, or the target's artifact for the platform, does not exist (the API answers `404`). Otherwise it walks the `engine_deltas` graph with a recursive query (at most `p_max_steps` hops, never past the target version) and picks the chain with the fewest bytes, ties broken by fewest steps. It recommends `delta` only when the chain exists, the target has a manifest, and the chain is at most `p_max_ratio` of the full artifact; otherwise `full` with a `reason` (`not_newer`, `no_manifest`, `no_chain`, `too_large`). Storage paths are returned as paths; the `releases` Edge Function turns them into public URLs. See [API › Releases](../../api/resources/releases.md).
