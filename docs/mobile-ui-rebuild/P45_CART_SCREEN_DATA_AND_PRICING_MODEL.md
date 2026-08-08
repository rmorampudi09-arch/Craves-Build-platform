# P45 — Cart Screen Data and Pricing Model

Status: **PARTIAL**. Every P45 behavior that is safely supportable from the current authoritative backend/mobile contracts is implemented and CI-validated. Full Cart pricing/address/ETA/coupon/checkout-eligibility composition remains blocked by missing pre-checkout server contracts and is not fabricated locally.

## Control evidence

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- Started from accepted P44 ledger head: `ffd215faf7e3ab312e9b201ebab0e6acaba723aa`
- Validated P45 implementation head: `f4e71b370c1607e8df6572d0634dc5282da515f0`
- Successful CI run: `31258338717`
- Successful CI job: `93105128626` (`validate-mobile-code`)

## Sources reviewed

P45 was implemented only after re-reading/reconciling:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `docs/mobile-ui-rebuild/P28_AUTHORITATIVE_CART_DOMAIN_SKELETON.md`
- `docs/mobile-ui-rebuild/P30_CART_ADD_REMOVE_QUANTITY_RECONCILIATION.md`
- `services/order-service/src/main/java/in/craves/order/web/CartController.java`
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java`
- `services/order-service/src/main/java/in/craves/order/web/CheckoutController.java`
- `services/order-service/src/main/java/in/craves/order/service/OrderService.java`

Guide rules applied include backend-authoritative cart/pricing/checkout state, no client-authoritative tax/fee/discount/total arithmetic, explicit degraded/unavailable state when a required contract is absent, server-backed checkout eligibility, and reuse of the shared authoritative cart domain rather than screen-local cart copies.

## Exact current server boundary

### Cart read contract

The current customer cart read remains:

```http
GET /api/v1/cart
```

`ApiDtos.CartResponse` exposes:

- cart `id`, `customerIdentityId`, `currency`,
- cart item identity/kitchen/item names,
- server snapshot `unitPrice`, `quantity`, `lineTotal`,
- `totals.foodSubtotal` and totals currency.

The mobile P28 boundary intentionally omits `customerIdentityId` and keeps the remaining validated cart fields authoritative.

### What the cart read does not expose

The current `CartResponse` has no pre-checkout fields for:

- platform fee amount,
- tax amount,
- delivery fee amount,
- coupon/discount result,
- grand total,
- delivery-address display summary,
- delivery ETA,
- explicit checkout eligibility/ineligibility.

`POST /api/v1/cart/validate` refreshes current catalog/kitchen snapshots and still returns the same `CartResponse`; it does not return a pricing quote or eligibility object.

### Checkout is not a read-only pricing endpoint

`POST /api/v1/checkout` requires a delivery address, creates checkout/order records, computes and persists platform fee/tax/delivery/grand total, clears the cart, and returns `CheckoutResponse`. P45 therefore does **not** call checkout merely to populate a Cart bill preview.

`CheckoutResponse` proves that platform fee, tax, delivery fee and grand total are server-owned final values, but it is a side-effecting post-cart contract rather than a safe pre-checkout quote contract.

The admin charge-policy percentages/flats are likewise not used by mobile to reproduce final pricing locally.

## Implemented P45 model

### Cart item model

P45 reuses the existing validated `CartLine` model directly as `CartScreenItem`. It does not create another mutable screen-local copy of cart item identity, quantity or server price values.

### Bill summary model

The Cart screen model exposes explicit fields for:

- food subtotal,
- platform fee,
- tax amount,
- delivery fee,
- coupon discount,
- grand total.

Only `foodSubtotal` is populated and marked `CART_RESPONSE`, because that is the only bill amount supplied by the current cart read contract.

Every unsupported amount is `null` and marked `SERVER_CONTRACT_UNAVAILABLE`. `billSummary.complete` is therefore false. No tax, fee, delivery, coupon or grand-total arithmetic is performed on-device.

### Delivery address and ETA summary model

The existing shared cart dependency state can carry only an address ID/status and delivery-quote dependency status. P45 exposes those real states while keeping:

- address display summary = `null`,
- ETA summary = `null`,
- both summary sources = `SERVER_CONTRACT_UNAVAILABLE`.

A dependency being `CURRENT` does not cause P45 to invent an address label or ETA.

### Coupon model

P45 preserves the existing coupon dependency status and exposes a coupon-discount display field, but the discount amount remains unavailable because no authoritative customer cart coupon result contract exists.

### Checkout enabling rule

P45 defines an internal semantic eligibility-evidence boundary without inventing a wire payload:

- explicit server-eligible evidence -> checkout may be enabled,
- explicit server-ineligible evidence -> checkout disabled with the supplied semantic reason,
- no server eligibility evidence -> checkout disabled with `SERVER_ELIGIBILITY_UNAVAILABLE`.

The current selector has no authoritative eligibility adapter to supply, so it intentionally resolves to the fail-closed unavailable state. A non-empty cart, selected address, current dependency status, or locally complete-looking state is **not** treated as proof of eligibility.

### Quantity update/remove rule

P45 defines the Cart-screen interaction mapping that later P46 UI can consume:

- positive safe integer target -> `UPDATE` using the existing P30 quantity mutation,
- zero target -> `REMOVE` using the existing P30 remove mutation,
- negative, fractional, NaN/unsafe targets -> `INVALID`.

This prevents a zero quantity from being sent through the existing backend update contract, whose validated request requires quantity >= 1.

## Changed files

Implementation:

- `apps/mobile/src/features/cart/domain/cartScreenModel.ts`
- `apps/mobile/src/features/cart/state/cartSelectors.ts`

Tests:

- `apps/mobile/src/features/cart/cartScreenModel.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P45_CART_SCREEN_DATA_AND_PRICING_MODEL.md`

No P46 Cart UI, backend, APIM, OpenAPI, infrastructure, database, checkout/payment behavior, or Android native build configuration was changed.

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31258338717`, job `93105128626`, on P45 head `f4e71b370c1607e8df6572d0634dc5282da515f0`: **SUCCESS**.

Passed checks:

1. dependency install,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint zero-warning gate,
4. Jest including focused P45 Cart screen model/pricing-boundary coverage and prior regressions,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

Focused P45 coverage verifies:

- Cart items are reused from the authoritative snapshot rather than repriced/recreated,
- food subtotal is mapped unchanged from the cart response,
- platform fee/tax/delivery/coupon/grand total remain unavailable instead of locally calculated,
- CURRENT address/delivery dependency state cannot fabricate address/ETA data or eligibility,
- checkout enables only from explicit server eligibility evidence,
- zero target quantity maps to remove while invalid targets fail closed.

No APK/AAB was built, consistent with implementation-phase policy.

## Acceptance blockers

Full P45 acceptance is blocked until an authoritative customer pre-checkout contract provides the data needed to complete the model, including as applicable:

- server-computed bill breakdown/quote before checkout,
- coupon application/result and discount amount,
- selected delivery-address display/snapshot data suitable for Cart,
- delivery ETA/quote data,
- explicit server-owned checkout eligibility/ineligibility.

The exact route/response shape for those capabilities does not exist in the current branch and is not invented by P45.

Therefore P45 is **PARTIAL**, not DONE.

## Stop point

**P45 supportable scope is implemented and validated. P46 — Cart Screen UI is next in sequence but was not started.**
