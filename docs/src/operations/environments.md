# Environments

| Environment | Backend | Client package |
|---|---|---|
| **Local** | `supabase start` (Docker-backed Postgres, Auth, Storage, Edge Functions) | Built from source (`pnpm run build`), not installed from the registry |
| **Production** | The hosted Supabase project referenced as the first `server` entry in `openapi/openapi.yaml` | Published to GitHub Packages under the `@coreverse` scope |

There is currently no separate staging environment described in the repository — changes go from local development, through CI, to the hosted Supabase project directly (see [Deployment](deployment.md)). The Coreverse Launcher and Coreverse Website each configure which base URL (local vs. production) they point at independently of this repository.
