# P36 — Discover Home Chefs — Active Cart

## Status

**PARTIAL.** The supported active-cart chrome for the existing Customer Chefs route is implemented and CI-validated. Full Reference 08 acceptance remains blocked by the later-owned Customer Cart destination and by dish-level actions/richer chef discovery data that are not present in the current nearby-kitchen contract.

- Started from accepted P35 ledger head: `7751fa7c225445e544d0cbce76022d86b4e5ce3a`.
- Validated implementation commit: `f86d4e29041330eb768ac53f64848729446c6415`.
- GitHub Actions run/job: `31249712277` / `93083997312` — **SUCCESS**.
- Guide ref: 8 / `image8.jpeg` — Discover Home Chefs — Active Cart.

## Phase boundary

P36 implements only the active-cart variant on the same logical Customer Chefs route. It reuses the accepted P35 discovery screen, P28 authoritative cart snapshot/selectors, P29 shared View Cart overlay, P30 cart reconciliation behavior, and P34 nearby-kitchen query model.

Included:
- same `CustomerChefsRoot` route and P35 discovery content for empty and active cart states;
- live View Cart visibility from authoritative cart item count and server food subtotal;
- reuse of the shared Espresso Brown P29 View Cart overlay rather than a screen-local duplicate;
- active-state count/total synchronization with the canonical cart store;
- immediate return to the empty-cart layout when the cart reaches zero;
- dynamic bottom content clearance while the floating overlay is present, removed when it disappears;
- existing P26 bottom-navigation hide/reveal behavior remains attached to the underlying chef list;
- focused tests covering Customer/Chefs eligibility, active clearance, and zero-cart restoration.

Explicitly not included:
- a fake or placeholder Cart screen/route;
- Cart/Bill Summary data or UI owned by P45/P46;
- checkout/payment work;
- P37 full search orchestration;
- P38 Filter and Sort implementation;
- P42/P43 public kitchen profile contract/UI;
- invented dish summaries or Add buttons on nearby-kitchen cards when the current P34 response contains no dish-level item/price payload.

## Implementation

### Same-route active-cart composition

`CustomerChefsRoot` now renders `DiscoverHomeChefsRouteScreen`, a thin route-level composition wrapper around the existing `DiscoverHomeChefsScreen`. This preserves the P35 screen logic, list state, saved-location behavior, pagination, lifecycle states, and scroll restoration while adding only the P36 cart chrome.

### Authoritative cart synchronization

The wrapper reads `selectCartItemCount` and `selectCartFoodSubtotal` from the canonical cart domain and evaluates the existing P29 `isViewCartOverlayVisible` contract using the Customer Chefs route policy. No second cart copy or screen-local total is introduced.

When the cart is non-empty and has an authoritative subtotal, the shared View Cart surface is rendered with its existing live count/total formatting and reduced-motion animation. When item count returns to zero, the overlay unmounts immediately through the shared visibility contract.

### Dynamic content clearance

`resolveChefDiscoveryContentBottomInset` reserves enough route content space for the floating View Cart action only while it is visible. The inset returns to zero when the overlay disappears, preventing both obscured final discovery content and a permanent empty-cart gap.

### Cart destination blocker

Reference 08 requires `View Cart -> Cart`, but the current branch still has no registered Customer Cart product route. `phases.md` assigns Cart data/UI to P45/P46. P36 therefore does **not** register an unreachable route or placeholder screen. The visible action fails closed with a user-readable unavailable message while preserving the active cart. This is an explicit acceptance blocker, so P36 is **PARTIAL**, not DONE.

### Dish-action blocker

P36 acceptance also refers to synchronization with dish Add actions. The current `GET /api/v1/discovery/kitchens` contract contains kitchen summary fields and `activeMenuItemCount`, but no dish ID, dish price, or dish-level cart action payload. P36 does not fabricate those fields or introduce a later kitchen-profile/menu contract. Cart changes made through already-supported surfaces still synchronize the Chefs View Cart immediately because all surfaces share the canonical cart state.

## Files

Implementation:
- `apps/mobile/src/features/chefDiscovery/chefDiscoveryActiveCart.ts`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`

Tests:
- `apps/mobile/src/features/chefDiscovery/chefDiscoveryActiveCart.test.ts`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P37/P38 search/filter work, P42/P43 kitchen-profile work, P45/P46 Cart UI, or checkout/payment behavior was changed.

## Validation

GitHub Actions run `31249712277`, job `93083997312`, passed:

1. checkout of `mobile-ui-rebuild-from-scratch`;
2. Node setup and dependency install;
3. strict TypeScript check;
4. ESLint zero-warning gate;
5. Jest, including the focused P36 active-cart chrome tests;
6. production React Native JavaScript bundle;
7. backend/APIM/infrastructure source-change guard.

Physical-device/reference-image pixel certification remains deferred to later visual QA phases according to the implementation plan.

## Remaining P36 blockers

- No real Customer Cart destination exists before P45/P46, so `View Cart -> Cart` cannot yet meet final acceptance.
- The nearby-kitchen response has no dish-level item/price payload, so Reference 08 dish Add actions cannot be truthfully introduced on the discovery card surface in P36.
- P35/P34 richer discovery blockers remain unchanged: cuisine/filter/favorite/rating/ETA/verification/media/server-search and public profile dependencies are still absent or later-owned.

## Next phase

**P37 — Search Query Orchestration. NONE AUTHORIZED.** Stop after P36 until explicitly requested.
