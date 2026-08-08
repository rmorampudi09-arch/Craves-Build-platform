# P43 — Customer-Facing Kitchen Profile UI

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P43 only  
**Guide reference:** 15 — Customer Kitchen Profile  
**Status:** **PARTIAL — every safe/current-contract P43 UI, navigation, lifecycle, menu-preview, cart-action, and state-preservation behavior is implemented and CI-validated; favorite/trust metrics/featured ranking/full-menu acceptance remains blocked by missing P42 contracts or P44 ownership**  
**Started from branch head:** `c85664b33948613e6be7707d91d3d106b2a85b3d`  
**Validated implementation commit:** `1925e4c2df9b8601308c4694d31bc39e09171723`  

---

## 1. Authorization and Phase Boundary

The user explicitly authorized exactly one next phase after P42. P42 remains correctly recorded as **PARTIAL** because its remaining capabilities are missing authoritative backend/public contracts, not unfinished safe mobile contract work.

P43 owns the customer-facing Kitchen Profile UI and interactions that can be implemented safely from the existing P42 public kitchen/profile query. P43 does **not** implement P44 Kitchen All Dishes, invent a favorite endpoint, add a new backend/APIM route, or reinterpret unsupported fields as real product data.

Reference 15 expects profile identity, trust/credibility context, story/about content, dish discovery, favorite behavior, and navigation toward a complete menu. Where the current branch lacks authoritative verification/rating/order/serviceability/favorite/featured/media/full-menu capabilities, the UI fails closed and the phase remains PARTIAL.

---

## 2. Implemented P43 UI Boundary

### Typed route and customer navigation

P43 adds a stable `CustomerKitchenProfile` route carrying only `kitchenId`.

The route is registered in both Customer Home and Chefs stacks so it can share the same public profile screen without creating another navigation container or parallel architecture.

Nearby Chef cards now open the real Kitchen Profile route instead of the earlier P42 boundary notice.

The focused profile route uses immersive customer chrome: bottom navigation and shared View Cart overlay remain hidden while the profile itself still shows a compact, live cart-count summary.

### Reference-safe profile composition

The screen renders only facts backed by P42:

- display/kitchen name,
- public area/city/state,
- active-kitchen state,
- factual `createdAt` tenure year when valid,
- public biography/about copy,
- current sellable-menu count,
- public sellable dish summaries,
- public menu-item images where available.

Because the current public profile contract has no kitchen hero/profile media, the hero uses a branded initials/chef fallback rather than fake photography or a fabricated chef portrait.

Because verification/rating/order-count/final serviceability data is absent, P43 does not render a fake verified badge, star score, review count, completed-order count, ETA, or delivery promise.

### Menu preview without invented ranking

P43 intentionally labels the bounded section **Available dishes / Menu preview**, not “Top Dishes.”

The preview:

- keeps the exact P42/backend-returned menu order,
- shows at most four items on this profile,
- prefers an actual primary image when one is present,
- opens real Customer Dish Detail routes,
- never sorts or labels category/name ordering as popularity, recommendation, or featured ranking.

If the kitchen has more than four sellable items, the profile states that more dishes exist but does not add the P44 complete-menu route early.

### Real cart interactions

Each preview dish uses the existing authoritative cart domain:

- Add uses the real existing cart mutation,
- existing lines expose decrement/increment controls,
- quantity state is read from the shared cart snapshot,
- pending mutation state disables duplicate taps,
- increment/Add first refetches the P42 profile/menu query,
- removed dishes fail closed,
- changed prices are surfaced before mutation,
- backend/cart mutation failures preserve valid screen state and surface the established error message.

No local per-profile cart copy is introduced.

### Favorite behavior

The reference expects a kitchen favorite action, but the branch has no authoritative kitchen-favorite read/mutation contract. The visible Save control therefore gives an explicit unavailable state and does **not** mutate synthetic local favorite state.

This is an acceptance blocker, so P43 remains PARTIAL.

---

## 3. Lifecycle, Back, and Scroll Preservation

P43 implements:

- invalid-kitchen-link terminal state,
- customer-session-required terminal state,
- initial skeleton,
- retryable terminal load failure,
- offline/recoverable refresh notices while keeping valid profile data visible,
- pull-to-refresh,
- empty-menu state,
- accessible back/action semantics and minimum touch targets.

The screen records its vertical scroll offset and restores it when focus returns after opening a Dish Detail route. Native stack back therefore preserves the profile position and local About expansion state instead of rebuilding the profile at the top.

Existing Chef Discovery search/list state remains in its owning P37 session, so returning from the profile continues to use the established discovery restoration path.

---

## 4. Explicit P43 Acceptance Blockers

Full Reference 15/P43 acceptance is not possible on the current branch because there is still no authoritative customer-facing contract for:

1. kitchen verification/trust badge/status,
2. kitchen rating/reviews/review count,
3. customer-facing fulfilled-order count,
4. final selected-address serviceability or ETA,
5. kitchen favorite read/mutation,
6. featured/Top Dishes ranking,
7. kitchen/chef public hero/profile media.

Additionally, **P44 — Kitchen All Dishes** owns complete-menu list/categories/filter/pagination/Add behavior. P43 deliberately does not pre-implement that phase or create a fake “View All” destination.

Therefore P43 is **PARTIAL**, not DONE, despite all safe/current-contract P43 implementation passing CI.

---

## 5. Changed Files

Implementation/navigation:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`
- `apps/mobile/src/features/kitchenProfile/kitchenProfilePresentation.ts`
- `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx`

Tests:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/features/kitchenProfile/kitchenProfilePresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P43_CUSTOMER_FACING_KITCHEN_PROFILE_UI.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P44 All Dishes implementation, checkout/payment, or Chef-owner operational feature was changed.

---

## 6. Focused Test / Static Coverage

P43 validation covers:

- typed profile route ownership,
- immersive route policy,
- public identity initials and location formatting,
- factual tenure formatting,
- bounded menu preview preserving backend order,
- primary-image selection without changing the source collection,
- existing P42 API/query tests remaining green,
- existing navigation/cart/discovery suites remaining green.

The full application Jest suite also passed, not only the new focused tests.

---

## 7. CI Validation

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Validated implementation:

- Commit: `1925e4c2df9b8601308c4694d31bc39e09171723`
- GitHub Actions run ID: `31255924625`
- Job ID: `93099137715`
- Conclusion: **SUCCESS**

Passed gates:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint zero-warning gate,
4. Jest,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 8. Visual QA

P43 implements the supported Reference 15 composition with the locked CRAVES Flame Red `#F62E18`, Espresso Brown `#261A15`, warm surfaces, branded fallback media, accessible controls, and bounded card layout.

Physical-device/pixel-perfect certification against the final Reference 15 image remains intentionally deferred to the later visual QA phases. Unsupported backend-dependent reference fields are not simulated for visual similarity.

---

## 9. Stop State

**P43 — Customer-Facing Kitchen Profile UI: PARTIAL.**

Every safe, supportable current-branch P43 behavior implemented in this phase is CI-validated. Remaining acceptance gaps require missing authoritative contracts or the separately authorized P44 complete-menu phase.

**P44 — Kitchen All Dishes was not started.**

**Next phase authorization: NONE — stop after P43 and wait for explicit user direction.**
