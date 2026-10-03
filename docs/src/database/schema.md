# Schema

Migrations are applied in filename (timestamp) order and are the single source of truth for the database schema — nothing is changed by hand against a running database.

| Migration file                              | Adds                                                                                                                                               |
|---------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `20260828090000_create_releases_domain.sql` | `releases` schema: `engine_releases`, `engine_artifacts`, read functions                                                                           |
| `20260828144407_enable_pgtap.sql`           | The `pgtap` extension (test infrastructure only)                                                                                                   |
| `20260829162935_create_identity_domain.sql` | `identity` schema: `profiles`, `teams`, `team_members`, `team_membership_requests`, `projects`; `private` schema helpers; team lifecycle functions |
| `20260830143509_create_storage_buckets.sql` | `avatars` and `project-archives` Storage buckets and their `storage.objects` RLS policies                                                          |
| `20260830151432_create_content_domain.sql`  | `identity.platform_roles`; `content` schema: `news`, `polls`, `poll_options`, `poll_votes`, `discussions`, `discussion_replies`                    |
| `20260831093008_create_docs_domain.sql`     | `docs` schema: `sources`, `pages`, full-text search function                                                                                       |

Each migration is self-contained: it creates its schema (`create schema if not exists ...`), its tables, its triggers, its RLS policies, its functions, and its grants, in that order. See [Writing Migrations](../development/writing-migrations.md) for the rules new migrations must follow, and [Migrations](../development/migrations.md) for the general workflow.
