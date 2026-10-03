# Environment Variables

| Variable                   | Purpose                                                    |
|----------------------------|------------------------------------------------------------|
| `PUBLIC_SUPABASE_URL`      | Client-side Supabase project URL                           |
| `PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase anonymous key                         |
| `DATABASE_PASSWORD`        | Database password for development/administration workflows |
| `SUPABASE_SECRET_KEY`      | Server-side Supabase secret key (service role)             |
| `DATABASE_URL`             | Direct PostgreSQL connection URL                           |

Never commit real values for any of these — use `.env.example` as the template and keep real values in an untracked `.env.local`. See [Getting Started › Configuration](../getting-started/configuration.md).

## Edge function secrets

Separate from the table above (those are consumed by local
dev/administration scripts against the DB directly, not by the deployed
edge functions). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SERVICE_ROLE_KEY` are auto-injected into every edge function by
the Supabase runtime; the only one this project manages itself is:

| Variable | Purpose |
|---|---|
| `WEBSITE_ALLOWED_ORIGINS` | Comma-separated, exact origins (scheme + host + port, no trailing slash) allowed by CORS (`_shared/http.ts withCors`) and by `POST /auth/password-reset`'s `redirectTo` validation. |
| `SEND_EMAIL_HOOK_SECRET` | Only read by `send-email`. Signature secret for Supabase Auth's Send Email hook — copy verbatim (including the `v1,whsec_` prefix) from Dashboard → Authentication → Hooks → Send Email hook. |
| `BREVO_API_KEY` | Only read by `send-email`. Same Brevo account the Website already uses (`src/services/brevo.ts`). |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Only read by `send-email`. Keep in sync with the Website's own `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` so auth emails come from the same address as the Website's other transactional emails. |

Local dev: copy `supabase/functions/.env.example` to
`supabase/functions/.env` (gitignored) — `supabase functions serve` picks
it up automatically. Deployed environments: `supabase secrets set
WEBSITE_ALLOWED_ORIGINS=https://coreverse.dev,https://staging.coreverse.dev`.
Keep `WEBSITE_ALLOWED_ORIGINS` in sync with the Website's actual
origin(s) for that environment, and with Supabase Auth's own Site URL /
Additional Redirect URLs allowlist (Auth checks `redirectTo`
independently — both allowlists need to agree or password reset breaks
even though this endpoint's own validation passed).
