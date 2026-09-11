# Security Policy

Coreverse DB is the sole data-access layer for the Coreverse ecosystem (Launcher, Website) — it
holds user identity, team/project data, and Postgres Row-Level Security policies. Please report
security issues responsibly.

## Supported Versions

Coreverse DB does not yet have tagged releases; `main` is the only supported line. Once
`@coreverse/db-client` starts publishing versioned releases, this table will track which are
receiving security fixes.

| Version         | Supported          |
| ---------------- | ------------------ |
| `main` (latest)   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, use **[GitHub Security Advisories](https://github.com/Coreverse-Game-Engine/Coreverse-DB/security/advisories/new)**
to report privately. This applies in particular to:

- Row-Level Security (RLS) bypasses or privilege-escalation paths (e.g. a role gaining
  admin/moderator access it shouldn't have, or reading another user's private data).
- Auth issues in Edge Functions (JWT handling, the `X-Reindex-Token` shared secret, storage
  bucket signed URLs).
- SQL injection in any `SECURITY DEFINER` function.
- Any way to write to a table that should be read-only for the calling role.

Please include:

- Affected endpoint(s), migration(s), or function(s).
- A minimal reproduction (request/response, or a pgTAP-style test case).
- Impact assessment (what data/action is exposed).

### What to expect

- Acknowledgement of your report as soon as reasonably possible.
- An assessment of severity and, if confirmed, a fix developed privately before public
  disclosure.
- Credit in the fix's release notes, unless you'd prefer to remain anonymous.

## Scope

In scope: this repository (`supabase/migrations`, `supabase/functions`, RLS policies,
`openapi/` contract, and the generated `src/` client). Out of scope: the Launcher and Website
repositories (report there instead), and social-engineering or physical-security reports.
