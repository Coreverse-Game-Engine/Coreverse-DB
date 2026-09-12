# Overview

Contributions should preserve the project's architectural boundaries, security model, and source-of-truth rules — in short: don't add a shortcut that bypasses RLS, don't hand-edit generated files, and don't let the OpenAPI contract drift from what the Edge Functions actually do.

Before opening a pull request, make sure the checks in [Development › Workflow](../development/workflow.md) pass locally:

```bash
pnpm verify
deno task test
supabase test db
```

See [Code Style](code-style.md) and [SQL Style](sql-style.md) for formatting/lint rules, [Testing](testing.md) for what test coverage is expected of a change, [Migration Rules](migration-rules.md) for database-specific rules, and [Pull Requests](pull-requests.md) for the review process itself.
