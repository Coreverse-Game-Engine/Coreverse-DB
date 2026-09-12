# pgTAP

[pgTAP](https://pgtap.org/) is a TAP-emitting (Test Anything Protocol) unit-testing framework for PostgreSQL, enabled by the `20260828144407_enable_pgtap.sql` migration.

## Shape of a test file

Each file under `supabase/tests/database/` and `supabase/tests/rls/` follows the usual pgTAP pattern:

```sql
begin;
select plan(<number of assertions>);

-- assertions, e.g.:
select is(
  (select count(*) from releases.engine_releases where version = '1.0.0'),
  1,
  'seeded release exists'
);

select * from finish();
rollback;
```

Wrapping the whole file in `begin; ... rollback;` means every test runs against a transaction that's rolled back afterward — tests never leave residue in the local database, and can run in any order without interfering with each other.

## Running

```bash
supabase test db
```

runs every `.sql` file under `supabase/tests/` and reports pass/fail per assertion. See [Database Testing](database-testing.md) for the split between `database/` and `rls/`, and [RLS Testing](rls-testing.md) for how RLS tests specifically simulate different callers.
