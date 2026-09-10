# Craves Scheduled Orders Backend — Engineering Handover

Date: 2026-09-11  
Service owner: Order Service  
Migration: `V23__scheduled_order_foundation.sql`  
Runtime state: source only; no production deployment, APIM publication, payment change or provider call

## Executive outcome

Craves now has an additive scheduled-order backend contract that can support a later `ASAP | Schedule` frontend without guessing lead times, future horizon, slots, payment timing, cancellation consequences or delivery-provider behavior.

The design starts from an already-created, owned `PAYMENT_PENDING` checkout. This preserves existing cart, checkout, payment and multi-kitchen splitting. Scheduling attaches a requested future instant and IANA timezone, creates one response row for every chef-specific order, and exposes a read-only payment gate to Integration Service.

## Why Order Service owns the domain

Order Service already owns:

- customer checkout ownership;
- chef-specific sub-orders;
- immutable kitchen and chef ownership snapshots;
- authoritative commercial order status;
- payment-pending state;
- delivery-address and item snapshots.

Scheduling therefore does not create a second order system or query another service database. Catalog continues to own menu/opening truth. Integration continues to own payment providers and delivery providers.

## Fail-closed product-policy model

Flyway inserts no policy rows. An administrator must explicitly configure each kitchen with:

1. `active`;
2. `minLeadMinutes`;
3. `maxHorizonMinutes`;
4. `paymentGate`.

The two payment-gate values are technical options, not defaults:

- `PAYMENT_BEFORE_CHEF_CONFIRMATION`;
- `PAYMENT_AFTER_ALL_CHEFS_CONFIRM`.

A checkout with multiple kitchens is schedulable only when every kitchen has an active policy and all policies use the same payment gate. Mixed gates fail closed so engineering does not choose a commercial interpretation on the owner's behalf.

## Customer schedule creation

The creation transaction:

1. authenticates CUSTOMER role;
2. validates future instant, IANA timezone and bounded idempotency key;
3. locks the owned checkout;
4. returns the prior resource for an exact idempotent retry;
5. rejects reuse of the same key for a changed payload;
6. verifies checkout remains `PAYMENT_PENDING`;
7. locks all chef-specific orders;
8. verifies every order remains `PAYMENT_PENDING`;
9. loads and locks every active kitchen policy;
10. verifies policy coverage and one common payment gate;
11. verifies the requested instant falls inside each configured lead/horizon window;
12. inserts one durable schedule request;
13. inserts one pending kitchen response per order;
14. snapshots mode, instant, timezone and request ID onto checkout and every order;
15. returns the complete request and per-kitchen evidence.

No money is charged and no order or delivery status changes.

## Idempotency

The caller provides `Idempotency-Key`. Order Service stores:

- customer identity;
- key;
- canonical SHA-256 fingerprint of checkout ID, requested instant and canonical timezone.

PostgreSQL enforces customer/key uniqueness. Checkout row locking and a partial unique active-request index prevent two concurrent keys from creating two active schedules.

The same key + same payload is safe to retry. The same key + changed payload returns a conflict. A different key while another request is active also conflicts.

## Rescheduling and evidence preservation

Cancelled and rejected requests remain as history. The database permits a later replacement request while ensuring only one pending/confirmed request is active for a checkout.

The narrow withdrawal operation is allowed only:

- before payment;
- while request status is `PENDING_CHEF_CONFIRMATION`;
- before any chef has responded.

It resets checkout/order scheduling snapshots to ASAP but leaves historical request/response rows. Once a chef responded or the request became confirmed/rejected, the backend refuses to invent a cancellation or compensation consequence.

## Chef queue

Chef queue reads use the immutable `customer_order.chef_identity_id` snapshot introduced by Order History v2. The caller cannot supply a chef ID.

The query supports optional schedule/response status filters, a bounded page size and requested-time + schedule UUID + order UUID keyset cursor. No global marketplace scan or offset pagination is used.

## Chef response

A chef response transaction:

1. authenticates CHEF role;
2. validates action, note and optimistic version;
3. locks the exact response and parent request;
4. verifies immutable chef ownership;
5. requires both request and response to remain pending;
6. refuses a response after the requested time has passed;
7. writes accepted/rejected evidence once;
8. recomputes parent status:
   - any rejection → `REJECTED`;
   - no pending responses and no rejection → `CONFIRMED`;
   - otherwise → `PENDING_CHEF_CONFIRMATION`.

A repeated identical response is idempotent. A contradictory second action fails closed.

Chef rejection does not refund, cancel, reassign, penalize or silently pick another time. Those consequences remain product/operations policy.

