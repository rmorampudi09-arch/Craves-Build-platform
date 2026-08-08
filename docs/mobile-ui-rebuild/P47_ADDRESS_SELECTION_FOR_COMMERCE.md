# P47 — Address Selection for Commerce

**Status:** PARTIAL  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Starting branch head:** `02938b1286d8207d00b1af71e393e13a5c5bdecb`  
**Validated implementation commit:** `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41`  
**CI run/job:** `31260111878` / `93109503409` — SUCCESS

## 1. Authorized Scope

P47 is limited to **Address Selection for Commerce**. `phases.md` requires selecting/changing a delivery address from Cart/Checkout using exact address/serviceability contracts, preserving origin context, and refreshing serviceability/fee/ETA without duplicating the cart.

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` requires saved-address selection to preserve the originating Cart/Checkout state, keep the active cart synchronized, and drive delivery serviceability/fee/ETA refresh. The guide also prohibits inventing backend contracts.

P48 remains a separate phase and owns the exact delivery quote/reprice endpoint(s) and orchestration.

## 2. Exact Contracts Audited

### Saved addresses — supported

Authoritative backend source:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/CustomerProfileController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/README.md`
- existing mobile adapter `apps/mobile/src/features/customerShell/api/customerShellApi.ts`

Exact supported route reused by the existing mobile query layer:

```text
GET /api/v1/customer/addresses
```

The mobile parser already validates the saved-address UUID, coordinates, label/display information, and exposes only the customer-safe location model. No new endpoint or duplicate address cache was introduced.

### Cart validation — insufficient for delivery quote refresh

Authoritative source:

- `services/order-service/src/main/java/in/craves/order/web/CartController.java`
- `services/order-service/README.md`

Current route:

```text
POST /api/v1/cart/validate
```

It accepts no delivery-address input and returns the current `CartResponse`; it does not return authoritative serviceability, delivery fee, ETA, or a pre-checkout quote.

Repository search found no authoritative mobile/backend implementation of `/api/v1/checkout/quote` or another exact pre-checkout quote/reprice contract. Existing Order Service documentation also records delivery radius/pricing/serviceability as not yet defined for the current implementation boundary.

Therefore P47 does **not** invent or call a quote endpoint. A changed delivery address invalidates the existing delivery-quote dependency, and P48 remains responsible for resolving it when an exact contract exists.

## 3. Implemented Boundary

### Cart-origin delivery-address mode

The existing shared `CustomerLocationSelector` now detects when its owning route is `CustomerCart` and switches to commerce-specific copy and selection state without creating a second address picker or navigation tree.

From Cart:

1. saved addresses still come from the existing authenticated saved-address query;
2. the selected checkmark is driven by `cart.dependencies.address.addressId` rather than only the browsing-location selection;
3. tapping an address keeps the existing shared browsing location synchronized through `selectLocation`, preserving the already-established dependent Home-feed invalidation behavior;
4. the same exact saved-address ID is promoted into the cart address dependency;
5. choosing a different address marks `cart.dependencies.deliveryQuote.status` as `STALE`;
6. choosing the already-selected address does not churn the delivery-quote state;
7. the selector closes back onto the same Cart screen, so Cart state, tab stack, quantities, and scroll/navigation origin are not duplicated or replaced.

This makes the current Cart address selection a real commerce dependency rather than the P46 browsing-location-only placeholder behavior.

### Fail-closed quote boundary

The new `resolveCartAddressSelection` domain transition intentionally separates address selection from delivery-quote orchestration:

- authoritative saved address selected -> cart address dependency becomes current;
- address changed -> existing delivery quote becomes stale;
- no local fee, ETA, distance-based serviceability, tax, or grand-total arithmetic is created;
- no checkout session is used as a quote;
- no unsupported network route is invented.

The existing P45/P46 Cart presentation therefore continues to fail closed while the quote is stale/unavailable.

## 4. Focused Tests

Added `apps/mobile/src/features/cart/cartAddressSelection.test.ts` covering:

- different saved address -> address becomes current and quote becomes `STALE`;
- same saved address -> quote status is preserved;
- first commerce address selection -> quote becomes `STALE`.

## 5. CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31260111878`, job `93109503409`, head `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41`:

- dependency install — SUCCESS
- TypeScript strict check — SUCCESS
- ESLint zero-warning gate — SUCCESS
- Jest — SUCCESS
- production Android JavaScript bundle — SUCCESS
- backend/APIM/infrastructure source guard — SUCCESS

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 6. Changed Files

Implementation/test:

- `apps/mobile/src/features/cart/domain/cartAddressSelection.ts`
- `apps/mobile/src/features/cart/cartAddressSelection.test.ts`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P47_ADDRESS_SELECTION_FOR_COMMERCE.md`

No backend, APIM, OpenAPI, database, infrastructure, payment, checkout-service, or Android native build configuration was changed.

## 7. Acceptance Blockers / Why P47 Is PARTIAL

P47 cannot honestly be marked DONE because the full acceptance statement requires an address change to refresh **serviceability, delivery fee, and ETA**. The current authoritative repository does not expose the exact pre-checkout quote/reprice contract needed to do that.

Additional current boundary:

- `CustomerCart` is implemented and is the supported origin integrated in P47.
- A mobile Checkout route is not yet implemented in the rebuild, so Checkout-origin address selection cannot yet be certified.
- physical Android/reference-image certification remains deferred under the project phase policy.

The missing quote/serviceability capability is not worked around with local distance rules, fee calculations, fabricated ETA, or a guessed endpoint.

## 8. Final P47 State

**P47 — Address Selection for Commerce: PARTIAL.**

All safely supportable P47 behavior available from current exact contracts is implemented and CI-validated. Full serviceability/fee/ETA refresh remains blocked on the exact quote/reprice contract and later transactional routing.

**P48 — Delivery Quote/Reprice Orchestration is NOT STARTED and is not authorized by this phase.**
