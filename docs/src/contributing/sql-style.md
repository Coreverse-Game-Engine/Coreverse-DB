# SQL Style

Migrations are linted with **SQLFluff**, configured for the `postgres` dialect in the repository's `.sqlfluff` file at the root.

Run it locally the same way CI does:

```bash
sqlfluff lint supabase/migrations/
```

Beyond what SQLFluff enforces mechanically, follow [Database › Conventions](../database/conventions.md) and [Development › Writing Migrations](../development/writing-migrations.md) for structure (schema → tables → indexes → triggers → RLS → functions → grants, with explanatory comments) and naming (`trg_<table>_<purpose>`, `idx_<table>_<column(s)>`, `<schema>.set_updated_at()` per domain).
