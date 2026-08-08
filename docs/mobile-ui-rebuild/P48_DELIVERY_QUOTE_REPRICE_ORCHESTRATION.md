# P48 — Delivery Quote/Reprice Orchestration

**Status:** PARTIAL  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Starting branch head:** `b29a69b5d6dd37ae268b2d7431312d71e1c50ba5`  
**Validated implementation commit:** `2bd26edbb687a5baaf104c3d4b73d47978c1b122`  
**CI run/job:** `31260767948` / `93111102045` — SUCCESS

## 1. Authorized Scope

P48 is limited to **Delivery Quote/Reprice Orchestration**. `phases.md` requires the exact quote/reprice endpoint(s), dependency invalidation for address/cart/coupon, prevention of stale-quote checkout, and background refresh behavior that does not destroy valid cart state.

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` requires cart pricing/serviceability to be server-authoritative, delivery quote state to be invalidated when address/cart/coupon inputs change, and stale pricing/quote state to fail closed before checkout. The guide also explicitly requires logical capabilities to be mapped to existing repository contracts rather than converted into guessed endpoints.

P49 remains a separate phase and owns checkout session creation.

## 2. Exact Contracts Audited

### Cart validation — not a delivery quote/reprice contract

Authoritative source:

- `services/order-service/src/main/java/in/craves/order/web/CartController.java`
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java`

Current route:

```text
POST /api/v1/cart/validate
```

This route accepts no delivery-address input and returns `CartResponse`. The current cart response exposes cart lines and `foodSubtotal`; it does not provide authoritative delivery serviceability, delivery fee, ETA, taxes, grand total, quote version, or quote expiry.

Therefore P48 does not reinterpret `/api/v1/cart/validate` as an address-aware quote endpoint.

### Checkout creation — side-effecting and P49-owned

Authoritative source:

- `services/order-service/src/main/java/in/craves/order/web/CheckoutController.java`
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java`

Current route:

```text
POST /api/v1/checkout
```

`CheckoutRequest` may contain `deliveryAddressId`, and `CheckoutResponse` contains final fee/tax/delivery/grand-total fields. However this route creates a checkout resource and is not a read-only quote/reprice operation. P48 therefore does not call checkout creation merely to obtain pricing; P49 owns that side-effecting operation.

Repository audit found no exact supported `/api/v1/checkout/quote` or equivalent pre-checkout address-aware quote/reprice endpoint and response schema.

## 3. Implemented Orchestration Boundary

### Shared quote invalidation semantics

Added `apps/mobile/src/features/cart/domain/cartDeliveryQuote.ts` as the single P48 domain boundary for quote dependency transitions.

Supported invalidation reasons are explicitly modeled as:

- `ADDRESS_CHANGED`
- `CART_CHANGED`
- `COUPON_CHANGED`

Behavior:

- without a selected delivery address, dependent quote state resolves to `UNRESOLVED`;
- with a selected delivery address, a quote-affecting change resolves to `STALE`;
- no delivery fee, ETA, serviceability, tax, or total is calculated locally;
- no unsupported refresh request is issued.

P47 address selection now routes address-change invalidation through this shared P48 boundary rather than owning separate stale-state semantics.

### Authoritative cart-change invalidation

`cartSnapshotsRequireQuoteRefresh` compares quote-relevant authoritative cart inputs while intentionally ignoring transport-only timestamps.

It detects changes to:

- cart identity/currency;
- line count/order/identity;
- menu/kitchen identity;
- line quantity;
- authoritative unit price and line total;
- authoritative food subtotal.

`cartSlice.snapshotAccepted` uses that comparison before accepting a new server snapshot. When a quote-relevant authoritative cart change is observed:

- selected address exists -> delivery quote becomes `STALE`;
- no selected address -> delivery quote remains/returns `UNRESOLVED`.

Because all completed cart line mutations and explicit cart refreshes converge through `snapshotAccepted`, the same invalidation rule covers successful add/update/remove responses and server changes discovered during refresh without duplicating orchestration in every mutation path.

### Safe background behavior

P48 preserves the existing P46 refresh model: the last valid cart snapshot remains available while a read-only refresh runs, and recoverable refresh failure does not erase valid cart lines. P48 only invalidates the dependent quote when a materially changed authoritative snapshot is accepted.

### Fail-closed quote readiness

`getCartDeliveryQuoteReadiness` exposes the current capability boundary with:

```text
DELIVERY_QUOTE_CONTRACT_UNAVAILABLE
```

Until an exact quote/reprice contract exists, readiness reports:

- refresh support unavailable;
- quote not usable for checkout;
- stale/unresolved quote remains a blocker.

Even a legacy/current status value cannot independently authorize checkout because no authoritative quote payload/version/expiry has been supplied by a supported contract.

The `COUPON_CHANGED` invalidation reason is intentionally available for the later coupon phase to call, but P48 does not pre-implement coupon application or P70/P71 behavior.

## 4. Focused Tests

Added `apps/mobile/src/features/cart/cartDeliveryQuote.test.ts` covering:

- cart change without an address -> `UNRESOLVED`;
- cart/coupon change with an address -> `STALE`;
- quote-relevant quantity/money changes require refresh;
- timestamp-only changes do not create false quote invalidation;
- accepting a changed authoritative cart snapshot invalidates a previously current quote;
- quote readiness fails closed with `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE`.

Existing P47 address-selection tests remain compatible because address invalidation now delegates to the shared P48 rule.

## 5. CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31260767948`, job `93111102045`, head `2bd26edbb687a5baaf104c3d4b73d47978c1b122`:

