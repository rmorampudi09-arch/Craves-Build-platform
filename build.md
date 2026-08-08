# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13 onward uses dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger intentionally stays compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00–P30: DONE** at the implementation/static-contract level recorded by their accepted ledger/evidence records. Device/reference certification remains deferred where those records say so.
- **P31 — Home Feed Data Contract and Query Model: PARTIAL.** Exact nearby-menu/location/pagination/cache behavior is implemented and validated. Category/cuisine/full-home mapping remains blocked because no authoritative concrete contract exists.
- **P32 — Customer Home — Empty Cart: PARTIAL.** Supported Home root, nearby feed presentation, Add action, saved location, loaded-result filtering/search, pagination, refresh, bottom-nav scroll behavior, and lifecycle states are implemented and CI-validated. Richer favorite/full-search/category/cuisine/recommendation contracts and later-owned routes remain blocked.
- **P33 — Customer Home — Active Cart: PARTIAL.** Same Home route reconciles dish cards to the authoritative cart snapshot and real quantity controls. The visible Cart destination remains P45/P46-owned.
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated summary mapping, saved-location coordinates, pagination, cache identity, and invalidation are CI-validated. Final delivery-serviceability and richer kitchen fields remain missing.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** Supported nearby-kitchen discovery surface, location, pagination, loaded-result search, refresh, lifecycle states, and scroll-aware bottom navigation are implemented. Richer rating/ETA/verification/media/favorite/server-search/filter capabilities remain blocked.
- **P36 — Discover Home Chefs — Active Cart: PARTIAL.** Same Chefs route composes authoritative View Cart count/subtotal and zero-cart restoration. Real Cart navigation and dish-level Add behavior remain later/blocker-owned.
- **P37 — Search Query Orchestration: PARTIAL.** Debounce, cancellation, user/location-scoped query and scroll restoration, pagination, and stale-result protection are CI-validated. Server-wide dish/chef free-text search remains unavailable.
- **P38 — Filter and Sort: PARTIAL.** Focused route, separate draft/applied state, Reset/Apply/discard behavior, route policy, and currently supportable filtering are CI-validated. Full server-side filter/sort metadata and parameters remain unavailable.
- **P39 — Dish Detail Data Contract: PARTIAL.** Exact public Catalog item+kitchen composition, current price/availability, media mapping, customer-safe kitchen allowlist, stable cache identity, and future favorite reconciliation boundary are CI-validated. Cuisine/ingredients/allergens/reviews/favorite contracts remain missing.
- **P40 — Dish Detail UI and Interactions: PARTIAL.** Typed route/UI, gallery/share, supported facts, sticky cart actions, current-detail revalidation, cart reconciliation, lifecycle states, and source-position back restoration are CI-validated. Favorite/ingredient/review data and dedicated Buy Now intent remain missing.
- **P41 — Dish Ingredients: PARTIAL.** Typed child route, Dish Detail entry, immersive chrome, state-preserving back behavior, detail-query reuse, lifecycle states, and explicit ingredient/allergen fail-closed capability gate are CI-validated. Authoritative ingredient/allergen/dietary-warning payloads remain missing.
- **P42 — Customer-Facing Kitchen Profile Contract: PARTIAL.** Exact current public active-kitchen and sellable-menu compatibility routes, customer-safe profile allowlisting, supported menu-summary/media mapping, stable customer+kitchen query ownership, and future favorite-cache reconciliation boundary are implemented and CI-validated. Verification, rating/reviews, order-count, final serviceability/ETA, kitchen-favorite, featured/top-dish ranking, kitchen hero/profile media, and paginated public kitchen-menu contracts remain absent.
- **P43 — Customer-Facing Kitchen Profile UI: PARTIAL.** Typed immersive profile route, Chef Discovery → profile navigation, supported Reference 15 composition, public identity/location/tenure/about presentation, bounded non-ranked menu preview, real Dish Detail opening, real shared-cart Add/quantity reconciliation with pre-mutation profile revalidation, lifecycle states, pull-to-refresh, and profile scroll restoration are implemented and CI-validated. P44 now supplies the real complete-menu destination, but P43 remains blocked by the missing P42 verification/rating/order/serviceability/favorite/featured/media contracts.
- **P44 — Kitchen All Dishes: PARTIAL.** Typed immersive `CustomerKitchenDishes` route, real Kitchen Profile View all navigation, virtualized complete current-contract menu rendering, authoritative category filtering, Dish Detail opening, shared-cart Add/quantity reconciliation with pre-mutation menu revalidation, lifecycle states, pull-to-refresh, and list scroll/category preservation are implemented and CI-validated. Full Reference 16 acceptance remains blocked by the non-paginated public menu contract, missing rating/favorite/final-serviceability fields, and deferred physical-device/reference certification.

