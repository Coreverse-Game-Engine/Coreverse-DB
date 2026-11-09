# Releases

The `releases` schema stores Coreverse Engine release metadata and per-platform downloadable artifacts. It never stores a binary itself — only enough metadata for the Launcher to discover, download, and verify one.

## Tables

- **`engine_releases`** — one row per version: semantic-version parts, release date, status (`stable`/`beta`/`rc`/`deprecated`), and a release-notes summary.
- **`engine_artifacts`** — one row per `(release, os, architecture)`: a `download_url`, a `sha256` checksum, `size_bytes`, `min_requirements` (jsonb), and `compiler` info (jsonb). A release has zero or more artifacts. Since 0.6.0 an artifact can also carry a **file manifest** (`manifest_path`, `manifest_sha256`, `manifest_size_bytes`).
- **`engine_deltas`** (0.6.0) — one row per delta package `(from release, to release, os, architecture)`: its Storage path, `sha256`, `size_bytes`, `algorithm` (`bsdiff`) and `format_version`.

See [Tables › Releases](../tables/releases.md) for full column definitions.

## Why `download_url` is in the database

The artifact's `download_url` is stored per-row rather than the Launcher assuming a fixed GitHub-releases URL pattern. This means the distribution source (GitHub Releases today, a CDN or object storage later) can change without any Launcher update — the Launcher always asks Coreverse DB where to download from.

## Why `sha256` exists

The Launcher verifies the downloaded artifact's SHA-256 against `engine_artifacts.sha256` before running it, specifically so that a compromised distribution source (e.g. GitHub) can't silently serve a tampered binary — the checksum is defined independently, by Coreverse DB, not by whatever served the file.

## Delta update files

Delta updates let the Launcher build a new Engine version from an installed older one instead of downloading the full artifact. The database stores metadata only; the files live in the public `engine-deltas` bucket (`{os}-{architecture}/{version}/manifest.json` and `{os}-{architecture}/{from}__{to}/delta.zip`) and are recorded by [`scripts/ops/publish-delta.mjs`](../../operations/deployment.md) with the service role. `releases.plan_delta` picks the cheapest chain of deltas between two versions; `GET /releases/{version}/delta` returns it (see [API › Releases](../../api/resources/releases.md)).

**Why the file manifest.** `engine_artifacts.sha256` is the hash of the whole archive, which a patched directory tree is not. The manifest lists every file of the installed tree, so the Launcher can verify the rebuilt tree file by file. Its own hash is stored in the database, independent of the bucket that serves it.

**Manifest (v1)**, JSON: `{"format": 1, "version", "os", "architecture", "files": [...]}`. Each file is `{"path", "kind": "file", "size", "sha256", "mode"}` or `{"path", "kind": "symlink", "target"}`. Paths are relative, `/`-separated and normalized: no leading `/`, no `\`, no `.`/`..`/empty segments, no duplicates (`publish-delta.mjs` rejects anything else; the Launcher must too, because the manifest becomes a directory tree on the user's disk).

**Delta package (v1)**: a ZIP with `delta.json` and `blobs/`. `delta.json`: `{"format": 1, "algorithm": "bsdiff", "from_version", "to_version", "os", "architecture", "entries": [...]}`; each entry has a `path` and an `op`: `patch` (`old_sha256`, `new_sha256`, `blob` = bsdiff patch), `replace` (`new_sha256`, `blob` = the full new file, used when a patch would be most of the file), `add` (`new_sha256`, `blob`) or `remove`. Unchanged files are not listed. Blobs are stored uncompressed (bsdiff output is already compressed). The producer of the package and the Launcher are the two ends of this contract; the database only stores the package's path, hash and size.

**Rules the Launcher follows** (not enforced by the database): verify every download against its `sha256`; build the new tree in a staging directory from the target manifest (copy unchanged files after hashing them, patch changed ones, add new ones, drop everything not in the manifest); verify the finished tree against the manifest; on any mismatch discard it and download the full artifact.

**Write path.** No policy lets `anon` or `authenticated` write `engine_deltas`, the manifest columns or the bucket (static check 13 enforces the bucket). A delta always goes from an older to a newer release (a trigger enforces it, which also keeps the delta graph acyclic) and both releases must have an artifact for the platform (composite foreign keys).

## Access

Read access (`select`) is granted to both `anon` and `authenticated`, because the Launcher checks for updates before a user is signed in. There are no `insert`/`update`/`delete` policies for `anon` or `authenticated` at all — every write goes through `service_role` (the release/CI pipeline), which bypasses RLS.

See [Functions › Releases](../functions/releases.md) for the three read functions (`get_by_version`, `get_latest`, `list_releases`) and [API › Releases](../../api/resources/releases.md) for the HTTP surface built on top of them.
