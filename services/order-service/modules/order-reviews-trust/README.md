# Order Reviews and Home-Chef Trust Backend

## Purpose

This module adds a server-authoritative review and trust foundation to Order Service. A customer may review only an order owned by that authenticated customer and only after the order is `DELIVERED`.

## APIs

### Customer

- `POST /api/v1/orders/{orderId}/review`
- `PUT /api/v1/orders/{orderId}/review`
- `GET /api/v1/orders/{orderId}/review`
- `GET /api/v1/reviews/mine?limit=&cursor=`
- `GET /api/v1/reviews/tags`
- `PUT /api/v1/reviews/{reviewId}/helpful`
- `DELETE /api/v1/reviews/{reviewId}/helpful`
- `POST /api/v1/reviews/{reviewId}/reports`

### Public

- `GET /api/v1/public/kitchens/{kitchenId}/reviews?limit=&cursor=`
- `GET /api/v1/public/kitchens/{kitchenId}/reviews/summary`

Only `PUBLISHED` reviews enter these responses and aggregates. Customer identity, phone, address, provider payloads and internal moderation details are never returned.

### Chef

- `GET /api/v1/chef/reviews?kitchenId=&limit=&cursor=`
- `GET /api/v1/chef/reviews/kitchens/{kitchenId}/summary`

Chef reads are constrained by the immutable `chef_identity_id` snapshot held by Order Service.

### Admin / Support Admin

- `GET /api/v1/admin/reviews?status=&limit=&cursor=`
- `PUT /api/v1/admin/reviews/{reviewId}/moderation`
- `GET /api/v1/admin/reviews/{reviewId}/reports`
- `GET /api/v1/admin/reviews/tags`
- `PUT /api/v1/admin/reviews/tags/{code}`

Mutating admin operations require a 10–500 character `X-Admin-Reason`.

## Rating dimensions

`overallRating` is mandatory. The following are independently optional so Craves does not invent a score when a customer did not supply one:

- food taste
- portion/value
- packaging
- accuracy
- chef preparation
- delivery

Delivery remains a separate dimension and is not silently attributed to the chef.

## Moderation and versioning

New and edited reviews enter `PENDING_MODERATION`. Public visibility requires an explicit `PUBLISH` action. Customer edits use `expectedVersion` optimistic concurrency and create immutable content revisions. Admin status changes create immutable moderation-audit rows.

## Tag taxonomy

Engineering seeds no positive/negative tags. Admins may configure an allow-listed code, label and rating dimension. Customer submissions may use only active definitions. This keeps copy and product interpretation outside hard-coded backend logic.

## Review media boundary

Requests support opaque `mediaAssetIds`, but the default `ReviewMediaAuthorizer` rejects non-empty media lists. An approved media-owning implementation must verify ownership, content type and safety before this can be enabled. The service never accepts a browser-supplied storage URL or blob key.

## Scale and consistency

- one review per customer/order enforced by PostgreSQL;
- customer/order ownership checked under row lock;
- stable keyset cursors rather than offset pagination;
- bounded pages, tags, text and media count;
- page hydration uses bounded bulk tag/media/helpful-count queries rather than N+1 calls;
- public and chef partial indexes cover published cursors;
- moderation and report queues have dedicated indexes;
- helpful votes and reports are idempotent through unique keys.

## Local test

```bash
cd services/order-service
mvn -B -ntp clean verify
```

## Environment variables

None are required for text-only reviews. Media attachment remains unavailable until a separate approved `ReviewMediaAuthorizer` is wired.

## Deployment order

1. Review the V22 migration against the current target Flyway history.
2. Deploy Order Service with public APIM routes still absent.
3. Verify Flyway V22 and health/readiness.
4. Publish the exact customer/public/chef/admin operations through guarded APIM source.
5. Smoke one controlled delivered-order submission, moderation publication, aggregate read, edit/version conflict, helpful vote and report.

## Rollback

Do not delete V22 after it has been applied. Application rollback may return to the previous image; the additive tables remain dormant. APIM rollback must remove only the exact review operations.

## Deliberate exclusions

This module does not:

- change search or discovery ranking;
- calculate compensation, refunds or penalties;
- invent tag definitions;
- auto-publish or auto-hide content;
- expose reviewer PII;
- accept unverified media;
- change delivery-provider state;
- define review-retention or moderation-time SLAs.
