# Craves Backend Ratings, Reviews and Home-Chef Trust — Engineering Handover

Date: 2026-09-11  
Service: Order Service  
Migration: `V22__order_reviews_and_trust_foundation.sql`  
Runtime posture: source only; no Azure/APIM/database mutation performed while building this package

## Outcome

The previously empty ratings/reviews capability is replaced by an additive, ownership-safe backend foundation that can support the later customer, chef and admin frontends without copying stale order data or inventing commercial consequences.

## Architecture decision

Order Service owns review eligibility because it already owns the immutable order, customer ownership, kitchen snapshot, chef ownership snapshot and delivered state. This avoids runtime joins to Catalog or User/Chef databases and prevents a browser from asserting that an order was delivered.

Catalog may later consume an aggregate projection for discovery cards, but no review weight or ranking rule is introduced here.

## State model

- `PENDING_MODERATION` — new or customer-edited content; never public.
- `PUBLISHED` — explicitly approved for public/chef aggregate reads.
- `HIDDEN` — removed from public reads without deleting evidence.
- `REJECTED` — not approved for public display.

This model is fail-closed. No automatic moderation threshold, review expiry, penalty or appeal rule is assumed.

## Customer write guarantees

A submission is accepted only when:

1. the caller has CUSTOMER role;
2. the referenced order exists and belongs to the caller;
3. the authoritative order state is `DELIVERED`;
4. the order row is locked during eligibility and write;
5. the mandatory overall score and any optional dimension scores are integers from 1 through 5;
6. tags are active admin-configured definitions;
7. text/media bounds pass;
8. the order has no existing customer review for create;
9. updates present the current optimistic `expectedVersion`.

The database independently enforces one review per customer/order and rating/status constraints.

## Trust dimensions

- overall
- food taste
- portion/value
- packaging
- accuracy
- chef preparation
- delivery

Only overall is mandatory. A missing optional score remains `NULL` and is excluded from that dimension's average. Delivery is stored and aggregated separately so a courier issue cannot silently reduce the chef-preparation score.

## Privacy model

Public and chef views exclude:

- customer identity ID;
- phone/email;
- delivery address;
- checkout/payment/provider references;
- raw reports;
- moderation reasons;
- staff identity IDs;
- internal storage keys.

Public responses contain only published review content, safe rating dimensions, configured tag codes, opaque authorized media asset IDs, helpful count and publication time.

## Moderation and evidence

Every customer content version is appended to `order_review_revision`. Every moderation transition is appended to `order_review_moderation_audit` with actor, old/new state, reason and timestamp. Hiding or rejecting a review does not delete its evidence.

Reports never auto-hide or mutate a review. They are durable moderation signals only; an authorized human/service must apply an explicit reviewed action.

## Configurable tag taxonomy

No tag rows are seeded. Admins define codes, display labels, rating dimensions, activation state and sort order. The API normalizes codes to uppercase `[A-Z0-9_]` and customer writes reject unknown/inactive codes.

This enables later selectable tags while leaving wording, category meaning and rollout decisions with product/operations.

## Media extension point

The contract carries up to five opaque media asset IDs. The default authorizer rejects any non-empty list with a safe service-unavailable response. A future media-owning adapter must prove authenticated ownership and content safety before Order Service persists references.

No raw file body, public URL, SAS URL, blob container or key is accepted in the review API.

## Pagination and query design

Customer, public, chef and moderation reads use timestamp + UUID keyset cursors. Public and chef queries use `published_at`; customer/admin queries use `updated_at`. Pages are bounded to 50.

Hydration runs a bounded set of bulk queries for tags, media and helpful counts. It does not issue per-review database queries.

## Idempotency and concurrency

- PostgreSQL unique key prevents duplicate reviews.
- optimistic version prevents lost customer edits.
- helpful vote primary key makes repeated PUT safe.
- report unique key makes repeated report submission safe.
- row locks protect delivered-order eligibility and moderation transitions.

## APIs prepared for later frontend work

Customer:

```text
POST /api/v1/orders/{orderId}/review
PUT  /api/v1/orders/{orderId}/review
GET  /api/v1/orders/{orderId}/review
GET  /api/v1/reviews/mine
GET  /api/v1/reviews/tags
PUT  /api/v1/reviews/{reviewId}/helpful
DELETE /api/v1/reviews/{reviewId}/helpful
POST /api/v1/reviews/{reviewId}/reports
```

Public:

```text
GET /api/v1/public/kitchens/{kitchenId}/reviews
GET /api/v1/public/kitchens/{kitchenId}/reviews/summary
```

Chef:

```text
GET /api/v1/chef/reviews
GET /api/v1/chef/reviews/kitchens/{kitchenId}/summary
```

Admin/support:

```text
GET /api/v1/admin/reviews
PUT /api/v1/admin/reviews/{reviewId}/moderation
GET /api/v1/admin/reviews/{reviewId}/reports
GET /api/v1/admin/reviews/tags
PUT /api/v1/admin/reviews/tags/{code}
```

## Safety boundaries

No code in this package:

- changes an order, payment, refund or delivery state;
- calculates commission, compensation, promotion or ranking;
- publishes review content automatically;
- exposes private customer/order/provider evidence;
- guesses FSSAI/hygiene verification;
- activates a delivery provider;
- creates or scales an Azure resource.

## Validation matrix

Source CI performs:

- Java 21 Maven `clean verify` for Order Service;
- cursor round-trip and malformed-input tests;
- rating/version/tag/text/media validation tests;
- migration contract checks for ownership, moderation, evidence and partial indexes;
- static checks that tag taxonomy is not seeded;
- public-route and privacy/source boundary scans.

## Production rollout later

The feature must remain invisible until the exact Order Service image is deployed, Flyway V22 is validated, APIM operations are published, and authenticated smoke evidence is captured. Deployment is not part of this source package.

## Manual steps later

Human work is limited to:

1. approve the initial tag labels/taxonomy, if tags will be shown;
2. define the moderation operating process and authorized staff;
3. approve a media-storage/content-safety integration before photo reviews;
4. run the guarded deployment/APIM pipelines and controlled smoke test.

No secret, provider contract, new Azure resource or product pricing rule is required for text-only ratings/reviews.
