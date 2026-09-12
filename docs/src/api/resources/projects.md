# Projects

| Method | Path | Auth | Does |
|---|---|---|---|
| `GET` | `/projects` | Required | List the caller's own and team-visible projects |
| `PATCH` | `/projects/{projectId}` | Required | Update project metadata (owner only) |
| `DELETE` | `/projects/{projectId}` | Required | Delete a project (owner only) |
| `GET` | `/projects/{projectId}/download` | Required | Mint a short-lived signed download URL |

`GET /projects/{projectId}/download` is the one endpoint in this resource that touches Storage directly: it checks the caller's access with their own user-scoped client (owner, or a member of the project's team), and only then constructs a service-role client to generate a 5-minute signed URL. See [Security › Storage Security](../../security/storage-security.md) for why this two-step design exists instead of a Storage RLS policy for team members.

Uploading a new archive is a two-step client-side flow: upload the `.tar.zst` file to the `project-archives` Storage bucket at `{owner_id}/{project_id}.tar.zst` directly, then create/update the `identity.projects` metadata row (path, size, checksum) via this resource.
