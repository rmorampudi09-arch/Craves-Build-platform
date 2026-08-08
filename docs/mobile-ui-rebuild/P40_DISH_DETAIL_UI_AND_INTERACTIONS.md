# P40 — Dish Detail UI and Interactions

**Status:** PARTIAL  
**Guide reference:** 13 — Dish Detail  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Started from commit:** `179c2db312434714aa540fa0de7380b52b310638`  
**Validated implementation commit:** `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb`  
**Supporting implementation commit:** `91249464e5fc52eab35f40153fcc4425e8f7d9b6`  
**CI run/job:** `31253969455` / `93094455601` — **SUCCESS**

## Authorization boundary

The user explicitly authorized exactly the next single phase after P39. This record covers P40 only. P41 and later phases were not implemented.

## Guide behavior implemented

The supported Dish Detail experience is now a real typed customer route and is reachable from Home dish media/title without replacing or resetting the source Home stack.

Implemented UI and interaction behavior:

- immersive Dish Detail route with customer bottom navigation hidden while focused,
- Back action returning through the existing stack so the source Home list/component and its scroll/search/filter state remain mounted,
- media gallery with horizontal paging, active index, thumbnail selection, and a branded fallback when no public media exists,
- native Share action using the authoritative dish and kitchen display names,
- title/category/food-type/current-price presentation,
- public kitchen/chef display card using only the P39 customer-safe kitchen allowlist,
- preparation time, serves, spice and package-weight facts when those authoritative fields exist,
- expandable long description,
- explicit ingredient/allergen and review unavailable states rather than fabricated content,
- pull-to-refresh and loading/error/offline/session/invalid-ID lifecycle handling,
- sticky current-price purchase area,
- Add to Cart plus in-cart quantity controls,
- Add/increase revalidation against a fresh P39 Dish Detail query before mutation,
- price-change interception that updates the detail and requires the customer to review the new price before confirming again,
- authoritative cart mutation reconciliation after the detail refresh,
- current cart-server price feedback if the cart response changes between detail refresh and mutation,
- accessible control labels, busy/disabled state, live mutation feedback and 48+ dp interaction targets.

## Source-position restoration

Home opens `CustomerDishDetail` inside the same Home native stack. The existing `CustomerHomeScreen` remains mounted while Dish Detail is pushed, so native back returns to the exact current list position rather than rebuilding the Home route. Existing discovery query/filter/search/scroll state ownership remains unchanged.

## Add to Cart acceptance boundary

Before Add or quantity increase, P40 calls the authoritative P39 detail refetch. P39 only accepts an `ACTIVE`, currently available, positively priced item from an active kitchen. P40 then compares dish/kitchen identity and current price before dispatching the existing P30 cart mutation.

The order-service cart mutation remains the server authority for the cart snapshot and refreshes active item/kitchen/current unit-price snapshots when adding. The current backend supports carts spanning multiple kitchens and groups them by kitchen during checkout; there is no separate same-kitchen-only compatibility rule to invent on the client.

## Explicit P40 blockers

### Favorite

P39 proved that the current branch has no authoritative customer dish-favorite read/mutation endpoint or state contract. P40 therefore does not fabricate local/server favorite state. The Save control explains the unavailable capability instead of pretending persistence succeeded.

### Ingredients and reviews

The current public detail contract does not expose ingredients, allergens, customer reviews, aggregate rating or review count. P40 renders explicit unavailable states and does not invent chips, allergen warnings, ratings or review rows. The full Ingredients screen remains P41-owned and was not started.

### Buy Now

The existing backend endpoint `POST /api/v1/checkout` is a cart checkout, not an approved dedicated single-dish checkout intent. `CheckoutRequest` accepts delivery address/note, and `OrderService.checkout(...)` validates and converts the customer's entire current cart. Using that endpoint for Buy Now would therefore risk including/corrupting the existing cart and would violate the P40 acceptance rule.

No dedicated single-dish Buy Now intent endpoint/model exists in the current branch. P40 keeps Buy Now fail-closed with user feedback and does not synthesize an endpoint, temporary cart mutation, or later-phase checkout route.

### Public kitchen profile navigation

The customer-facing public Kitchen Profile contract/UI is owned by P42/P43. P40 renders the supported kitchen card but does not pre-implement P42/P43 navigation.

Because the favorite and dedicated Buy Now contracts required by the Guide are absent, and ingredients/reviews remain contract-blocked, P40 is correctly recorded **PARTIAL**, not DONE.

## Changed files

Implementation:

- `apps/mobile/src/features/dishDetail/screens/CustomerDishDetailScreen.tsx`
- `apps/mobile/src/features/dishDetail/dishDetailPurchase.ts`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`

Tests:

- `apps/mobile/src/features/dishDetail/dishDetailPurchase.test.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`

No backend, OpenAPI, APIM, infrastructure, database or Android native build configuration was changed.

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31253969455`, job `93094455601`, head `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb`:

- dependency install — **SUCCESS**,
- strict TypeScript (`tsc --noEmit`) — **SUCCESS**,
- ESLint zero-warning gate — **SUCCESS**,
- Jest — **SUCCESS**,
- production Android JavaScript bundle — **SUCCESS**,
- backend/APIM/infrastructure source guard — **SUCCESS**.

Physical-device/reference-image visual certification is not claimed by this implementation CI pass and remains part of later QA gates.

## Stop boundary

**Next phase:** P41 — Dish Ingredients — **NOT STARTED**.  
**Authorization:** none.  
Stop after this P40 evidence/ledger update and wait for explicit user direction.