**Current executed phase:** **P44 — Kitchen All Dishes** is **PARTIAL**. Every safe/supportable current-branch P44 navigation/menu/filter/cart/lifecycle/state-preservation behavior implemented in this phase passed CI. Missing contract-dependent reference capabilities are withheld rather than fabricated.

**Next phase in sequence:** **P45 — Cart Data / Pricing Composition** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P45. Wait for explicit user direction.

---

## 2. Phase Evidence Summary

| Phase | Status | Validated implementation | Evidence | CI run/job |
|---|---|---|---|---|
| P00–P30 | **DONE** | See historical/dedicated records | `docs/mobile-ui-rebuild/` | See phase evidence |
| P31 | **PARTIAL** | `641ef5321a886185e5956f966f1710e231ee2ad4` | `P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md` | `31243903844` / `93069234068` |
| P32 | **PARTIAL** | `9227a56fb8caf3213d3900bed9e3b4eb7514f543` | `P32_CUSTOMER_HOME_EMPTY_CART.md` | `31245957014` / `93074471641` |
| P33 | **PARTIAL** | `bcb25866df664a77c8b83fa50c029f967d72a9be` | `P33_CUSTOMER_HOME_ACTIVE_CART.md` | `31248405375` / `93080699835` |
| P34 | **PARTIAL** | `02b17243ff9845825068d3dae4b01c05f5e3ac72` | `P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md` | `31248762726` / `93081608217` |
| P35 | **PARTIAL** | `5fd2dfa0b36de13f38db16f45fed374d7f295724` | `P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md` | `31249264023` / `93082900325` |
| P36 | **PARTIAL** | `f86d4e29041330eb768ac53f64848729446c6415` | `P36_DISCOVER_HOME_CHEFS_ACTIVE_CART.md` | `31249712277` / `93083997312` |
| P37 | **PARTIAL** | `1d9e084c8825faab7d2578e481c9fdd4cc6ae865` | `P37_SEARCH_QUERY_ORCHESTRATION.md` | `31250802472` / `93086759138` |
| P38 | **PARTIAL** | `4465618e64908c48e535de7d8fe83cd03a3b9bcd` | `P38_FILTER_AND_SORT.md` | `31251797224` / `93089169496` |
| P39 | **PARTIAL** | `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94` | `P39_DISH_DETAIL_DATA_CONTRACT.md` | `31252552058` / `93091033108` |
| P40 | **PARTIAL** | `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb` | `P40_DISH_DETAIL_UI_AND_INTERACTIONS.md` | `31253969455` / `93094455601` |
| P41 | **PARTIAL** | `455d19bcc567e23496f33cc570922b91cee03841` | `P41_DISH_INGREDIENTS.md` | `31254643084` / `93096130239` |
| P42 | **PARTIAL** | `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d` | `P42_CUSTOMER_FACING_KITCHEN_PROFILE_CONTRACT.md` | `31255118989` / `93097257711` |
| P43 | **PARTIAL** | `1925e4c2df9b8601308c4694d31bc39e09171723` | `P43_CUSTOMER_FACING_KITCHEN_PROFILE_UI.md` | `31255924625` / `93099137715` |
| P44 | **PARTIAL** | `4aec92a750929f403e5e94bea1756a8bdbea62b7` | `P44_KITCHEN_ALL_DISHES.md` | `31256729097` / `93101120486` |
| P45 onward | **NOT STARTED / not accepted** | — | — | — |

### P44 evidence commits

