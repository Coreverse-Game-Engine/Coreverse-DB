# Triggers

| Trigger | Table | Function | Does |
|---|---|---|---|
| `trg_engine_releases_updated_at` | `releases.engine_releases` | `releases.set_updated_at()` | Maintains `updated_at` on every update |
| `trg_profiles_updated_at` | `identity.profiles` | `identity.set_updated_at()` | Same, for profiles |
| `trg_teams_updated_at` | `identity.teams` | `identity.set_updated_at()` | Same, for teams |
| `trg_projects_updated_at` | `identity.projects` | `identity.set_updated_at()` | Same, for projects |
| `trg_handle_new_auth_user` | `auth.users` (`after insert`) | `identity.handle_new_auth_user()` | Auto-creates the matching `identity.profiles` row on signup, seeding `full_name` from `raw_user_meta_data` if present, and deriving a collision-free `username` (falling back through `username`/`user_name`/`preferred_username` metadata, then the email local-part) |
| `trg_team_members_capacity` | `identity.team_members` (`before insert`) | `identity.enforce_team_capacity()` | Rejects a new member once a team already has 30 |
| `trg_news_updated_at` / `trg_discussions_updated_at` / `trg_discussion_replies_updated_at` | `content.*` | `content.set_updated_at()` | Maintains `updated_at` |
| `trg_poll_votes_option_matches_poll` | `content.poll_votes` (`before insert`) | `content.enforce_vote_option_matches_poll()` | Rejects a vote whose option doesn't belong to the poll being voted on |
| `trg_docs_sources_updated_at` / `trg_docs_pages_updated_at` | `docs.*` | `docs.set_updated_at()` | Maintains `updated_at` |

Every domain defines its own `set_updated_at()` function rather than sharing one across schemas, keeping each domain's migration fully self-contained. `trg_handle_new_auth_user` and `trg_team_members_capacity` are the two triggers doing genuine business-rule enforcement rather than bookkeeping; both are `SECURITY DEFINER`, owned by `postgres`, with execute revoked from `public`, since they must run regardless of who's inserting the triggering row.

See [Database › Conventions](conventions.md) for the `updated_at` pattern in general, and [Functions › Identity](functions/identity.md) / [Functions › Content](functions/content.md) for the write paths these triggers guard.
