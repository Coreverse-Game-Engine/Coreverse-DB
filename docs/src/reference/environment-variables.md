# Environment Variables

| Variable | Purpose |
|---|---|
| `PUBLIC_SUPABASE_URL` | Client-side Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase anonymous key |
| `DATABASE_PASSWORD` | Database password for development/administration workflows |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret key (service role) |
| `DATABASE_URL` | Direct PostgreSQL connection URL |

Never commit real values for any of these — use `.env.example` as the template and keep real values in an untracked `.env.local`. See [Getting Started › Configuration](../getting-started/configuration.md).
