# P30 — Cart Add/Remove/Quantity Reconciliation

Status: **DONE** at implementation/static-contract level. Product screens that consume these mutations, full Cart UI, checkout, device/runtime certification, and visual QA remain with their owning later phases.

## Control evidence

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- Started from accepted P29 ledger head: `e75ed7f56860026fccccd7ff9a1f3f0218faf2b3`
- Validated implementation commit: `1e7d8ec460098aaeaf993d5b34129d2c7b8a8f75`
- Successful CI run: `31231364244`
- CI job: `93035709313` (`validate-mobile-code`)

## Sources reviewed

P30 was implemented only after reconciling:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `services/order-service/src/main/java/in/craves/order/web/CartController.java`
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java`
- `services/order-service/src/main/java/in/craves/order/service/OrderService.java`
- `scripts/apim/configure-customer-cart-apim.sh`
- the accepted P28 cart domain and P29 shared View Cart overlay implementation/evidence.

Guide rules applied include global Development Rules, UX optimistic-update rules, Smart UI Cart Synchronization, State Management/derived-state rules, Cart validation, Code Quality, and Testing/Verification (guide pages 5, 7, 9, 12–13, 15, and 17).

## Exact backend/APIM contracts used

P30 adds mobile wrappers only for the already-existing line mutation operations:

- `POST /api/v1/cart/items`
  - request: `{ menuItemId: UUID, quantity: int >= 1 }`
  - response: authoritative `CartResponse`
- `PUT /api/v1/cart/items/{cartItemId}`
  - request: `{ quantity: int >= 1 }`
  - response: authoritative `CartResponse`
- `DELETE /api/v1/cart/items/{cartItemId}`
  - response: authoritative `CartResponse`

The backend remains authoritative for cart item identity, active catalog/kitchen validation, item/kitchen snapshots, unit price, line totals, currency, and cart food subtotal. No backend, OpenAPI, APIM, infrastructure, database, or native Android contract was changed.

## Reconciliation policy

### Add item

Add is deliberately **not optimistically fabricated** because the server can create a new cart-line UUID or merge into an existing `(cart_id, menu_item_id)` row and refresh catalog/kitchen price snapshots. The client shows mutation-pending state, waits for the server response, validates it, then accepts the returned authoritative cart snapshot.

### Quantity update

Quantity updates may optimistically change only the canonical cart line quantity so quantity selectors, derived item count, cart badge, and the shared View Cart visibility/count can react immediately.

The client does **not** optimistically recompute `lineTotal` or `foodSubtotal`. Those remain the last accepted server values until the mutation returns. The validated server snapshot then replaces the optimistic projection and advances the client acceptance revision.

### Remove item

Removal may optimistically remove the line from the canonical snapshot. This makes derived empty-cart state and shared View Cart disappearance react immediately. Server totals remain authoritative until the response is accepted.

On failure, the prior snapshot is restored only when the cart has not accepted a newer authoritative revision in the meantime.

## Duplicate/stale/out-of-order protection

- Logical pending keys protect duplicate taps:
  - add: `menu:<menuItemId>`
  - update/remove: `line:<cartItemId>`
- A second mutation for the same logical key while the first is pending returns `SKIPPED_DUPLICATE` and does not issue another HTTP write.
- Cart writes are serialized through one mutation queue. A later cart write cannot overtake an earlier write and then be overwritten by the earlier server response.
- Existing request-id-aware mutation metadata still prevents an older completion from clearing a newer logical mutation record.
- Optimistic/rollback projections do not advance `clientRevision`; only a validated authoritative snapshot does.
- Rollback carries the expected authoritative `clientRevision`; if a newer authoritative snapshot was accepted while the request was in flight, the stale rollback is ignored.

## Cross-surface synchronization boundary

P30 mutates the single P28 Redux-owned cart snapshot. Existing selectors therefore remain the only source for:

- total item count,
- per-menu-item quantity,
- empty-cart state,
- server food subtotal,
- shared View Cart count/subtotal/visibility.

Future dish cards, quantity selectors, cart badge, Cart screen, and checkout surfaces must consume these same selectors/domain state when their owning phases are implemented; P30 does not create those later screens early.

## Error behavior

- Invalid local UUID/quantity input is rejected before transport with typed `AppApiError` codes.
- Transport/backend failures flow through the established safe API error mapper.
- Failed mutation metadata retains the error code for contextual UI handling.
- Quantity/remove failures reliably roll back when safe; no raw stack/backend diagnostics are exposed by the cart mutation layer.

## Changed files

Implementation:

- `apps/mobile/src/features/cart/api/cartApi.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`
- `apps/mobile/src/features/cart/state/cartMutations.ts`

Tests:

- `apps/mobile/src/features/cart/cartDomain.test.ts`
- `apps/mobile/src/features/cart/cartMutations.test.ts`

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31231364244` on validated P30 implementation head `1e7d8ec460098aaeaf993d5b34129d2c7b8a8f75`: **SUCCESS**.

Passed checks:

1. dependency install,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint with zero warnings,
4. Jest — **34 suites passed, 167 tests passed**,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

Focused P30 tests verify:

- exact POST/PUT/DELETE transport contracts,
- local invalid-input rejection before transport,
- duplicate add-tap suppression,
- optimistic quantity with server-authoritative totals,
- authoritative quantity reconciliation,
- rollback with typed failure state,
- optimistic removal/empty-cart synchronization,
- serialized different writes preventing response overtaking,
- stale rollback rejection after a newer authoritative revision.

No APK/AAB was built, consistent with the implementation-phase policy.

## Deliberate boundaries

P30 does **not** pre-implement P31 or later work:

- no Home feed/category/cuisine/location query mapping,
- no Home/discovery UI,
- no new dish card or quantity selector product UI,
- no Cart product screen or Bill Summary,
- no coupon/address/delivery quote implementation,
- no tax/fee/delivery/grand-total fabrication,
- no checkout/payment flow,
- no clear-cart product flow,
- no backend/APIM/infrastructure/native Android change,
- no physical-device or pixel-perfect certification.

## Acceptance result

P30 acceptance is satisfied at implementation/static-contract level:

- exact line mutation contracts are typed and runtime-validated;
- add/update/remove responses reconcile into the one authoritative cart domain;
- quantity/remove use bounded optimistic behavior only where rollback is reliable;
- duplicate taps are protected;
- mutation writes cannot overtake one another;
- stale rollback cannot overwrite a newer accepted authoritative snapshot;
- all existing cart-derived surfaces/selectors stay synchronized from one canonical snapshot;
- CI is green with focused P30 coverage and prior regressions.

## Stop point

**P30 is complete. P31 — Home Feed Data Contract and Query Model is next in sequence but is not authorized by this record and was not started.**
