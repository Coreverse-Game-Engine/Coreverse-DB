# Policies

A condensed inventory of RLS policies by table. See [Row Level Security](rls.md) for the patterns these implement, and the [Domains](../database/domains/releases.md) pages for the reasoning behind each.

| Table | Policy | Effect |
|---|---|---|
| `releases.engine_releases` / `engine_artifacts` | `*_public_read` | `select` for `anon`, `authenticated` — no write policies |
| `identity.profiles` | `profiles_public_read` | `select` for `anon`, `authenticated` |
| `identity.profiles` | `profiles_self_update` | `update` only where `id = auth.uid()` |
| `identity.teams` | `teams_member_read` | `select` only for current members |
| `identity.team_members` | `team_members_member_read` | `select` only for current members |
| `identity.team_membership_requests` | `membership_requests_relevant_parties_read` | `select` for the target user, the initiator, or a team owner/admin |
| `identity.projects` | `projects_read` | `select` for the owner, or a team member if team-owned |
| `identity.platform_roles` | `platform_roles_self_read` | `select` only where `user_id = auth.uid()` — deliberately not publicly listable |
| `content.news` | (author/moderator read & write policies) | Published articles are publicly readable; drafts and writes are author/moderator-gated |
| `content.discussions` / `discussion_replies` | (author/moderator policies) | Public read; author can edit their own; moderators can lock/soft-delete |
| `content.poll_votes` | (self-scoped) | A user can insert/see only their own vote row — never another user's |
| `docs.sources` / `docs.pages` | `*_public_read` | `select` for `anon`, `authenticated` — no client write policies at all |
| `storage.objects` (`avatars`) | `avatars_public_read` | Public read only — no client write policy; writes go through `POST /profiles/me/avatar` (service role) |
| `storage.objects` (`project-archives`) | `project_archives_owner_*` | Owner-only direct access; team-member access goes through the signed-URL Edge Function endpoint instead |

Where a table has no client-facing write policy at all, every write to it happens either via a `SECURITY DEFINER` function (see [Database › Functions](../database/functions/overview.md)) or exclusively via `service_role`.
