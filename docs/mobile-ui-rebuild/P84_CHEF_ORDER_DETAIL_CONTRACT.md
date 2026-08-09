# P84 — Chef Order Detail Contract

## Status

**DONE at authorized code/CI scope.**

P84 implements only the Guide Reference 39 Chef Order Detail contract/data/query boundary on `mobile-ui-rebuild-from-scratch`. P85 Chef New Order Detail UI/Actions and all later Chef phases remain unimplemented.

## Authorization and baseline

- Phase authorized by the user: **P84 only**.
- P84 start/control commit: `b3f6f4a81db7a7c2a5df9c2a7f53688674c56660`.
- P83 was already **DONE at authorized code/CI scope** before P84 started; the prior ledger did not support the assumption that P83 was still partial.
- No backend, APIM, infrastructure, or Customer UI source was changed.

## Exact existing contracts mapped

### Chef order detail

```http
GET /api/v1/chef/orders/{orderId}
Authorization: Bearer <Craves access token>
```

The current Order Service authorizes the request as Chef and verifies that the order's kitchen belongs to the authenticated Chef identity before returning the order. The mobile parser intentionally keeps only fields required for the Chef detail surface and does not expose `customerIdentityId` into the mobile detail model.

Mapped detail data includes:

- order, checkout, and kitchen identifiers;
- kitchen name and authoritative order status;
- currency and food/platform/tax/delivery/grand totals;
- Chef response note and preparation time when present;
- immutable server-authorized customer delivery snapshot;
- customer recipient name and contact phone from that authorized order snapshot;
- address lines, city/state/postal code, latitude, and longitude;
- order item identifiers, menu item identifiers, names, category/food type, unit price, quantity, and line total;
- server `createdAt` and `updatedAt` timestamps.

The parser fails closed on unsupported statuses, invalid UUIDs, invalid money/quantity values, malformed timestamps, malformed coordinates, or malformed item/address shapes. Legacy orders with no delivery snapshot remain readable as `deliveryAddress: null` rather than receiving invented address data.

### Accept

```http
POST /api/v1/chef/orders/{orderId}/accept
Idempotency-Key: <optional stable request key>
Content-Type: application/json
```

```json
{
  "prepTimeMinutes": 35,
  "note": "Order confirmed"
}
```

The mobile boundary forwards the optional stable idempotency key and uses the shared HTTP transport, which already supplies bearer authorization and per-request correlation metadata. Preparation time is validated only against the exact Java `Integer`/positive contract; P84 does not invent a product maximum.

### Reject

```http
POST /api/v1/chef/orders/{orderId}/reject
Idempotency-Key: <optional stable request key>
Content-Type: application/json
```

```json
{
  "reason": "Unable to prepare this order"
}
```

The reject reason remains nullable because the current backend DTO permits it. P84 does not invent a stricter required client contract.

## Server-authoritative actionability

The P84 domain model treats `CHEF_ACCEPTANCE_PENDING` from the latest server detail response as the only client-side **candidate** state for Accept/Reject. Every actionability result carries `requiresServerRevalidation: true`.

This is intentionally not a local workflow engine:

- the Chef acceptance service locks/rechecks the order before transition;
- the server validates the true acceptance deadline against database time;
- the server owns idempotent/concurrent transition handling and conflict errors;
- a locally cached pending status never overrides a later server response.

P85 must revalidate immediately before invoking an Accept/Reject mutation and must treat the mutation response/error as final actionability authority.

## Explicit Reference-39 contract gaps

The repository does not currently expose every logical field described by Guide Reference 39. P84 records these as typed `BACKEND_CONTRACT_UNAVAILABLE` capabilities instead of fabricating them.

### Acceptance deadline / countdown

Order Service stores `chef_acceptance_requested_at` and `chef_acceptance_expires_at` internally, but the public Chef `OrderResponse` does not return those fields. It also does not return `accepted_at` or `ready_at`.

Therefore mobile must **not** derive a 30-minute countdown from `createdAt`. The acceptance window opens after verified payment, not when checkout/order creation necessarily occurred.

### Status timeline

`order_status_history` exists internally, but no approved public Chef order status-history/timeline read endpoint is exposed by the current repository.

### Customer order note

The customer checkout note required by Reference 39 is not included in the current Chef `OrderResponse`.

### Payment detail

Authoritative order totals/currency/status are available, but no customer payment-method detail is exposed to the Chef order read contract.

### Contact authorization / chat / support event

The returned delivery contact snapshot is authorized by server-side Chef order ownership. However, no separate contact-permission read contract, Chef-to-customer chat contract, masking policy payload, or support-event logging mutation is exposed. P84 therefore exposes the authorized order contact snapshot but keeps the broader Reference-39 contact/chat capability explicitly unavailable.

## Query ownership

`useChefOrderDetailContract(orderId)` adds a private Chef-scoped TanStack Query boundary:

- cache identity includes authenticated user, `CHEF` role, and order ID;
- invalid/non-UUID order IDs do not execute transport calls;
- reads are abortable through the shared HTTP client;
- detail data uses a short bounded stale time and explicit refresh;
- no polling loop is introduced;
- no second Chef order-list/counter owner is introduced; P81 remains the shared operational owner for list counters/badges.

## Files changed

- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.ts`
- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.test.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDetailModel.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDetailModel.test.ts`
- `apps/mobile/src/features/chefOrders/state/useChefOrderDetailContract.ts`

## Validation

**Validated P84 mobile code head:** `270897f7e59950f88fcc38ed121cb21f5e1cd148`.

**GitHub Actions:** workflow run `31305596449`, job `93225354790` — **SUCCESS**.

Passed gates:

- dependency install from lockfile;
- TypeScript strict check;
- ESLint;
- Jest, including P84 parser/route/idempotency/actionability tests;
- production Android JavaScript bundle;
- backend/APIM/infrastructure source guard.

The P84 start-to-mobile-head compare contains only the five new `apps/mobile/src/features/chefOrders/**` files. No backend/APIM/infrastructure source changed.

No per-phase APK/AAB was built, consistent with project policy. Physical Android/reference-image certification belongs to the later visual QA phases; P84 is a contract/data/query phase.

## Phase boundary / handoff

P84 does **not** add:

- a Chef order-detail screen or registered detail route;
- sticky Accept/Reject UI;
- action modals, duplicate-tap UI guards, or mutation orchestration;
- call/chat/map-deep-link UI;
- bottom-navigation hiding for the immersive detail screen;
- later preparing/ready/completed Chef order screens.

Those presentation/action-orchestration responsibilities begin with **P85 — Chef New Order Detail UI/Actions**.

- Current completed phase: **P84 — Chef Order Detail Contract — DONE at authorized code/CI scope**.
- Next phase in sequence: **P85 — Chef New Order Detail UI/Actions — NOT STARTED**.
- Next phase authorization: **NONE**.
- Required action: **stop after P84; do not pre-implement P85 without explicit user direction.**
