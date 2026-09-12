# Requests (`identity.team_membership_requests`)

There is no separate `requests` table — "requests" refers to the same `identity.team_membership_requests` table described on the [Teams](teams.md) page, viewed from the perspective of the party *responding* to one rather than the team managing it.

The `/requests/{requestId}/accept|reject|cancel` API resource (see [API › Requests](../../api/resources/requests.md)) operates on rows in this table by `id`, calling `identity.respond_to_join_request()`, `identity.respond_to_invite()`, `identity.respond_to_ownership_transfer()`, or `identity.cancel_request()` depending on the request's `type` and who's calling — see [Functions › Identity](../functions/identity.md) for the full list.
