# Database Restore

## From a local dump

```bash
supabase db reset            # rebuild schema from migrations first
psql <connection-string> -f backup.sql
```

## Hosted project

Restoring the hosted Supabase project from a platform backup or point-in-time recovery target is done through the Supabase dashboard or CLI against that project, following Supabase's own restore documentation — this repository doesn't wrap that process in custom scripts.

## After any restore

Run `supabase test db` to confirm the restored database still satisfies the pgTAP suite, and check that the applied migration history (`supabase migration list`) matches what's in `supabase/migrations/` — a restore from an older backup can leave the database behind the current migration history, requiring `supabase db push` afterward to catch it up.
