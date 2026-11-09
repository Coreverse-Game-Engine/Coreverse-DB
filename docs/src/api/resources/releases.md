# Releases

| Method | Path                        | Auth   | Does                                                         |
|--------|-----------------------------|--------|--------------------------------------------------------------|
| `GET`  | `/releases`                 | Public | List releases, optionally filtered by `status`, paginated    |
| `GET`  | `/releases/latest`          | Public | The latest release for a given `status` (default `stable`)   |
| `GET`  | `/releases/{version}`       | Public | One release by exact version string                          |
| `GET`  | `/releases/{version}/delta` | Public | Plan a delta update from `?from=` to `{version}` (see below) |

Every response nests a release's platform artifacts as an `artifacts[]` array (see `Release.yaml` / `Artifact.yaml`), matching `releases.get_by_version` / `get_latest` / `list_releases` 1:1 (see [Database › Functions › Releases](../../database/functions/releases.md)).

`GET /releases/{version}` returns `404` for an unknown version, not `400` — the version string itself is free-form text, so a malformed version is indistinguishable from "not found" at this layer.

## `GET /releases/{version}/delta`

Query: `from` (installed version), `os` (`windows`\|`linux`\|`macos`), `architecture` (`x86_64`\|`arm64`) — all required. `{version}` is the target. Response: `DeltaPlan` (`openapi/schemas/DeltaPlan.yaml`).

The Launcher calls this before installing a newer Engine over an older one it already has. The answer is either:

- `recommended: "delta"` — `steps[]` is an ordered chain of delta packages (oldest first) that turns `from` into `{version}`, and `to_manifest` lists every file of the target tree with its SHA-256. Every `url` is a public `engine-deltas` object; each has a `sha256` and `size_bytes` to verify.
- `recommended: "full"` — download `full.download_url` instead. `reason` says why: `not_newer`, `no_manifest` (the target has no manifest yet), `no_chain` (no chain of at most `max_steps` = 5 deltas), or `too_large` (the best chain is more than `max_ratio` = 60 % of the full artifact). `steps` is empty.

`full` is always present, so a failed delta update (any hash mismatch) can fall back to the verified full artifact. Errors: `400 invalid_version` (the path version is malformed, so `latest` is rejected), `400 invalid_query` (missing or invalid `from`/`os`/`architecture`), `404 not_found` (unknown target or source release, or the target has no artifact for the platform).
