# Requirements

A complete local development environment requires:

| Tool | Version | Used for |
|---|---|---|
| **Node.js** | 22+ | TypeScript client tooling (`pnpm`, Orval, `tsup`) |
| **pnpm** | 9.12.0 | Package management for the `@coreverse/db-client` package |
| **Deno** | 2.x | Edge Function development, formatting, linting, and unit tests |
| **Supabase CLI** | latest | Running the local Supabase stack, migrations, and pgTAP tests |
| **Docker** | latest | Backing runtime for the local Supabase/PostgreSQL stack |
| **Git** | any recent | Version control |

Optional but recommended:

- **mdBook** — to build and preview this documentation locally (`docs/`).
- **SQLFluff** — to lint PostgreSQL migrations the same way CI does.
- **Semgrep** — to run the same static-analysis pass CI runs.

Windows users can bootstrap most of this automatically with the PowerShell devkit script under [`scripts/devkit/powershell/`](https://github.com/Coreverse-Game-Engine/Coreverse-DB/tree/main/scripts/devkit/powershell); a Bash equivalent lives under `scripts/devkit/shell/`. See [CLI Commands](../reference/cli-commands.md) for the day-to-day commands once the toolchain is installed.
