# P28 — Authoritative Cart Domain Skeleton

Status: **DONE** at implementation/static-contract level. Later product screens, mutation UX, checkout integration, and physical-device/reference certification remain with their owning phases.

## Control evidence

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- Started from accepted P27 ledger head: `81ccdab73768c7be97871689298a8a7fb3599570`
- Initial P28 implementation commit: `a88a6a29f3939ceb636189f9a68554dbdd90cd7b`
- Validated P28 implementation head: `6cda59ac43184d2427c012c6a30ec2b099e51016`
- Successful CI run: `31229985407`
- Initial validation run `31229916591` failed only the strict TypeScript step because an immutable `readonly` cart-line array was not assignable to Redux Toolkit/Immer's writable draft shape. The P28 type boundary was corrected without changing behavior or phase scope before final validation.

## Sources reviewed

P28 was implemented only after re-reading and reconciling:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `services/order-service/src/main/java/in/craves/order/web/CartController.java`
- `services/order-service/src/main/java/in/craves/order/web/ApiDtos.java`
- `services/order-service/src/main/java/in/craves/order/service/OrderService.java`
- `scripts/apim/configure-customer-cart-apim.sh`
- `docs/handover/2026-07-30-customer-mobile-cart.md`

The implementation follows the guide rule that cart state is shared/global, derived UI must consume authoritative data/selectors, stale responses must not overwrite newer state, and backend contracts must not be invented.

## Exact contract used in P28

P28 consumes only the existing cart read operation:

- `GET /api/v1/cart`

The accepted backend response provides:

- cart `id`,
- cart `currency`,
- item `id`, `menuItemId`, `kitchenId`, `itemName`, `kitchenName`, `unitPrice`, `currency`, `quantity`, `lineTotal`, `createdAt`, `updatedAt`,
- totals `foodSubtotal` and `currency`.

The backend response also contains `customerIdentityId`, but P28 deliberately does not retain it in the mobile cart domain.

The Order Service remains authoritative for item price, line total, currency, and food subtotal. P28 does not recompute server-owned prices or totals.

### Cart version boundary

The current cart response does **not** expose a server-owned cart version/revision field. P28 therefore does not invent one. Instead, the mobile domain exposes `clientRevision`, a clearly client-owned monotonic counter that advances only when a validated authoritative snapshot is accepted. It is not sent to the server and must not be treated as a concurrency token.

## Implemented behavior

- Added one canonical Redux-owned cart domain registered under `cart`.
- Added typed `CartSnapshot`, semantic `CartLine`, `CartMoney`, totals, dependency, and mutation metadata models.
- Added strict runtime parsing for `GET /api/v1/cart` including UUID, currency, timestamp, quantity, and monetary-value validation.
- Invalid or internally inconsistent cart payloads fail validation instead of being silently converted to an empty cart.
- Customer identity data from the backend cart response is intentionally omitted from the mobile snapshot.
- Added shared selectors for authoritative snapshot, client acceptance revision, empty state, item count, menu-item quantity, server food subtotal, dependency state, and mutation state.
- Item count and per-menu-item quantity are derived from the accepted snapshot rather than stored as duplicate screen-local values.
- Server food subtotal is returned unchanged by selectors; the client does not perform price arithmetic.
- Added typed dependency state for coupon, address, and delivery quote without inventing unresolved endpoint or pricing contracts.
- Added request-id-aware mutation metadata so a stale completion cannot clear a newer mutation with the same logical key.
- Logout resets the full cart domain alongside existing private query/mutation and Customer-shell cleanup.
- No cart data is persisted to AsyncStorage or another general-purpose local store.

## Deliberate boundaries

P28 does **not** pre-implement later phases:

- No P29 Shared View Cart Overlay was added.
- No P30 add/remove/update/clear cart network mutation flow was added.
- No cart screen, dish-card mutation UI, quantity-stepper UI, coupon UI, delivery quote UI, address selector integration, checkout eligibility, or payment behavior was added.
- No client-side tax, fee, discount, delivery-fee, grand-total, or other pricing field was fabricated when the exact cart read response does not provide it.
- No backend, OpenAPI, APIM, infrastructure, database, or Android native build configuration was changed.
- No APK/AAB was built, per implementation-phase policy.

The existing mutation routes were reviewed only to preserve future contract boundaries; P30 remains their owning mobile mutation/reconciliation phase.

## Changed files

- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `apps/mobile/src/features/cart/api/cartApi.ts`
- `apps/mobile/src/features/cart/cartDomain.test.ts`
- `apps/mobile/src/features/cart/domain/cartTypes.ts`
- `apps/mobile/src/features/cart/state/cartSelectors.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31229985407` on validated P28 head `6cda59ac43184d2427c012c6a30ec2b099e51016`: **SUCCESS**.

Passed checks:

1. dependency install,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint,
4. Jest including P28 cart-domain coverage and prior regressions,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

## Acceptance result

P28 acceptance is satisfied at implementation/static-contract level:

- there is one authoritative global cart domain rather than screen-local cart copies;
- the domain accepts only validated server cart snapshots;
- quantities/counts are derived consistently from that snapshot;
- server-owned price/subtotal values are not independently recalculated;
- coupon/address/delivery-quote dependencies are represented explicitly without fabricated backend data;
- mutation metadata is request-aware so stale completion cannot erase a newer logical mutation;
- logout removes the private cart domain.

Physical-device behavior and product-screen synchronization remain part of their later owning phases and QA gates.

## Stop point

**P28 is complete. P29 is not authorized by this record and was not started.**
