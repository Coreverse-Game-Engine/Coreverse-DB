# Releases

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/releases` | Public | List releases, optionally filtered by `status`, paginated |
| `GET` | `/releases/latest` | Public | The latest release for a given `status` (default `stable`) |
| `GET` | `/releases/{version}` | Public | One release by exact version string |

Every response nests a release's platform artifacts as an `artifacts[]` array (see `Release.yaml` / `Artifact.yaml`), matching `releases.get_by_version` / `get_latest` / `list_releases` 1:1 (see [Database › Functions › Releases](../../database/functions/releases.md)).

`GET /releases/{version}` returns `404` for an unknown version, not `400` — the version string itself is free-form text, so a malformed version is indistinguishable from "not found" at this layer.
