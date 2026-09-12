# Database Testing

Database behavior is tested with **pgTAP** against the local Supabase stack, split into two categories under `supabase/tests/`:

- **`database/`** — tests for PostgreSQL functions: given these inputs and this caller, does the function return/raise what it should? (`content_functions.sql`, `docs_functions.sql`, `identity_functions.sql`, `releases_functions.sql`)
- **`rls/`** — tests for Row Level Security policies: as this role/user, can I see or write this row? (`content_rls.sql`, `docs_rls.sql`, `identity_rls.sql`, `releases_rls.sql`)

These are kept in separate files intentionally — a function can be logically correct while its RLS policy is wrong (or vice versa), and mixing the two kinds of test in one file makes failures harder to attribute to the right layer.

Run the full suite:

```bash
supabase test db
```

CI also runs `supabase db lint` before the pgTAP suite, catching a class of schema issues pgTAP itself wouldn't (e.g. missing indexes on foreign keys).

See [pgTAP](pgtap.md) for how individual test files are structured and [RLS Testing](rls-testing.md) for the role-switching pattern RLS tests use.
