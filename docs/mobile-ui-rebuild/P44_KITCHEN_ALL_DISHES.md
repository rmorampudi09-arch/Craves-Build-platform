# P44 — Kitchen All Dishes

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P44 only  
**Guide reference:** 16 — Kitchen All Dishes  
**Status:** **PARTIAL — every safe/supportable current-contract P44 route, virtualized menu, category filter, detail navigation, shared-cart reconciliation, lifecycle, refresh, and state-preservation behavior is implemented and CI-validated; reference rating/favorite/serviceability and scalable paginated menu contracts remain absent, and physical-device/reference certification is deferred**  
**Started from branch head:** `f5c5d73ba68ba906506afb40ff5faba9b8c24a28`  
**Validated implementation commit:** `4aec92a750929f403e5e94bea1756a8bdbea62b7`

---

## 1. Authorization and Phase Boundary

The user explicitly authorized exactly one next phase after P43. P43 remains correctly recorded as PARTIAL because its remaining verification/rating/order/serviceability/favorite/featured/media gaps are unavailable backend contracts, not unfinished supportable mobile work.

P44 owns only **Kitchen All Dishes / Reference 16**. It does not implement P45/P46 Cart, checkout/payment, favorites, reviews, new backend endpoints, APIM changes, or Chef-owner operations.

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` remains authoritative. Reference 16 requires a complete available-dish list for one kitchen, a typed `CustomerKitchenDishes` route, virtualized rows, real Dish Detail/Add behavior, cart synchronization, lifecycle states, refresh, and preservation of the Kitchen Profile/list state on return. Repository/backend reality remains authoritative for concrete integrations, so unavailable rating/favorite/serviceability/pagination capabilities are not fabricated.

---

## 2. Exact Current-Branch Contract Used

Authoritative backend controller:

- `services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java`

Authoritative backend service:

- `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java`

Current public routes reused through the existing P42 mobile API/query boundary:

```http
GET /api/v1/catalog/kitchens/{kitchenId}
GET /api/v1/catalog/kitchens/{kitchenId}/menu-items
```

Response models:

- `ApiDtos.KitchenProfileResponse`
- `List<ApiDtos.MenuItemResponse>`

`CatalogService.getPublicMenuItems(UUID kitchenId)` first requires an ACTIVE public kitchen and then returns only menu items where `status = 'ACTIVE'` and `is_available = true`, ordered by `category, item_name`.

P44 does not invent query parameters. The current menu compatibility route is not paginated and exposes no customer rating, favorite, or selected-address final serviceability/ETA field.

---

## 3. Implemented P44 Boundary

### Typed route and Kitchen Profile entry

Added logical route `CustomerKitchenDishes` with only the stable backend `kitchenId` parameter. It is registered in both Customer Home and Chefs stack domains so the same Kitchen Profile behavior works regardless of source tab.

P43's bounded menu preview now exposes a real **View all** action that navigates to the P44 route. Back/system navigation returns to the existing Kitchen Profile instance instead of constructing a new profile snapshot.

The P44 route is treated as a focused immersive customer detail route, consistent with the existing dish/profile detail policy. The shared bottom navigation does not overlap it; a compact live cart count remains visible in the screen header.

### Complete current-contract menu presentation

P44 renders the current public sellable-menu response with React Native `FlatList`, stable menu-item keys, bounded render windows, and image fallbacks. This virtualizes on-device row rendering while preserving the backend's category/name ordering.

Category chips are derived only from returned authoritative category values. Filtering is local over the already-loaded public response and preserves source order; no unsupported server filter or sort parameter is invented.

Each row shows only supported fields:

- public menu image when available,
- item name,
- category,
- backend food type,
- backend preparation time when present,
- public description when present,
- current public price/currency,
- shared-cart Add/quantity state.

Reference rating is intentionally omitted because no authoritative rating contract exists.

### Dish Detail and cart behavior

Tapping a row opens the existing real `CustomerDishDetail` route.

Add/increment/decrement compose the existing authoritative cart snapshot and mutation engine. Before Add/increment, P44 refetches the public kitchen/menu contract and:

- fails closed if the dish disappeared from the current sellable menu,
- surfaces a changed price and requires another user action,
- only then dispatches the existing add/update mutation.

Cart mutation failures preserve the valid menu and surface the established recoverable notice. Quantities are read from the same global cart snapshot used by the profile and other customer surfaces, so no second P44 cart state exists.

The public menu endpoint itself excludes unavailable dishes. If availability changes between display and mutation, the pre-mutation refetch removes/fails the stale dish rather than attempting an unsafe add.

### Lifecycle, refresh, and return state

Implemented states include:

- invalid kitchen link,
- customer session required,
- loading skeleton,
- terminal initial-load failure,
- offline/recoverable refresh failure while prior valid data remains visible,
- pull-to-refresh,
- empty current menu,
- empty selected category,
- cart interaction error.

The screen records and restores its FlatList scroll offset on focus return from Dish Detail. Selected category remains local to the mounted route, and returning to Kitchen Profile uses the existing navigation stack/profile state.

---

## 4. Explicit P44 Acceptance Blockers

Full Reference 16 acceptance remains blocked by current-branch contract/device gaps:

1. **No paginated public kitchen-menu contract.** The compatibility endpoint returns one unpaginated list. P44 virtualizes rendering but does not fake network pagination or claim the transport is safe for an unbounded 1M+ scale response.
2. **No kitchen/dish rating aggregate** for the reference rating field.
3. **No kitchen or dish favorite read/mutation contract** to satisfy favorite-state synchronization acceptance.
4. **No final selected-address serviceability/ETA contract** for disabling purchase based on actual delivery eligibility. The public endpoint's ACTIVE + available menu rule is respected, but browsing proximity is not reinterpreted as final serviceability.
5. **No physical-device/reference-image certification** was performed in this implementation phase, so pixel-perfect Reference 16 completion is not claimed.
6. **Cart destination remains later-owned by P45/P46.** P44 synchronizes cart count/quantities and real mutations but does not pre-implement the Cart screen.

Because guide-required capabilities remain unavailable, P44 is **PARTIAL**, not DONE.

---

## 5. Changed Files

Implementation/navigation:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
- `apps/mobile/src/features/kitchenProfile/kitchenDishesPresentation.ts`
- `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenDishesScreen.tsx`
- `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx`

Tests:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/features/kitchenProfile/kitchenDishesPresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P44_KITCHEN_ALL_DISHES.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P45/P46 Cart implementation, checkout/payment, favorite service, review service, or Chef-owner operational feature was changed.

---

## 6. Focused Test / CI Coverage

P44-specific tests verify:

- focused route policy includes `CustomerKitchenDishes`,
- category derivation preserves first-seen backend order,
- case-only duplicate category labels are not duplicated,
- category filtering preserves the current public menu response order,
- supported food-type/preparation metadata formatting does not invent unavailable fields.

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Validated implementation:

- Commit: `4aec92a750929f403e5e94bea1756a8bdbea62b7`
- GitHub Actions run ID: `31256729097`
- Job ID: `93101120486`
- Conclusion: **SUCCESS**

Passed gates:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint zero-warning gate,
4. Jest,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No Gradle/APK packaging was performed, consistent with the phase build policy.

---

## 7. Visual QA

Reference 16 structure and brand tokens were implemented from the authoritative guide, but no physical Android device/reference overlay verification was performed in this phase. P44 therefore does not claim pixel-perfect/device certification.

---

## 8. Stop State

**P44 — Kitchen All Dishes: PARTIAL.**

Every safe, supportable current-branch P44 mobile behavior implemented in this phase is CI-validated. Full acceptance remains blocked only by the explicit contract/device gaps above.

**P45 — Cart Data / Pricing Composition was not started.**

**Next phase authorization: NONE — stop after P44 and wait for explicit user direction.**
