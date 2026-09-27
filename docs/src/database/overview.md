# Overview

The database is PostgreSQL 17, managed entirely through versioned migrations in [`supabase/migrations/`](https://github.com/KING-MASTER2012/Coreverse-DB/tree/main/supabase/migrations). There are four domain schemas plus one internal helper schema:

| Schema     | Migration                                   | Contents                                             |
|------------|---------------------------------------------|------------------------------------------------------|
| `releases` | `20260828090000_create_releases_domain.sql` | Engine release metadata + per-platform artifacts     |
| `identity` | `20260829162935_create_identity_domain.sql` | Profiles, teams, membership, projects                |
| `content`  | `20260830151432_create_content_domain.sql`  | News, polls, discussions, platform roles             |
| `docs`     | `20260831093008_create_docs_domain.sql`     | Documentation catalog + full-text search             |
| `private`  | (created inside the identity migration)     | RLS helper functions only — never exposed to clients |

A separate migration, `20260828144407_enable_pgtap.sql`, enables the `pgtap` extension used by the test suite. `20260830143509_create_storage_buckets.sql` provisions the two Supabase Storage buckets (`avatars`, `project-archives`) and their `storage.objects` policies.

See [Schema](schema.md) for how migrations map to schema objects, [Extensions](extensions.md) for what's enabled and why, and [Conventions](conventions.md) for the naming and structure rules every migration follows. The [Domains](domains/releases.md) pages describe each schema's purpose and design rationale; the [Tables](tables/profiles.md) pages document individual tables; and [Functions](functions/overview.md) and [Triggers](triggers.md) document the PostgreSQL-side business logic.
