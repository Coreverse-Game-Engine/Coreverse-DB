# Introduction

**Coreverse DB** is the centralized data-access and backend layer for the Coreverse ecosystem. It combines a Supabase/PostgreSQL database, a domain-oriented Supabase Edge Function API, a contract-first OpenAPI 3.1 specification, and a generated TypeScript client (`@coreverse/db-client`) into a single versioned backend repository.

## Why this repository exists

Coreverse has more than one client application — the **Coreverse Launcher** (a Tauri/Rust desktop app) and the **Coreverse Website** (Next.js) — that both need the same data: engine releases, user profiles and teams, project archives, news, polls, discussions, and documentation search. Rather than letting each client talk to Postgres/Supabase directly and duplicate authorization logic, Coreverse DB centralizes that access:

- **One schema, one set of RLS policies, one set of PostgreSQL functions** define what is allowed.
- **One OpenAPI contract** defines the HTTP surface every client calls.
- **One generated TypeScript client** gives type-safe access to that surface without hand-written fetch code.

No other Coreverse repository is permitted to query Postgres or Supabase services directly — everything goes through the Edge Function API defined here.

## What's in this book

This documentation is organized around the same domains as the codebase:

- **Getting Started** — installing the toolchain and running the stack locally.
- **Architecture** — how requests flow from a client, through Edge Functions, to Postgres.
- **Database** — the `releases`, `identity`, `content`, and `docs` schemas: tables, functions, and triggers.
- **Security** — authentication, authorization, RLS, and Storage security.
- **API** — the HTTP surface, resource by resource.
- **OpenAPI** — how the contract is structured and how the client is generated from it.
- **Development** and **Operations** — day-to-day workflows and running the system in production.
- **Reference** and **Contributing** — quick lookups and the rules for changing this repository.

For a fast top-level overview, see the repository [`README.md`](https://github.com/KING-MASTER2012/Coreverse-DB) as well — this book goes into more depth on each part.
