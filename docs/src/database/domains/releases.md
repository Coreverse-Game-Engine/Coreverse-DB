# Releases

The `releases` schema stores Coreverse Engine release metadata and per-platform downloadable artifacts. It never stores a binary itself — only enough metadata for the Launcher to discover, download, and verify one.

## Tables

- **`engine_releases`** — one row per version: semantic-version parts, release date, status (`stable`/`beta`/`rc`/`deprecated`), and a release-notes summary.
- **`engine_artifacts`** — one row per `(release, os, architecture)`: a `download_url`, a `sha256` checksum, `size_bytes`, `min_requirements` (jsonb), and `compiler` info (jsonb). A release has zero or more artifacts.

See [Tables › Releases](../tables/releases.md) for full column definitions.

## Why `download_url` is in the database

The artifact's `download_url` is stored per-row rather than the Launcher assuming a fixed GitHub-releases URL pattern. This means the distribution source (GitHub Releases today, a CDN or object storage later) can change without any Launcher update — the Launcher always asks Coreverse DB where to download from.

## Why `sha256` exists

The Launcher verifies the downloaded artifact's SHA-256 against `engine_artifacts.sha256` before running it, specifically so that a compromised distribution source (e.g. GitHub) can't silently serve a tampered binary — the checksum is defined independently, by Coreverse DB, not by whatever served the file.

## Access

Read access (`select`) is granted to both `anon` and `authenticated`, because the Launcher checks for updates before a user is signed in. There are no `insert`/`update`/`delete` policies for `anon` or `authenticated` at all — every write goes through `service_role` (the release/CI pipeline), which bypasses RLS.

See [Functions › Releases](../functions/releases.md) for the three read functions (`get_by_version`, `get_latest`, `list_releases`) and [API › Releases](../../api/resources/releases.md) for the HTTP surface built on top of them.
