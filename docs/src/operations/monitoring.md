# Monitoring

Coreverse DB relies on the observability the Supabase platform provides for its managed services:

- **Edge Function logs and invocation metrics** — available through the Supabase dashboard for the hosted project.
- **Postgres logs and slow-query insight** — available through the Supabase dashboard's database observability tools.
- **GitHub Actions run history** — the CI workflows (`ci.yml`, `codeql.yml`, `sempgrep.yml`, `sqlfluff.yml`, `label-sync.yml`, `publish.yml`) provide a build/test health signal for every push and PR.

There is no separate application-level metrics/alerting system defined in this repository — if one is added in the future (e.g. structured logging from Edge Functions, or a dedicated error-tracking integration), it should be documented on this page.

See [Troubleshooting](troubleshooting.md) for what to check first when something looks wrong.
