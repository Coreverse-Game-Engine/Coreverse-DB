<p style="text-align: left">
  <img src="assets/emblems/coreverse-emblem.svg" alt="Coreverse Emblem" width="160">
</p>

# Coreverse DB

**Coreverse DB** is the centralized data-access and backend layer for the Coreverse ecosystem. It combines a Supabase/PostgreSQL database, a domain-oriented Edge Function API, a contract-first OpenAPI specification, and a generated TypeScript client into a single versioned backend repository.

Coreverse applications such as the **Coreverse Launcher** and **Coreverse Website** consume the API exposed by this repository. They do **not** access PostgreSQL or Supabase data services directly.

> **Project status:** Core implementation is complete. Documentation content, additional test coverage, and developer convenience scripts are being finalized.

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Platform-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Deno](https://img.shields.io/badge/Deno-2.x-000000?logo=deno&logoColor=white)](https://deno.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](https://www.openapis.org/)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

---

## Overview

Coreverse DB provides the shared backend capabilities required by the Coreverse platform:

- Coreverse Engine release metadata and downloadable artifacts
- User profiles (including unique usernames), teams, roles, projects, and membership workflows
- Unauthenticated, rate-limited password-reset requests
- Platform news, polls, discussions, and replies
- Documentation source registration and full-text search indexing
- Secure project archive access through Supabase Storage
- Authentication-aware API access using Supabase Auth JWTs
- Row Level Security (RLS), PostgreSQL functions, constraints, and triggers for authorization and data integrity
- A typed TypeScript SDK generated from the same OpenAPI contract used to define the API

The project is intentionally organized around **clear domain boundaries** rather than treating the database, API, and client as unrelated components.

---

## Architecture

At a high level, the system follows this flow:

```text
┌───────────────────────────────────────────────────────────────┐
│                        Coreverse Ecosystem                    │
│                                                               │
│   Coreverse Launcher     Coreverse Website     Other Clients │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                │ HTTPS / JSON
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                    │
│                                                               │
│  auth      releases  teams  requests  profiles  projects     │
│  news      polls     discussions  docs                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Shared HTTP / Supabase / service-role infrastructure   │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                │ User-scoped Supabase client
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                         PostgreSQL 17                         │
│                                                               │
│   releases   identity   content   docs   private helpers     │
│                                                               │
│   RLS + SECURITY DEFINER + constraints + triggers + RPCs     │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ├──────────────► Supabase Auth
                                │
                                └──────────────► Supabase Storage
```

### Design principles

**API-first access.** Consumer applications use the Edge Function API instead of connecting directly to PostgreSQL.

**Domain-oriented database design.** Application data is separated into `releases`, `identity`, `content`, and `docs` schemas. Internal helper functions live in the restricted `private` schema.

**Database-enforced authorization.** RLS is combined with PostgreSQL functions, constraints, and triggers. Important state transitions are performed through controlled RPC-style functions instead of relying exclusively on application code.

**Contract-first API development.** `openapi/` is the authoritative API contract. The TypeScript client and generated Zod schemas are derived from it.

**Least privilege.** User requests normally run through a JWT-scoped Supabase client. Service-role access is isolated to operations that explicitly require privileged access, such as documentation reindexing and signed project-download URLs.

---

## Database Domains

### `releases`

Stores Coreverse Engine release metadata and platform-specific artifacts.

Key concepts:

- semantic version components (`major`, `minor`, `patch`)
- release status and metadata
- per-platform artifacts
- operating system and architecture information
- download URLs, checksums, sizes, and minimum requirements

The domain also exposes database functions for listing releases, resolving a release by version, and obtaining the latest release.

### `identity`

Contains user and collaboration data:

- profiles
- teams
- team members and roles
- membership requests, invitations, and ownership transfers
- projects
- platform roles

Team lifecycle operations such as creating teams, changing membership, promoting or demoting members, leaving teams, and transferring ownership are implemented through database functions so authorization rules remain enforced at the database boundary.

### `content`

Contains user-facing platform content:

- news
- polls and poll options
- poll votes
- discussions
- discussion replies

Poll results are exposed as anonymous aggregates rather than exposing individual vote records. Discussion replies support soft deletion, and locked discussions prevent new replies.

### `docs`

Provides the documentation catalog and search index.

The database stores documentation source metadata and indexed page text rather than acting as the canonical document host. Pages can be reindexed through the dedicated API endpoint, while search is performed using PostgreSQL full-text search.

### Supabase Storage

Storage is a platform service rather than a PostgreSQL application domain. Coreverse DB currently uses storage for:

- user avatars (`avatars`)
- project archives (`project-archives`)

Project archive files are stored separately from their database metadata. Access is mediated through authorization checks and short-lived signed URLs.

---

## Security Model

Security is enforced in multiple layers:

```text
Supabase Auth JWT
       │
       ▼
Edge Function
       │
       ├── Request validation (Zod)
       │
       ▼
User-scoped Supabase client
       │
       ▼
Row Level Security (RLS)
       │
       ├── PostgreSQL functions / RPCs
       ├── Constraints
       └── Triggers
```

For the small number of privileged operations that require service-role access:

```text
Authenticated / secret-authorized request
                │
                ▼
        Access validation
                │
                ▼
        Service-role operation
```

The `/docs/reindex` operation uses a dedicated `X-Reindex-Token` shared secret instead of a user JWT. Project downloads first validate user access and then generate a short-lived signed Storage URL.

For a deeper explanation of authentication, authorization, RLS, policy design, and Storage security, see the [documentation](docs/src/SUMMARY.md).

---

## API

The HTTP API is defined as an **OpenAPI 3.1.0** contract under [`openapi/`](openapi/).

The API is organized into the following resources:

| Resource      | Purpose                                                    |
|---------------|------------------------------------------------------------|
| `auth`        | Unauthenticated, rate-limited password-reset request       |
| `releases`    | Engine release metadata and artifacts                      |
| `teams`       | Teams, roles, members, and membership operations           |
| `requests`    | Accepting, rejecting, and cancelling membership requests   |
| `profiles`    | Current user's profile                                     |
| `projects`    | Project archive metadata and downloads                     |
| `news`        | Platform news                                              |
| `polls`       | Polls and anonymous aggregated results                     |
| `discussions` | Discussions and replies                                    |
| `docs`        | Documentation catalog, search, and reindexing              |

The production Edge Function base URL is the Supabase Functions endpoint configured in the OpenAPI specification. Local development uses the URL exposed by `supabase start`.

### Authentication

Authenticated operations accept a Supabase Auth JWT through:

```http
Authorization: Bearer <JWT>
```

Public read operations do not require a bearer token. The documentation reindex endpoint uses its own `X-Reindex-Token` authentication mechanism.

### Error model

API errors use the shared `Error` OpenAPI schema, allowing generated clients and consumers to handle failures consistently across resources.

---

## TypeScript Client

The repository also contains the `@coreverse/db-client` package, a typed TypeScript client generated from the OpenAPI contract.

```text
openapi/openapi.yaml
        │
        ▼
      Orval
     /     \
    ▼       ▼
Fetch SDK   Zod schemas
```

Generated output lives under:

```text
src/generated/
├── endpoints/   # typed fetch operations, split by API tag
├── models/      # TypeScript models
└── zod/         # generated Zod schemas
```

The runtime HTTP layer is centralized in [`src/client/http.ts`](src/client/http.ts), which provides the shared fetch behavior used by generated endpoints.

### Source of truth

`openapi/` is authoritative. `src/generated/` is derived output and should not be edited manually.

The repository enforces this in CI by regenerating the client and failing when the generated output differs from the committed files.

---

## Repository Layout

```text
.
├── openapi/                    # Authoritative API contract
│   ├── openapi.yaml
│   ├── paths/
│   └── schemas/
│
├── src/                        # TypeScript client package
│   ├── client/
│   └── generated/
│
├── supabase/
│   ├── functions/              # Edge Functions + Zod schemas/tests
│   │   ├── _shared/
│   │   ├── auth/
│   │   ├── discussions/
│   │   ├── docs/
│   │   ├── news/
│   │   ├── polls/
│   │   ├── profiles/
│   │   ├── projects/
│   │   ├── releases/
│   │   ├── requests/
│   │   ├── send-email/         # Supabase Auth "Send Email" hook, not part of the OpenAPI contract
│   │   └── teams/
│   │
│   ├── migrations/             # Versioned PostgreSQL migrations
│   ├── tests/
│   │   ├── database/           # pgTAP database-function tests
│   │   └── rls/                # pgTAP authorization/RLS tests
│   ├── seed.sql                 # Local development seed data
│   └── config.toml              # Local Supabase configuration
│
├── docs/                       # mdBook documentation
│   ├── src/
│   └── theme/
│
├── assets/                     # Project branding assets
├── .github/                    # CI, security scanning, and repo policy
├── deno.json                   # Deno tasks and Edge Function formatting
├── package.json                # TypeScript client tooling
├── orval.config.ts             # Client/codegen configuration
├── .sqlfluff                   # PostgreSQL migration lint configuration
└── LICENSE                     # GPL-3.0-only
```

---

## Testing

Testing is split by responsibility.

### Deno unit tests

Edge Function request schemas are tested independently with Deno and Zod. These tests do not require a running PostgreSQL instance.

Run:

```bash
deno task test
```

### Database and RLS tests

PostgreSQL behavior is tested with **pgTAP** against a local Supabase stack. Database-function tests and RLS tests are intentionally separated.

Run:

```bash
supabase start
supabase test db
```

The CI pipeline also runs database linting before the pgTAP suite.

---

## Development

### Requirements

A complete local development environment requires:

- **Node.js 22+** for the TypeScript client tooling
- **pnpm 9.12.0** for package management
- **Deno 2.x** for Edge Function development and unit tests
- **Supabase CLI**
- **Docker** for the local Supabase/PostgreSQL stack
- **Git**

### Install JavaScript dependencies

```bash
pnpm install
```

### Start local Supabase

```bash
supabase start
```

This starts the local Supabase services and applies the versioned migrations.

### Generate the TypeScript client

```bash
pnpm generate
```

### Type-check the client

```bash
pnpm typecheck
```

### Verify generated output

```bash
pnpm verify
```

`pnpm verify` regenerates the client, checks for generated-code drift, and runs TypeScript type-checking.

### Reset the local database

```bash
supabase db reset
```

This rebuilds the local database from the migration history and seed data.

---

## Continuous Integration

GitHub Actions validates the repository through separate quality gates:

| Workflow / Job      | Responsibility                                                                |
|---------------------|-------------------------------------------------------------------------------|
| OpenAPI lint        | Validates the API contract with Redocly                                       |
| Client verification | Regenerates Orval output, checks for drift, and runs TypeScript type-checking |
| Deno unit tests     | Executes Zod/Edge Function schema tests and formatting checks                 |
| Supabase pgTAP      | Starts local Supabase, lints the database, and runs DB/RLS tests              |
| SQLFluff            | Lints PostgreSQL migrations                                                   |
| CodeQL              | Performs security analysis for TypeScript/JavaScript                          |
| Semgrep             | Performs additional static security analysis                                  |

The main CI workflow exposes a single `ci-required` status used as the aggregate required check for branch protection.

---

## OpenAPI and Code Generation Workflow

Changes to the HTTP API should follow this direction:

```text
1. Edit openapi/paths/ or openapi/schemas/
              │
              ▼
2. Lint the OpenAPI contract
              │
              ▼
3. Regenerate with Orval
              │
              ▼
4. Review src/generated/
              │
              ▼
5. Run type-checking and tests
```

Do not manually patch generated files to change API behavior. Change the OpenAPI contract and regenerate instead.

---

## Database Change Workflow

Database changes are made through versioned migrations in [`supabase/migrations/`](supabase/migrations/).

Typical development flow:

```text
Create migration
      │
      ▼
Reset local database
      │
      ▼
Run pgTAP tests
      │
      ▼
Run database lint
      │
      ▼
Review RLS / constraints / functions / triggers
```

When a migration changes externally observable API behavior, the OpenAPI contract and generated client should be updated in the same change.

---

## Configuration

The repository includes [`.env.example`](.env.example) as the baseline for environment configuration.

Current environment variables include:

| Variable                   | Purpose                                                    |
|----------------------------|------------------------------------------------------------|
| `PUBLIC_SUPABASE_URL`      | Client-side Supabase project URL                           |
| `PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase anonymous key                         |
| `DATABASE_PASSWORD`        | Database password for development/administration workflows |
| `SUPABASE_SECRET_KEY`      | Server-side Supabase secret key                            |
| `DATABASE_URL`             | Direct PostgreSQL connection URL                           |

> Never commit real credentials, Supabase secret keys, database passwords, or reindex tokens to the repository.

---

## Documentation

The project uses **mdBook** for its developer documentation.

Documentation source:

```text
docs/src/
```

The documentation structure currently covers:

- introduction and project concepts
- getting started and local development
- system and database architecture
- security, authentication, authorization, and RLS
- database schemas, tables, functions, and triggers
- HTTP API resources and conventions
- OpenAPI and code generation
- development and testing workflows
- deployment and operational procedures
- reference material and contribution guidelines

The documentation entry point is [`docs/src/SUMMARY.md`](docs/src/SUMMARY.md).

---

## License

Coreverse DB is licensed under the **GNU General Public License v3.0 only**.

See [`LICENSE`](LICENSE) for the complete license text.

---

## Contributing

Contributions should preserve the project's architectural boundaries, security model, and source-of-truth rules.

Before opening a pull request, make sure relevant checks pass locally, especially:

```bash
pnpm verify
deno task test
supabase test db
```

For detailed contribution rules, coding conventions, migration guidelines, and testing practices, see [`docs/src/SUMMARY.md`](docs/src/SUMMARY.md).

---

## Coreverse Ecosystem

Coreverse DB is a backend component of the broader Coreverse ecosystem. It is designed to provide a stable, centralized data and API boundary for Coreverse clients while keeping database implementation details behind the service layer.
