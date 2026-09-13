# Extensions

| Extension | Enabled by | Purpose |
|---|---|---|
| `pgtap` | `20260828144407_enable_pgtap.sql` | Unit-testing framework for PostgreSQL, used by every file under [`supabase/tests/`](https://github.com/KING-MASTER2012/Coreverse-DB/tree/main/supabase/tests) (both database-function tests and RLS tests) |
| `pgcrypto` (via `gen_random_uuid()`) | Supabase default stack | Generates UUID primary keys across every table in the schema |
| PostgreSQL full-text search (`tsvector`/`tsquery`, built in) | `docs` domain | Powers `docs.pages.search_vector` and `docs.search()`, using the `'simple'` (language-agnostic) text-search configuration rather than `'english'`, since documentation content spans multiple languages and English stemming would misparse non-English text |

No other third-party PostgreSQL extensions are currently in use. If a future domain needs one (e.g. `pg_cron` for scheduled cleanup, referenced in project history for membership-request expiry), it should be enabled in its own migration with a comment explaining why, following the same pattern as `pgtap`.
