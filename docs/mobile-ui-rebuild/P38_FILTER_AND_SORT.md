# P38 — Filter and Sort Evidence

**Phase:** P38 — Filter and Sort  
**Status:** PARTIAL  
**Started from commit:** `1fe4b862a42ffd1e6a28f80c02ae425805cd08fb`  
**Validated implementation commit:** `4465618e64908c48e535de7d8fe83cd03a3b9bcd`  
**Guide reference:** Screen 17 / Filter and Sort, full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**CI run/job:** `31251797224` / `93089169496` — SUCCESS

## Authorized boundary

The user authorized exactly the next single phase after P37. P39 and later phases were not implemented.

P38 follows the guide's focused Filter and Sort route behavior without inventing discovery request parameters or response fields that are absent from the current branch contracts.

## Implemented

- Added one typed `CustomerFilterSort` route to the existing Customer Home and Chefs stacks rather than creating a parallel navigator.
- Added shared user/location-scoped applied-filter state with separate Home and Chefs sessions.
- Keeps screen edits in local draft state. Changing radio/checkbox controls does not trigger server search or mutate the applied list.
- `Reset` clears only the draft while the screen is open.
- `Apply Filters` commits the draft once, returns to the originating list, and resets saved list offset only when criteria changed.
- Back with unsaved changes asks before discarding; applied filters remain unchanged.
- Registered `CustomerFilterSort` as an immersive focused route. Customer bottom navigation is removed while it is focused; the route itself does not compose View Cart.
- Home exposes the new Filters entry point and an active-filter count.
- Chefs replaces the prior explanatory Filters dead-end with the real focused P38 route.
- Home can apply only fields already present in the accepted nearby-menu response: `foodType` diet filtering and loaded-result price ordering.
- Unsupported popularity, rating, delivery-time, cuisine and count-preview controls fail closed instead of sending guessed query parameters.
- Added unit coverage for scope isolation, normalized dirty comparison, supported Home filter/sort application, input-order immutability, and scoped clear behavior.

## Contract boundary and reason for PARTIAL

The accepted discovery endpoints remain:

- `GET /api/v1/discovery/menu-items?latitude&longitude&radiusMeters&page&size`
- `GET /api/v1/discovery/kitchens?latitude&longitude&radiusMeters&page&size`

The current branch does not define authoritative discovery parameters/models for:

- cuisine taxonomy/facet IDs,
- popularity ranking,
- rating sorting,
- delivery-time/ETA sorting,
- server-wide price sorting,
- server-side diet filtering,
- filter result-count preview,
- kitchen-level diet/cuisine/rating/ETA/filter/sort fields.

Therefore full Screen 17 filter coverage cannot be truthfully accepted. No fake `cuisine`, `sort`, `diet`, `rating`, `eta`, `q`, or similar request parameter was introduced. P38 remains PARTIAL until those exact contracts exist.

## Validation

GitHub Actions run `31251797224`, job `93089169496`, validated implementation SHA `4465618e64908c48e535de7d8fe83cd03a3b9bcd` with SUCCESS across:

1. dependency install,
2. strict TypeScript check,
3. ESLint zero-warning gate,
4. Jest,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No APK/AAB was generated because the rebuild policy defers native packaging until the later consolidated QA/release gates.

## Changed implementation files

- `apps/mobile/src/features/discoveryFilters/state/discoveryFilterSlice.ts`
- `apps/mobile/src/features/discoveryFilters/discoveryFilterApplication.ts`
- `apps/mobile/src/features/discoveryFilters/discoveryFilterApplication.test.ts`
- `apps/mobile/src/features/discoveryFilters/screens/CustomerFilterSortScreen.tsx`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`

## Explicit stop boundary

P39 — Dish Detail Data Contract remains NOT STARTED and is not authorized by this phase.
