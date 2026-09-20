# CLI Commands

## Supabase

| Command                            | Does                                                        |
|------------------------------------|-------------------------------------------------------------|
| `supabase start`                   | Starts the local Docker-backed stack and applies migrations |
| `supabase stop`                    | Stops the local stack                                       |
| `supabase db reset`                | Rebuilds the local database from migrations + seed          |
| `supabase db push`                 | Applies pending migrations to the linked hosted project     |
| `supabase db lint`                 | Lints the database schema                                   |
| `supabase test db`                 | Runs the pgTAP suite (`supabase/tests/`)                    |
| `supabase migration new <name>`    | Creates a new timestamped migration file                    |
| `supabase functions serve`         | Serves Edge Functions locally with live reload              |
| `supabase functions deploy <name>` | Deploys one Edge Function to the hosted project             |

## pnpm (TypeScript client)

| Command          | Does                                                                          |
|------------------|-------------------------------------------------------------------------------|
| `pnpm install`   | Installs JS dependencies                                                      |
| `pnpm generate`  | Regenerates `src/generated/` from `openapi/openapi.yaml` via Orval            |
| `pnpm typecheck` | `tsc --noEmit`                                                                |
| `pnpm verify`    | `generate` + drift check (`git diff --exit-code src/generated`) + `typecheck` |
| `pnpm run build` | Builds the package with `tsup` (ESM + CJS)                                    |

## Deno (Edge Functions)

| Command          | Does                                                      |
|------------------|-----------------------------------------------------------|
| `deno task test` | Runs schema unit tests under `supabase/functions/`        |
| `deno fmt`       | Formats Edge Function code per `deno.json`'s `fmt` config |
| `deno lint`      | Lints Edge Function code                                  |