- dependency install — SUCCESS
- TypeScript strict check — SUCCESS
- ESLint zero-warning gate — SUCCESS
- Jest — SUCCESS
- production Android JavaScript bundle — SUCCESS
- backend/APIM/infrastructure source guard — SUCCESS

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 6. Implementation Commits

- `0acfb33f856f20a2fb52ecb32302746f18551864` — add P48 delivery quote orchestration boundary
- `d3cedf512572e02c2ada5003c4ef76294fe8fbd3` — route P47 address invalidation through P48
- `39650374995a378f2a1a94c0bdff721b60a24dc1` — invalidate quote on authoritative cart change
- `2bd26edbb687a5baaf104c3d4b73d47978c1b122` — focused P48 orchestration tests

## 7. Changed Files

Implementation/test:

- `apps/mobile/src/features/cart/domain/cartDeliveryQuote.ts`
- `apps/mobile/src/features/cart/domain/cartAddressSelection.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`
- `apps/mobile/src/features/cart/cartDeliveryQuote.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md`

No backend, APIM, OpenAPI, database, infrastructure, checkout/payment service, or Android native build configuration was changed.

## 8. Acceptance Blockers / Why P48 Is PARTIAL

P48 cannot honestly be marked DONE because the phase requires the exact quote/reprice endpoint(s) to refresh authoritative serviceability, fee, ETA, and dependent totals. The current repository does not expose that pre-checkout contract.

The implementation therefore does **not**:

- invent `/api/v1/checkout/quote` or another route;
- pass guessed address/cart/coupon request fields;
- use bodyless `/api/v1/cart/validate` as an address-aware quote;
- call side-effecting `POST /api/v1/checkout` as a pricing probe;
- compute delivery fee, ETA, tax, serviceability, or payable total locally;
- mark a stale/unresolved quote usable for checkout.

All safely implementable P48 dependency orchestration is present and CI-validated, but authoritative quote refresh remains blocked on the missing server contract.

## 9. Final P48 State

**P48 — Delivery Quote/Reprice Orchestration: PARTIAL.**

The app now has one tested, fail-closed orchestration boundary for address/cart/coupon quote invalidation and authoritative cart-change detection while preserving valid cart state during background refresh. The actual delivery quote/reprice network operation remains blocked because no exact supported contract exists.

**P49 — Checkout Session Creation is NOT STARTED and is not authorized by this phase.**
