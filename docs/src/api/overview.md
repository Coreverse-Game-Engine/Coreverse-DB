# Overview

The HTTP API is defined as an OpenAPI 3.1.0 contract under [`openapi/`](https://github.com/KING-MASTER2012/Coreverse-DB/tree/main/openapi), served by ten Supabase Edge Functions. It's organized into the following resources:

| Resource | Base path(s) | Purpose |
|---|---|---|
| [Auth](resources/auth.md) | `/auth/*` | Unauthenticated, rate-limited account-recovery operations |
| [Releases](resources/releases.md) | `/releases*` | Engine release metadata and artifacts |
| [Teams](resources/teams.md) | `/teams/*` | Teams, roles, members, membership operations |
| [Requests](resources/requests.md) | `/requests/{requestId}/*` | Accepting, rejecting, cancelling a pending membership request |
| [Profiles](resources/profiles.md) | `/profiles/me` | The caller's own profile |
| [Projects](resources/projects.md) | `/projects*` | Project archive metadata and downloads |
| [News](resources/news.md) | `/news*` | Platform news |
| [Polls](resources/polls.md) | `/polls*` | Polls and anonymous aggregated results |
| [Discussions](resources/discussions.md) | `/discussions*`, `/replies/{id}` | Discussions and replies |
| Docs | `/docs/*` | Documentation catalog, search, and reindexing — see [Database › Schema](../database/schema.md) for the underlying `docs` domain and [OpenAPI › Paths](../openapi/paths.md) for the three operations |

The production base URL is the Supabase Functions endpoint configured as a `server` in `openapi/openapi.yaml`; local development uses the URL `supabase start` prints (`http://127.0.0.1:54321/functions/v1` by default).

See [Authentication](authentication.md) for how requests are authenticated, [Conventions](conventions.md) for request/response shape conventions, and [Errors](errors.md) for the shared error schema.