## Payment eligibility

Integration Service receives no direct table access. It calls a protected internal operation using the existing Craves internal service secret.

The operation returns:

- checkout ID;
- fulfilment mode;
- boolean eligibility;
- machine-readable reason;
- schedule request ID/status when relevant.

Decision rules are policy-derived:

- non-`PAYMENT_PENDING` checkout → blocked;
- ASAP checkout → eligible;
- missing/inconsistent/expired schedule evidence → blocked;
- cancelled/rejected request → blocked;
- pre-confirmation payment gate → eligible while valid;
- after-all-confirm gate → eligible only when every response is accepted and request is confirmed.

The endpoint never creates, verifies or captures a payment.

## Admin policy management

Only ADMIN may create/update a kitchen policy. Every write requires a 10–500 character `X-Admin-Reason`.

New policies require all explicit fields and no `expectedVersion`. Existing policies require the current `expectedVersion`; stale writes conflict. The old and new complete policy snapshots are stored in an append-only JSON audit row with actor and reason.

No kitchen receives scheduling merely because the migration is deployed.

## Data model

### Checkout and order snapshots

Both receive:

- `fulfilment_mode` (`ASAP` or `SCHEDULED`);
- `requested_fulfilment_at`;
- `requested_timezone`;
- `schedule_request_id`.

### Policy

One row per kitchen containing activation, lead, horizon, payment gate, version and audit actor.

### Request

Customer/checkout-owned future request with immutable idempotency evidence, state, timestamps and version.

### Kitchen response

One row per request/order containing kitchen, immutable chef snapshot, copied payment gate, response state/note/time and version.

## Index strategy

- active schedule uniqueness by checkout through a partial index;
- customer idempotency uniqueness;
- customer history cursor;
- chef response queue;
- requested-time cursor;
- active policy lookup;
- checkout/order schedule lookup.

No unbounded job or status-history table is introduced.

## Security and privacy

Customer APIs derive identity from the authenticated principal. Chef APIs derive ownership from the Order snapshot. Admin APIs require role and reason. Internal payment eligibility uses constant-time secret comparison.

The scheduling contract exposes no payment credentials, provider identifiers, customer phone/address, pickup address, internal key, raw events or other chef identities.

## API inventory

Customer:

```text
GET    /api/v1/checkouts/{checkoutId}/schedule/capability
POST   /api/v1/checkouts/{checkoutId}/schedule
GET    /api/v1/checkouts/{checkoutId}/schedule
DELETE /api/v1/checkouts/{checkoutId}/schedule
```

Chef:

```text
GET /api/v1/chef/scheduled-orders
PUT /api/v1/chef/scheduled-orders/{scheduleRequestId}/orders/{orderId}/response
```

Admin:

```text
GET /api/v1/admin/scheduled-order-policies/{kitchenId}
PUT /api/v1/admin/scheduled-order-policies/{kitchenId}
```

Internal:

```text
GET /internal/v1/checkouts/{checkoutId}/schedule-payment-eligibility
```

## Test coverage

The module includes tests for:

- deterministic request fingerprints;
- same-payload and changed-payload distinction;
- future-time enforcement;
- IANA timezone validation;
- idempotency-key bounds;
- explicit policy fields;
- lead/horizon consistency;
- create/update version contract;
- chef action/version/note validation;
- cursor round-trip and malformed input;
- migration tables, constraints, statuses, payment gates and indexes;
- absence of seeded schedule policies or destructive schema operations.

The full Order Service Maven suite remains authoritative for regression coverage.

## Integration sequence

1. merge source after CI;
2. add Integration Service pre-payment guard client;
3. keep all schedule policies absent/inactive until operations supplies values;
4. deploy Order Service V23;
5. publish APIM routes;
6. configure one controlled test kitchen;
7. test both payment gates and multi-chef behavior;
8. activate frontend only after accepted evidence.

## Rollback

Application rollback may restore the previous Order image. V23 is additive and must remain after application rollback. With no active policies and no APIM routes, the feature is dormant.

APIM rollback must remove only exact schedule operations. Policy deactivation is the runtime kill switch; it prevents new schedule requests without deleting existing evidence.

## Deliberately pending product decisions

- standard minimum lead;
- maximum future horizon;
- visible slot size/list;
- payment-before versus payment-after confirmation;
- customer change/cancel cutoff;
- refund or compensation consequence;
- chef rejection consequence;
- auto-confirm behavior;
- holiday/vacation semantics;
- delivery booking lead time;
- scheduled-order fee or discount;
- notification timing/copy.

Every pending value is represented by an explicit policy/configuration boundary rather than an invented default.