- User authorized exactly one next phase after P43 while P43 remained correctly recorded as PARTIAL.
- Started from branch head: `f5c5d73ba68ba906506afb40ff5faba9b8c24a28`.
- Validated implementation commit: `4aec92a750929f403e5e94bea1756a8bdbea62b7`.
- Evidence commit: `8f86f4f29fbfc003959fc5983b13f5c3115e09b1`.
- Evidence: `docs/mobile-ui-rebuild/P44_KITCHEN_ALL_DISHES.md`.
- CI run/job: `31256729097` / `93101120486` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31256729097`
- Job ID: `93101120486`
- Head SHA: `4aec92a750929f403e5e94bea1756a8bdbea62b7`
- Phase: **P44 — Kitchen All Dishes**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P44 Implemented Boundary

### Typed complete-menu route

P44 adds `CustomerKitchenDishes` with only the stable `kitchenId` route parameter and registers it in both Customer Home and Chefs stack domains. The P43 Kitchen Profile now exposes a real **View all** action to this route. Back/system return preserves the existing Kitchen Profile instance/state.

The route is immersive under the existing focused customer detail policy. Bottom navigation and shared View Cart chrome do not overlap it; the screen itself shows a compact live cart-count summary.

### Exact public menu contract

P44 reuses P42's existing validated API/query boundary:

```http
GET /api/v1/catalog/kitchens/{kitchenId}
GET /api/v1/catalog/kitchens/{kitchenId}/menu-items
```

Backend sources:

- `services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java`
- `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java`

Response models:

- `ApiDtos.KitchenProfileResponse`
- `List<ApiDtos.MenuItemResponse>`

The public menu service returns only ACTIVE + available dishes and orders them by `category, item_name`. The route has no pagination parameters, so P44 does not invent network pagination.

### Virtualized menu and supported filters

The complete current response is presented through `FlatList` with stable IDs and bounded render windows. Category chips are derived from actual returned category values, de-duplicated case-insensitively, and filter the current response without changing backend order.

Rows render only supported item image/fallback, name, category, food type, preparation time, description, and current public price/currency. Missing reference rating/favorite/serviceability data is not synthesized.

### Authoritative cart reconciliation

Every row composes the same shared cart snapshot/mutation engine used by P43 and other customer surfaces. Add/increment/decrement are real cart mutations. Add/increment refetches the current public kitchen/menu before mutation, fails closed if the dish disappeared, and surfaces price changes before proceeding.

No P44-local cart state is introduced. The public endpoint already excludes unavailable dishes; stale availability is caught by the pre-mutation refetch instead of allowing a known-invalid add.

### Lifecycle and return state

P44 implements invalid-link, session-required, loading skeleton, initial load error, offline/recoverable refresh error, pull-to-refresh, empty-menu, empty-filter, and cart-interaction error states. It restores the All Dishes FlatList offset when returning from Dish Detail and preserves the selected category while the route remains mounted.

---

## 5. P44 Acceptance Blockers

Full Reference 16/P44 acceptance remains blocked because the current branch has no authoritative customer-facing contract for:

- paginated public kitchen-menu transport,
- kitchen/dish rating aggregate,
- kitchen/dish favorite read/mutation and therefore favorite-state synchronization,
- final selected-address serviceability/ETA.

The current unpaginated response is virtualized on-device, but client rendering virtualization is not misrepresented as scalable network pagination.

Physical Android/reference-image verification was not performed in this implementation phase, so pixel-perfect Reference 16 certification is also deferred.

P45/P46 own the real Cart destination and bill-summary flow. P44 does not pre-implement them.

Because these guide-required capabilities remain unavailable, P44 is **PARTIAL**, not DONE.

---

## 6. P44 Changed Files

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

Ledger:

- `build.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P45/P46 Cart implementation, checkout/payment, favorite service, review service, or Chef-owner operational feature was changed.

---

## 7. Architecture Ownership After P44

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/cart foundations.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described in their evidence.
- P39 owns Customer Dish Detail server-data/cache boundaries.
- P40 owns supported Dish Detail UI/cart-revalidation/back behavior.
- P41 owns the Dish Ingredients child-route/lifecycle/capability boundary.
- P42 owns the customer-facing public Kitchen Profile data contract/query/cache boundary.
- P43 owns the supported Customer-Facing Kitchen Profile UI/navigation/menu-preview/cart/lifecycle/state-preservation boundary.
- **P44 owns the supported Kitchen All Dishes route, current-contract virtualized complete-menu presentation, category filter, Dish Detail entry, shared-cart reconciliation, lifecycle, and return-state boundary.**
- **P45/P46 own Cart data/pricing and Cart/Bill Summary and have not started.**
- Later checkout/payment/order/account/Chef phases remain not started unless their earlier evidence says otherwise.

---

## 8. Explicitly Not Complete After P44

Do not describe any of the following as complete:

- the outstanding blockers recorded for P31–P43,
- P44 scalable network pagination, rating, favorite synchronization, or final serviceability/ETA acceptance,
- physical-device/pixel-perfect Reference 16 certification,
- **P45/P46 Cart data/pricing and Cart/Bill Summary**,
- checkout/payment end-to-end flow,
- Chef operational/product screens,
- live APIM/device runtime certification unless a later evidence record explicitly says so,
- full lifecycle/accessibility/performance/security audits,
- 52-reference visual certification,
- production APK/AAB/signing/release readiness.

---

## 9. Phase Completion Recording Protocol

After every authorized phase, record:

```text
Phase: Pxx — Title
Status: DONE | PARTIAL | BLOCKED
Started from commit: <sha>
Validated implementation commit: <sha>
Evidence commit: <sha>
Guide references: <screen refs/pages or global rules used>
Changed files: <exact paths>
APIM/contracts used: <exact route/method/model source>
Behavior completed: <bounded summary>
Tests/checks: <results/run id>
Visual QA: <deferred or evidence>
Blockers: <none or exact missing dependency>
Next phase: NONE AUTHORIZED — waiting for user
```
