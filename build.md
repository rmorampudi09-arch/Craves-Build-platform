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
- **P43 — Customer-Facing Kitchen Profile UI: PARTIAL.** Typed immersive profile route, Chef Discovery → profile navigation, supported Reference 15 composition, public identity/location/tenure/about presentation, bounded non-ranked menu preview, real Dish Detail opening, real shared-cart Add/quantity reconciliation with pre-mutation profile revalidation, lifecycle states, pull-to-refresh, and profile scroll restoration are implemented and CI-validated. Full P43 acceptance remains blocked by the missing P42 verification/rating/order/serviceability/favorite/featured/media contracts and by P44 ownership of the complete-menu destination.

**Current executed phase:** **P43 — Customer-Facing Kitchen Profile UI** is **PARTIAL**. Every safe/supportable current-branch P43 UI/navigation/cart/lifecycle/state-preservation behavior implemented in this phase passed CI. Missing contract-dependent reference capabilities are shown honestly or withheld rather than fabricated.

**Next phase in sequence:** **P44 — Kitchen All Dishes** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P44. Wait for explicit user direction.

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
| P44 onward | **NOT STARTED / not accepted** | — | — | — |

### P43 evidence commits

- User authorized exactly one next phase after P42 while P42 remained correctly recorded as PARTIAL.
- Started from branch head: `c85664b33948613e6be7707d91d3d106b2a85b3d`.
- Validated implementation commit: `1925e4c2df9b8601308c4694d31bc39e09171723`.
- Evidence commit: `1d56a293bedeed8c9ce22ec7bbd2743642136bb4`.
- Evidence: `docs/mobile-ui-rebuild/P43_CUSTOMER_FACING_KITCHEN_PROFILE_UI.md`.
- CI run/job: `31255924625` / `93099137715` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31255924625`
- Job ID: `93099137715`
- Head SHA: `1925e4c2df9b8601308c4694d31bc39e09171723`
- Phase: **P43 — Customer-Facing Kitchen Profile UI**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P43 Implemented UI Boundary

### Typed profile route and source navigation

P43 adds `CustomerKitchenProfile` with only the stable `kitchenId` route parameter and registers it in both Customer Home and Chefs stack domains. Nearby Chef cards now open this real route instead of the former P42 boundary notice.

The route is immersive under the existing customer chrome policy. Bottom navigation and shared View Cart chrome do not overlap the detail experience; the profile itself displays a compact live cart-count summary.

### Supported Reference 15 composition

The profile renders only data P42 can establish authoritatively:

- display/kitchen identity,
- area/city/state,
- active public-kitchen state,
- valid created-at tenure year,
- public biography,
- current sellable-menu count,
- current sellable dish summaries and their usable public images.

Because no public kitchen hero/profile image contract exists, P43 uses a branded initials/chef fallback rather than fake photography. It does not synthesize a verified badge, rating, review count, order count, final serviceability/ETA, or delivery promise.

### Available-dish preview

P43 intentionally uses **Available dishes / Menu preview**, not “Top Dishes.” The preview preserves P42/backend category/name ordering, is bounded to four items, prefers a real primary dish image where available, and opens the existing real Customer Dish Detail route.

The profile Menu action scrolls to this real menu preview. If more than four current sellable dishes exist, the UI indicates that more dishes exist but does not create P44's complete-menu screen or a fake View All destination.

### Authoritative cart reconciliation

Preview dishes compose the existing shared cart snapshot and mutation state. Add/increment/decrement use the real cart mutation engine; duplicate taps are disabled while relevant work is pending. Add/increment refetches the P42 kitchen profile/menu before mutation, fails closed if a dish disappeared, and surfaces a changed price before proceeding. Cart mutation errors preserve valid profile data and are shown through the established recoverable notice.

No second/local kitchen-profile cart domain is introduced.

### State and lifecycle

P43 implements invalid-link, session-required, skeleton, retryable load failure, offline/recoverable refresh, pull-to-refresh, and empty-menu states. It records and restores profile scroll offset on focus return from Dish Detail, while the existing P37 discovery session remains authoritative for discovery-list restoration.

---

## 5. P43 Acceptance Blockers

Full Reference 15/P43 acceptance remains blocked because the current branch has no authoritative customer-facing contract for:

- public kitchen verification/trust badge/status,
- kitchen rating, reviews, or review count,
- customer-facing fulfilled-order count,
- final selected-address delivery serviceability or ETA,
- kitchen favorite read/mutation,
- featured/Top Dishes ranking,
- kitchen/chef public hero/profile media.

The visible Save control therefore reports that saving is unavailable; it does not manufacture local favorite state.

Separately, **P44 owns Kitchen All Dishes** including the complete menu list/categories/filter/pagination/Add experience. P43 does not pre-implement P44, so the reference's full-menu destination is still not accepted.

Because these guide-required behaviors remain unavailable, P43 is **PARTIAL**, not DONE.

---

## 6. P43 Changed Files

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

Ledger:

- `build.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P44 All Dishes implementation, checkout/payment, or Chef-owner operational feature was changed.

---

## 7. Architecture Ownership After P43

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/cart foundations.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described in their evidence.
- P39 owns Customer Dish Detail server-data/cache boundaries.
- P40 owns supported Dish Detail UI/cart-revalidation/back behavior.
- P41 owns the Dish Ingredients child-route/lifecycle/capability boundary.
- P42 owns the customer-facing public Kitchen Profile data contract/query/cache boundary.
- **P43 owns the supported Customer-Facing Kitchen Profile UI/navigation/menu-preview/cart/lifecycle/state-preservation boundary.**
- **P44 owns Kitchen All Dishes UI/complete-menu behavior and has not started.**
- P45/P46 own Cart screen data/pricing and Cart/Bill Summary UI.
- Later checkout/payment/order/account/Chef phases remain not started unless their earlier evidence says otherwise.

---

## 8. Explicitly Not Complete After P43

Do not describe any of the following as complete:

- the outstanding blockers recorded for P31–P42,
- P43 verification/rating/review/order-count/serviceability/ETA/favorite/featured-ranking/kitchen-media/full-menu-destination acceptance,
- physical-device/pixel-perfect Reference 15 certification,
- **P44 Kitchen All Dishes**, including complete menu/categories/filter/pagination behavior,
- full Customer Cart/Bill Summary,
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
