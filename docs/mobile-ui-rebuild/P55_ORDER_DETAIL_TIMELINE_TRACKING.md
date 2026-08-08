# P55 — Order Detail, Timeline, and Tracking

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** PARTIAL  
**Scope owner:** customer order detail child route, provider-neutral delivery tracking child route, exact delivery-history timeline, bounded foreground refresh, and My Orders navigation into those routes.

## Source audit

P55 was started only after the user explicitly authorized the single next phase after P54. The implementation was checked against `plan.md`, `phases.md`, `agent.md`, `build.md`, the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, and the current Order Service/APIM source.

The current authoritative customer read routes are:

```text
GET /api/v1/orders/{orderId}
GET /api/v1/orders/{orderId}/delivery-status
```

The first route is defined by `OrderController.getOrder(...)`, backed by `OrderService.getOrderForCustomer(...)`, and is exposed by the existing customer-order APIM read configuration. Ownership is enforced by `orderId + customer_identity_id`; a missing or differently owned order returns 404.

The delivery route is defined by `DeliveryStatusController.getDeliveryStatus(...)`, `DeliveryStatusQueryService.getForCustomer(...)`, `contracts/openapi/order-delivery-status-v1.openapi.json`, and the existing APIM delivery-status module. It returns a provider-neutral projection with at most 100 chronological history entries. An owned order before delivery projection exists returns HTTP 200 with nullable delivery fields and an empty history.

## Implemented boundary

### Order detail

- Adds typed `CustomerOrderDetail` child navigation using only `orderId`.
- Uses the exact `GET /api/v1/orders/{orderId}` route.
- Reuses the P52 customer-safe order allowlist, stripping customer identity, contact phone, coordinates, pickup/private chef fields, and unknown fields.
- Verifies the returned order ID equals the requested route ID.
- Keeps detail server state in a private customer/identity/order scoped React Query key.
- Reconciles a refreshed detail into the already-cached newest-50 Orders snapshot only when that order already exists in the list; it does not invent insertion/pagination semantics.
- Renders verified kitchen/status/timestamps/items/bill/address/chef note/prep time only from the current response.
- Handles invalid IDs, signed-out sessions, offline state, stale cached data, 403 role denial, 404 missing/wrong-owner orders, retry, and pull-to-refresh.
- Preserves the existing Orders tab/list instance and scroll state because detail is pushed into the same Orders stack.

### Delivery tracking

- Adds typed `CustomerOrderTracking` child navigation using only `orderId`.
- Uses only `GET /api/v1/orders/{orderId}/delivery-status`; no provider API is called directly.
- Parses the exact 14 provider-neutral states from the current OpenAPI contract:
  `PENDING`, `SEARCHING`, `COURIER_ASSIGNED`, `COURIER_TO_PICKUP`, `AT_PICKUP`, `PICKED_UP`, `IN_TRANSIT`, `AT_DROPOFF`, `DELIVERED`, `CANCELLED`, `DELAYED`, `RETURNING`, `RETURNED`, `FAILED`.
- Rejects unknown states, mismatched order IDs, invalid timestamps, oversized history, and non-chronological history.
- Accepts the documented pre-delivery owned-order state only when delivery fields are null and history is empty.
- Removes non-HTTPS tracking URLs and strips unapproved/raw provider fields.
- Renders the server-provided delivery history as the delivery timeline; it does not synthesize event timestamps.
- Uses a controlled 30-second refresh only while the React Native app is foreground-active and the delivery is non-terminal.
- Automatic refresh stops for `DELIVERED`, `CANCELLED`, `RETURNED`, and `FAILED`, and also stops for non-retriable 4xx access/resource errors.
- Pull-to-refresh remains available in ready states.
- External tracking opens only after the parsed HTTPS URL passes the platform open check.
- No ETA, courier coordinates, map geometry, provider transaction metadata, cancellation result, or refund result is invented.

### My Orders action wiring

- Tapping an order card or `View Details` now opens the real detail child route.
- Existing P53 `Track Order` presentation for `PREPARING`, `READY_FOR_PICKUP`, and `OUT_FOR_DELIVERY` now opens the real tracking child route.
- `Reorder` remains disabled. P55 does not cross into P56 reorder/cancellation/refund eligibility.

## Acceptance blocker

P55 records:

```text
P55_ORDER_STATUS_TIMELINE_CONTRACT_UNAVAILABLE
```

The Order Service maintains internal order status history, but the current customer Order Controller/APIM/OpenAPI surface does not expose an owned-customer order-status event timeline. The customer detail route exposes only the current order status plus `createdAt`/`updatedAt`. P55 therefore does not fabricate lifecycle events or timestamps.

The delivery-status route does expose an exact bounded delivery event history, and that real history is implemented as the delivery timeline. Because the guide calls for both order details/timeline and delivery tracking, the missing public customer order-status timeline keeps P55 **PARTIAL**, not DONE.

Existing upstream My Orders blockers remain unchanged where they are not owned by P55, including server pagination/global lifecycle bucket mapping, reference-only card metadata, notification inbox routing, and reorder/cart merge policy.

## Tests added

- `customerOrderDetailApi.test.ts`
  - exact detail route/dedupe key;
  - malformed-ID fail-before-network;
  - customer-safe response allowlist;
  - route/response order ID mismatch failure.
- `customerOrderTrackingApi.test.ts`
  - exact delivery-status route;
  - pre-delivery null projection;
  - raw-field stripping and HTTPS-only link safety;
  - unknown-state and chronology rejection;
  - route/response order ID mismatch failure.
- `customerOrderTrackingPresentation.test.ts`
  - 30-second controlled refresh constant;
  - terminal-state stop set;
  - provider-neutral customer presentation mapping.

## Files changed

Implementation/test:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerOrders/api/customerOrdersApi.ts`
- `apps/mobile/src/features/customerOrders/api/customerOrderTrackingApi.ts`
- `apps/mobile/src/features/customerOrders/components/CustomerOrderCard.tsx`
- `apps/mobile/src/features/customerOrders/domain/customerOrderTrackingTypes.ts`
- `apps/mobile/src/features/customerOrders/presentation/customerOrdersPresentation.ts`
- `apps/mobile/src/features/customerOrders/presentation/customerOrderTrackingPresentation.ts`
- `apps/mobile/src/features/customerOrders/query/customerOrdersQueries.ts`
- `apps/mobile/src/features/customerOrders/screens/CustomerOrderDetailScreen.tsx`
- `apps/mobile/src/features/customerOrders/screens/CustomerOrderTrackingScreen.tsx`
- `apps/mobile/src/features/customerOrders/customerOrderDetailApi.test.ts`
- `apps/mobile/src/features/customerOrders/customerOrderTrackingApi.test.ts`
- `apps/mobile/src/features/customerOrders/customerOrderTrackingPresentation.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P55_ORDER_DETAIL_TIMELINE_TRACKING.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, dependency, Android native, Gradle, APK, or AAB source is modified by P55.
