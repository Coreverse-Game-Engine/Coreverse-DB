# Schemas

Reusable component schemas live one-per-file under `openapi/schemas/`:

| Schema | Backs |
|---|---|
| `Error.yaml` | The shared error shape (`{ error, message }`) — see [API › Errors](../api/errors.md) |
| `Ok.yaml` | A trivial acknowledgement response, used for actions with no meaningful return payload (e.g. cancelling a request) |
| `Release.yaml`, `Artifact.yaml` | [Releases](../api/resources/releases.md) |
| `Profile.yaml` | [Profiles](../api/resources/profiles.md) |
| `Team.yaml`, `TeamMember.yaml`, `MembershipRequest.yaml` | [Teams](../api/resources/teams.md), [Requests](../api/resources/requests.md) |
| `Project.yaml` | [Projects](../api/resources/projects.md) |
| `News.yaml` | [News](../api/resources/news.md) |
| `Poll.yaml`, `PollResult.yaml` | [Polls](../api/resources/polls.md) |
| `Discussion.yaml`, `DiscussionReply.yaml` | [Discussions](../api/resources/discussions.md) |
| `DocSource.yaml`, `DocSearchResult.yaml` | Docs catalog and search |

Each schema is referenced by `$ref` from the relevant path file(s) rather than inlined, so a shape used in more than one response (e.g. `Team` in both the create response and the get-by-id response) is defined exactly once.

`src/generated/models/` is generated 1:1 from these files by Orval — see [Development › Workflow](../development/workflow.md) for the regenerate-and-verify loop, and never edit `src/generated/` by hand; change the schema here instead.
