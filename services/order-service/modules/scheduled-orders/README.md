# Scheduled Orders Backend Foundation

## Purpose

This Order Service module allows a customer to attach an explicit future fulfilment request to an existing owned `PAYMENT_PENDING` checkout. It records per-kitchen chef confirmation evidence and exposes a server-to-server payment-eligibility check.

No scheduling policy is seeded. A kitchen supports scheduling only after an ADMIN explicitly configures:

- whether scheduling is active;
- minimum lead time;
- maximum scheduling horizon;
- whether payment is allowed before chef confirmation or only after every chef confirms.

## Customer APIs

```text
GET    /api/v1/checkouts/{checkoutId}/schedule/capability
POST   /api/v1/checkouts/{checkoutId}/schedule
GET    /api/v1/checkouts/{checkoutId}/schedule
DELETE /api/v1/checkouts/{checkoutId}/schedule
```

`POST` requires an `Idempotency-Key` header between 8 and 128 characters and a body:

```json
{
  "requestedFulfilmentAt": "2026-09-12T07:30:00Z",
  "requestedTimezone": "Asia/Kolkata"
}
```

The customer must own the checkout. The checkout and every sub-order must still be `PAYMENT_PENDING`. Each kitchen must have an active policy, all policies must use the same payment gate, and the requested instant must be inside every kitchen's configured window.

A retry with the same idempotency key and payload returns the same request. Reusing the key for another payload fails closed.

Withdrawal is intentionally narrow: before payment, while the request is still pending and before any chef responds. Confirmed/rejected/paid consequences remain product-policy gated.

## Chef APIs

```text
GET /api/v1/chef/scheduled-orders?responseStatus=&scheduleStatus=&limit=&cursor=
PUT /api/v1/chef/scheduled-orders/{scheduleRequestId}/orders/{orderId}/response
```

Chef queue reads are constrained by the immutable `chef_identity_id` snapshot held in Order Service. Responses require `expectedVersion` and are idempotent for the already-recorded same action.

Chef acceptance/rejection updates only scheduling evidence. It does not change the commercial order state, issue a refund, create a delivery, or silently select a replacement time.

## Admin APIs

```text
GET /api/v1/admin/scheduled-order-policies/{kitchenId}
PUT /api/v1/admin/scheduled-order-policies/{kitchenId}
```

Policy writes require ADMIN role, optimistic `expectedVersion` for updates, and a 10–500 character `X-Admin-Reason`. Every version is captured in an append-only JSON audit row.

No policy defaults are inserted by Flyway.

## Internal payment gate

```text
GET /internal/v1/checkouts/{checkoutId}/schedule-payment-eligibility
X-Craves-Internal-Secret: <existing internal service secret>
```

The response never starts a charge. It says whether the current checkout is eligible for payment:

- ASAP + `PAYMENT_PENDING`: eligible;
- scheduled with `PAYMENT_BEFORE_CHEF_CONFIRMATION`: eligible while the request remains valid;
- scheduled with `PAYMENT_AFTER_ALL_CHEFS_CONFIRM`: eligible only after every response is accepted and the request is `CONFIRMED`;
- expired, rejected, cancelled, inconsistent or missing evidence: not eligible.

The Integration Service must call this operation before creating a payment order when the scheduled-order rollout is enabled.

## Database

`V23__scheduled_order_foundation.sql` adds:

- schedule snapshots on checkout and each customer order;
- policy + policy audit;
- customer schedule request;
- per-order kitchen/chef response;
- idempotency, active-request, owner/cursor and chef-queue indexes.

The migration is additive. Do not edit or delete it after it is applied.

## Scale and consistency

- checkout and sub-orders are row locked before a schedule is attached;
- one active schedule request per checkout is enforced by a partial unique index;
- customer idempotency is enforced by PostgreSQL and a SHA-256 request fingerprint;
- per-chef queue uses requested-time + UUID keyset pagination;
- policy updates and chef responses use optimistic versions;
- payment eligibility is a read-only, retry-safe internal operation.

## Local test

```bash
cd services/order-service
mvn -B -ntp clean verify
```

## Environment variables

No new secret is required. The internal operation reuses:

```text
CRAVES_INTERNAL_SERVICE_KEY
```

## Deployment order later

1. Verify the target Order Service Flyway history through V22.
2. Deploy the V23-capable Order Service image with no schedule policy configured.
3. Publish the exact customer/chef/admin/internal operations through guarded APIM source.
4. Configure one non-production kitchen policy using explicit approved values.
5. Wire Integration Service payment creation to the internal eligibility operation.
6. Test both payment-gate modes, idempotency, two-chef confirmation, expiry and cross-identity access.
7. Enable customer/chef frontend surfaces only after the backend evidence is accepted.

## Deliberate exclusions

This module does not invent:

- standard lead time or maximum horizon;
- customer-visible slot sizes;
- cutoff, cancellation, refund or compensation rules;
- chef penalty or reliability scoring;
- payment timing;
- holiday/vacation behavior;
- delivery-provider booking timing;
- preparation-time adjustment policy.
