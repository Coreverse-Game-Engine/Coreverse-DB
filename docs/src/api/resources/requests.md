# Requests

| Method | Path                           | Auth     | Does                                                                                                                       |
|--------|--------------------------------|----------|----------------------------------------------------------------------------------------------------------------------------|
| `POST` | `/requests/{requestId}/accept` | Required | Accept a pending request addressed to the caller (join request as owner/admin, or invite/ownership-transfer as the target) |
| `POST` | `/requests/{requestId}/reject` | Required | Reject the same                                                                                                            |
| `POST` | `/requests/{requestId}/cancel` | Required | The original initiator withdraws their own pending request                                                                 |

Which underlying function runs (`respond_to_join_request`, `respond_to_invite`, `respond_to_ownership_transfer`, or `cancel_request`) depends on the target row's `type` and who's calling — see [Database › Functions › Identity](../../database/functions/identity.md). A request that isn't `pending` anymore, or that the caller isn't a relevant party to, returns `403`/`404` rather than silently succeeding.
