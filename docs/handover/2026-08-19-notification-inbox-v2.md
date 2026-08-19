# Craves Notification Inbox v2 — Engineering Handover

Date: 2026-08-19
Scope: Backend only
Target: Craves-Build-platform production repository

## Objective

Upgrade customer and chef in-app notification retrieval from a latest-N foundation to a production-scale inbox contract without requiring frontend changes in this phase.

## Implemented

- Existing latest-N inbox endpoint preserved.
- Stable cursor pagination added using `(created_at, id)` ordering.
- Optional unread-only paging added.
- Unread-count endpoint added.
- Idempotent mark-all-read endpoint added.
- Repository access remains authenticated-identity scoped.
- Partial unread and cursor indexes added through Notification Flyway V5.
- Cursor validation rejects malformed or oversized tokens before database access.
- Unit tests cover cursor round-trip, malformed cursors, page-size validation, next-cursor generation and read-all delegation.

## Why cursor pagination

Offset paging can skip or duplicate rows if a notification arrives while the user is loading older pages. The cursor approach anchors the next query to the last `(created_at, id)` pair already returned, keeping scrolling deterministic while new events continue to arrive.

## Backward compatibility

No existing endpoint was removed or renamed. Current web/mobile clients may continue calling:

```http
GET /api/v1/notifications/in-app
PATCH /api/v1/notifications/in-app/{noticeId}/read
```

Future clients may adopt:

```http
GET /api/v1/notifications/in-app/page
GET /api/v1/notifications/in-app/unread-count
PATCH /api/v1/notifications/in-app/read-all
```

## Security

The controller derives identity from `CravesPrincipal`; no user ID is accepted from client input. Repository predicates always include `recipient_identity_id`, including bulk read operations.

## Deployment requirements

1. Run `mvn -B -ntp clean verify` in `services/notification-service`.
2. Confirm Flyway V1-V5 migration ordering.
3. Deploy through the existing Notification Service Azure DevOps pipeline.
4. Verify Container App health/readiness.
5. Smoke-test JWT-authenticated inbox endpoints through APIM before enabling a frontend consumer.

## Azure impact

No paid Azure resource is added and no secret/key rotation is required. V5 creates PostgreSQL indexes only; monitor DB CPU/IO during the migration window.

## Product decisions untouched

No notification marketing policy, pricing, commission, cancellation, refund, rating/review, FSSAI, service-radius, provider-priority, tax/GST or frontend behavior is invented by this module.
