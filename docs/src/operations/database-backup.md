# Database Backup

Backups are managed at the Supabase project level (automatic backups on paid plans, plus point-in-time recovery where enabled), not by custom tooling in this repository.

For a manual/local snapshot during development:

```bash
supabase db dump -f backup.sql
```

For the hosted project, use the Supabase CLI against the linked project or the dashboard's backup/restore UI — refer to Supabase's own documentation for the exact hosted-backup mechanics, since they're a platform feature rather than something this repository configures.

See [Database Restore](database-restore.md) for restoring from a dump, and [Database Reset](../getting-started/database-reset.md) for the everyday local "start over from migrations + seed" operation, which is not the same thing as a backup restore.
