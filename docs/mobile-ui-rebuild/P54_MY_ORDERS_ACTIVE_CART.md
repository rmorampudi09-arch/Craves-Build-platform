# P54 — My Orders — Active Cart

**Status:** PARTIAL  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized scope:** P54 only  
**Starting branch SHA:** `6bda665b45bd08554d6a94425ed3a41f4f5d7c2b`  
**Validated implementation SHA:** `6320289f9c51dd866dc440c951a5a566ce7c081e`  
**CI run/job:** `31266801670` / `93126154241` — SUCCESS

## 1. Authority reviewed

P54 was implemented only after reviewing the current branch versions of:

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- `docs/mobile-ui-rebuild/P53_MY_ORDERS_EMPTY_CART.md`
- the controlled full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, specifically Reference Image 10 / My Orders — Active Cart
- the existing shared cart domain, route chrome policy, `SharedViewCartOverlay`, Customer Cart route, and previously accepted active-cart patterns from Home/Chef discovery

The implementation preserves the contract hierarchy: the existing mobile/cart architecture and exact backend contracts remain authoritative; the guide/reference defines the target active-cart state only where the current contracts safely support it.

## 2. Implemented boundary

P54 keeps the P53 `CustomerOrdersScreen` as the single Orders implementation and adds a thin `CustomerOrdersRouteScreen` for state-driven active-cart chrome.

Implemented supportable Reference 10 behavior includes:

- reuse of the existing shared `SharedViewCartOverlay` instead of creating an Orders-specific cart implementation;
- View Cart remains hidden at zero items and appears automatically when the authoritative cart domain has items;
- View Cart displays the live item count and the currently supported authoritative cart food subtotal through the accepted shared overlay model;
- View Cart opens the existing real `CustomerCart` route in the Orders stack;
- the Orders content receives dynamic bottom clearance while View Cart is visible so the final order card remains reachable above the floating cart control and customer bottom navigation;
- the extra clearance disappears immediately when the cart becomes empty, restoring the P53 empty-cart layout state;
- tab changes, pull-to-refresh, background order refresh, and Orders scroll state continue to operate through the existing P53 screen without owning or copying cart state;
- the customer bottom navigation remains the accepted shared navigation implementation and continues to use the existing scroll hide/reveal controller;
- focused tests cover Orders route View Cart eligibility and the dynamic content inset behavior.

No duplicate Orders screen, cart store, API wrapper, navigation container, or static active-cart variant was created.

## 3. Fail-closed decisions and blockers

### 3.1 Reorder/cart merge or replacement

Reference 10 requires reorder actions to validate current availability, pricing, address/serviceability, kitchen compatibility, and resolve merge/replace conflicts with an existing cart.

The current rebuild still has no authoritative reorder eligibility/cart reconstruction/merge-replacement contract exposed to this Orders surface. P53 already keeps Reorder fail-closed instead of cloning stale order lines locally. P54 preserves that behavior and does not invent a merge decision flow.

Recorded blocker:

- `P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE`

This blocker prevents P54 from being honestly marked DONE even though the active View Cart state itself is implemented and validated.

### 3.2 Order lifecycle/detail/tracking dependencies

P54 is a state variant of the same Orders route and therefore inherits the still-open P53/P52 constraints:

- `CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE`
- `P53_ORDER_DETAIL_ROUTE_CONTRACT_UNAVAILABLE`
- `P53_TRACKING_ROUTE_CONTRACT_UNAVAILABLE`
- `P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE`
- `P53_REFERENCE_ORDER_CARD_METADATA_UNAVAILABLE`
- `P53_NOTIFICATION_INBOX_ROUTE_UNAVAILABLE`

P54 does not broaden its scope into P55/P56 to resolve those later-owned capabilities.

### 3.3 Cart total boundary

The accepted shared View Cart overlay currently presents the cart domain's authoritative `foodSubtotal`. P54 reuses that boundary and does not fabricate taxes, fees, delivery quote, coupon-adjusted totals, or checkout totals when those values are not part of the current shared overlay contract.

## 4. Changed files

Implementation/test:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerOrders/customerOrdersActiveCart.ts`
- `apps/mobile/src/features/customerOrders/customerOrdersActiveCart.test.ts`
- `apps/mobile/src/features/customerOrders/screens/CustomerOrdersRouteScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P54_MY_ORDERS_ACTIVE_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, or Gradle/APK configuration was changed.

## 5. Validation

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31266801670`, job `93126154241`, head `6320289f9c51dd866dc440c951a5a566ce7c081e`:

- dependency install — SUCCESS
- TypeScript strict check — SUCCESS
- ESLint zero-warning gate — SUCCESS
- Jest — SUCCESS
- production Android JavaScript bundle — SUCCESS
- backend/APIM/infrastructure source guard — SUCCESS

The focused P54 tests passed as part of Jest. The implementation diff from the P53 ledger head contains only the four intended mobile files.

No per-phase APK was generated, consistent with the rebuild policy. Physical-device/reference-image certification remains deferred to the later visual QA gates.

## 6. Acceptance result

P54 is **PARTIAL**, not DONE.

The supportable Reference 10 active-cart behavior is implemented and CI-validated: View Cart is live on Orders, opens the real Cart route, stays synchronized with the shared cart state, disappears at zero, and does not obscure the final Orders content.

Full P54 acceptance remains blocked by the missing authoritative reorder/cart merge-replacement capability required by the phase acceptance and master guide. No fake reorder, stale local cart rebuild, inferred compatibility rule, or invented backend contract was introduced.

## 7. Handoff

```text
Current branch: mobile-ui-rebuild-from-scratch
Current implemented phase: P54 — PARTIAL
Validated implementation SHA: 6320289f9c51dd866dc440c951a5a566ce7c081e
CI: 31266801670 / 93126154241 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P54_MY_ORDERS_ACTIVE_CART.md
P54 blocker: P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE
Inherited Orders blockers: CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE; P53_ORDER_DETAIL_ROUTE_CONTRACT_UNAVAILABLE; P53_TRACKING_ROUTE_CONTRACT_UNAVAILABLE; P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE; P53_REFERENCE_ORDER_CARD_METADATA_UNAVAILABLE; P53_NOTIFICATION_INBOX_ROUTE_UNAVAILABLE
Next phase: P55 — Order Detail, Timeline, and Tracking — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
