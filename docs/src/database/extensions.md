# Extensions

| Extension | Enabled by | Purpose |
|---|---|---|
| `pgtap` | `20260828144407_enable_pgtap.sql` | Unit-testing framework for PostgreSQL, used by every file under [`supabase/tests/`](https://github.com/Coreverse-Game-Engine/Coreverse-DB/tree/main/supabase/tests) (both database-function tests and RLS tests) |
| `pgcrypto` (via `gen_random_uuid()`) | Supabase default stack | Generates UUID primary keys across every table in the schema |
| `pg_cron` | `20260829162935_create_identity_domain.sql` | Scheduled cleanup jobs: expiring stale `identity.team_membership_requests` (3-day idle window), and — since `20260912085602_avatar_upload_and_rate_limit.sql` — a daily prune of `identity.rate_limit_hits` older than 1 day |
| PostgreSQL full-text search (`tsvector`/`tsquery`, built in) | `docs` domain | Powers `docs.pages.search_vector` and `docs.search()`, using the `'simple'` (language-agnostic) text-search configuration rather than `'english'`, since documentation content spans multiple languages and English stemming would misparse non-English text |

No other third-party PostgreSQL extensions are currently in use. If a future domain needs one, it should be enabled in its own migration with a comment explaining why, following the same pattern as `pgtap` and `pg_cron`.
