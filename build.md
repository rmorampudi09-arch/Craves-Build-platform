# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13 onward uses dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger stays compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00–P30: DONE** at the implementation/static-contract level recorded by their existing ledger/evidence records. Device/reference certification remains deferred where those records say so.
- **P31 — Home Feed Data Contract and Query Model: PARTIAL.** Exact nearby-menu/location/pagination/cache behavior is implemented and validated. Category/cuisine/full-home mapping remains blocked because the current branch has no authoritative concrete contract for those capabilities.
- **P32 — Customer Home — Empty Cart: PARTIAL.** The supported empty-cart Home root, exact nearby feed presentation, Add action, saved-location behavior, loaded-result search/category filtering, pagination, refresh, bottom-nav scroll behavior, and lifecycle states are implemented and CI-validated. Full P32 acceptance remains blocked by missing favorite/full-search/category/cuisine/recommendation contracts and by Chef/Dish/Notifications product routes that belong to later phases and are not registered yet.
- **P33 — Customer Home — Active Cart: PARTIAL.** The same Home route reconciles loaded dish cards to the authoritative cart snapshot, exposes real increment/decrement/remove quantity controls, protects duplicate line mutations, and returns to Add when a line reaches zero. The required visible View Cart/count/total and `View Cart -> Cart` action remain blocked because no Customer Cart product route is registered and P45/P46 own that later destination.
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated kitchen-summary mapping, saved-location coordinates, pagination, bounded cache identity, and targeted invalidation are implemented and CI-validated. Full P34 acceptance remains blocked because the current branch has no authoritative delivery-serviceability contract; richer rating/ETA/cuisine/favorite/verification/media/search/filter/sort data is also absent from the current nearby-kitchen contract.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** The real Customer Chefs root renders the supported nearby-kitchen discovery surface using P34 data, saved location, pagination, loaded-result search, pull-to-refresh, lifecycle states, and scroll-aware bottom navigation. Full P35 acceptance remains blocked by missing cuisine/filter/favorite/rating/ETA/verification/media/server-search contracts and by the not-yet-registered public kitchen-profile route owned by later phases.
- **P36 — Discover Home Chefs — Active Cart: PARTIAL.** The same Customer Chefs route composes the P35 discovery surface with the shared View Cart overlay, canonical cart item count/server subtotal, dynamic bottom clearance, and zero-cart restoration. Full P36 acceptance remains blocked because no real Customer Cart destination exists before P45/P46 and the nearby-kitchen response has no dish-level item/price payload for Reference 08 Add actions.
- **P37 — Search Query Orchestration: PARTIAL.** Shared Home/Chefs search-session state, 250 ms debounce, exact-query cancellation, user/location-scoped query and scroll restoration, active-search pagination, and stale-result-safe client orchestration are implemented and CI-validated. Full P37 acceptance remains blocked because the current branch has no authoritative dish/chef server-search route, parameter, or response model, and literal detail/back acceptance depends on later-owned detail routes that are not registered yet.

### P31 evidence

- Validated implementation commit: `641ef5321a886185e5956f966f1710e231ee2ad4`.
- Evidence commit: `87da0591af6768ab5640f2167c61cc8439b026e8`.
- Evidence: `docs/mobile-ui-rebuild/P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md`.
- CI run/job: `31243903844` / `93069234068` — **SUCCESS**.

### P32 evidence

- Validated implementation commit: `9227a56fb8caf3213d3900bed9e3b4eb7514f543`.
- Evidence commit: `25715d9d79ff3dcf911e24b341d956adf4a952aa`.
- Evidence: `docs/mobile-ui-rebuild/P32_CUSTOMER_HOME_EMPTY_CART.md`.
- CI run/job: `31245957014` / `93074471641` — **SUCCESS**.

### P33 evidence

- Validated implementation commit: `bcb25866df664a77c8b83fa50c029f967d72a9be`.
- Evidence commit: `aa75b09780823da4de78abdda7393763a4707eff`.
- Evidence: `docs/mobile-ui-rebuild/P33_CUSTOMER_HOME_ACTIVE_CART.md`.
- CI run/job: `31248405375` / `93080699835` — **SUCCESS**.

### P34 evidence

- Validated implementation commit: `02b17243ff9845825068d3dae4b01c05f5e3ac72`.
- Evidence commit: `60bc159d78e3f410190acb6e13367c375ea1f821`.
- Evidence: `docs/mobile-ui-rebuild/P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md`.
- CI run/job: `31248762726` / `93081608217` — **SUCCESS**.

### P35 evidence

- Validated implementation commit: `5fd2dfa0b36de13f38db16f45fed374d7f295724`.
- Evidence commit: `74c529cc2c3d84835d8420e0c984cabe24d5f886`.
- Evidence: `docs/mobile-ui-rebuild/P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md`.
- CI run/job: `31249264023` / `93082900325` — **SUCCESS**.

### P36 evidence

- Validated implementation commit: `f86d4e29041330eb768ac53f64848729446c6415`.
- Evidence commit: `ee45299e2fc14aca4963c15208149a3d2c6267b7`.
- Evidence: `docs/mobile-ui-rebuild/P36_DISCOVER_HOME_CHEFS_ACTIVE_CART.md`.
- CI run/job: `31249712277` / `93083997312` — **SUCCESS**.

### P37 evidence

- User explicitly authorized exactly the next single phase after P36 while P36 remains correctly recorded as PARTIAL.
- Started from branch head: `06fb86bb6d6d1e3e85e709e2bccaaf35345225da`.
- Initial implementation commit: `764636d530952f06d9b252200731d225033f02a1`.
- Validated implementation commit: `1d9e084c8825faab7d2578e481c9fdd4cc6ae865`.
- Evidence commit: `bef00a0a0263c6b2b7a069f4f6c1f7ce9d888deb`.
- Evidence: `docs/mobile-ui-rebuild/P37_SEARCH_QUERY_ORCHESTRATION.md`.
- CI run/job: `31250802472` / `93086759138` — **SUCCESS**.
- Jest at the validated gate: **42 suites / 197 tests passed**.
- CI gates passed: dependency install, strict TypeScript, ESLint zero-warning gate, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.
- Outstanding blockers: no exact current-branch dish/chef free-text server-search route/parameter/model; later-owned Dish/Public Kitchen detail destinations are not registered yet for a literal detail/back navigation acceptance exercise.

**Current executed phase:** **P37 — Search Query Orchestration** is recorded **PARTIAL** because the supported shared client orchestration is implemented and CI-validated while the exact server search contracts and later detail-route dependencies required for full acceptance do not exist in the current authorized boundary.

**Next phase in sequence:** **P38 — Filter and Sort** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P38. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31250802472`
- Job ID: `93086759138`
- Head SHA: `1d9e084c8825faab7d2578e481c9fdd4cc6ae865`
- Phase: **P37 — Search Query Orchestration**
- Conclusion: **SUCCESS**
- Jest: **42 suites / 197 tests passed**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup and dependency install from lockfile,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero-warning gate,
5. Jest,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P37 Implemented Search Query Orchestration Boundary

P37 follows the guide requirement to debounce user search input, cancel obsolete requests, keep list memory bounded, prevent stale response overwrite, and preserve safe search/list state through navigation where product routes allow it. It does not invent backend contracts and does not begin P38.

Implemented behavior:

- Added one shared `discoverySearch` Redux slice with independent `HOME` and `CHEFS` sessions rather than separate ad hoc screen stores.
- Search sessions are scoped by authenticated identity plus selected saved-address ID; changing browsing scope resets the prior query and offset to prevent cross-context leakage.
- Stores only controlled query draft and scroll offset. Server result pages remain in TanStack Query rather than being duplicated in Redux.
- Added a shared **250 ms** debounce and whitespace normalization boundary.
- Reused the existing TanStack infinite-query/AbortSignal transport path and exposed exact-query cancellation on Home and nearby-chef query hooks.
- Cancels pending next-page work when the search draft changes or is cleared.
- Keeps pagination available while search is active and blocks duplicate next-page work while a page request or debounce transition is in progress.
- When loaded pages contain no match but the authoritative response says another page exists, presents `Search next page` instead of falsely claiming that no match exists in the full server dataset.
- Keeps current query state independent from page-arrival state so a late page cannot replace a newer user query.
- Persists query/scroll state outside transient screen-local state so the same browsing scope can restore it on re-entry; this is prepared for later detail/back routes without pre-implementing them.
- Reuses a shared accessible clearable search input across Home and Chefs.

### P37 acceptance blockers

`phases.md` requires exact dish/chef search routes and models. The current branch only exposes location/radius/page/size pagination for `/api/v1/discovery/menu-items` and `/api/v1/discovery/kitchens`; there is no authoritative free-text server-search parameter or dedicated search endpoint/model to integrate. The literal detail/back acceptance journey also cannot be exercised end-to-end until later-owned Dish/Public Kitchen detail destinations are registered.

No fake `q`, `query`, or `search` API parameter, placeholder detail route, or fabricated response model was introduced. P37 therefore remains **PARTIAL**, not DONE.

---

## 4. P37 Changed Files

Implementation:

- `apps/mobile/src/features/discoverySearch/state/discoverySearchSlice.ts`
- `apps/mobile/src/features/discoverySearch/discoverySearchOrchestration.ts`
- `apps/mobile/src/features/discoverySearch/hooks/useDiscoverySearchSession.ts`
- `apps/mobile/src/features/discoverySearch/components/DiscoverySearchInput.tsx`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/home/query/homeFeedQueries.ts`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`

Tests:

- `apps/mobile/src/features/discoverySearch/discoverySearchOrchestration.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P37_SEARCH_QUERY_ORCHESTRATION.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P38 filter/sort implementation, Cart/Bill Summary UI, checkout/payment, public kitchen-profile implementation, or Chef-owner operational feature was changed.

---

## 5. Current Architecture Ownership

### Authentication/session

- P19–P24 remain authoritative for Firebase exchange, secure session storage/refresh, identity/onboarding resolution, logout/revoke, and private-state cleanup.

### Customer shell/shared state

- P25 owns Customer root shell and four typed bottom tabs.
- P26 owns bottom-navigation scroll hide/reveal behavior.
- P27 owns shared customer header, saved browsing location, and notification badge derivation.
- P28 owns canonical cart read domain, server-total snapshot, selectors, dependency metadata, and mutation metadata skeleton.
- P29 owns reusable shared View Cart presentation/visibility contract.
- P30 owns exact add/update/remove cart-line transport, optimistic safety, rollback, and reconciliation.
- P31 owns the validated nearby Home-discovery adapter/query model, saved-location coordinate propagation, pagination/cache keys, location invalidation, and fail-closed unsupported category/cuisine server-filter intent.
- P32 owns the current supported Customer Home empty-cart presentation and its connection to those accepted shared foundations.
- P33 owns the supported active-cart Home card quantity/reconciliation behavior on that same Home route.
- P34 owns the exact supported nearby-kitchen discovery transport/query/cache boundary for the Customer Chefs experience.
- P35 owns the current supported Customer Chefs empty-cart discovery presentation and connection of the real Chefs tab root to P34 data.
- P36 owns the supported same-route Customer Chefs active-cart chrome, canonical cart synchronization, shared View Cart composition, dynamic content clearance, and zero-cart restoration.
- P37 owns the current shared Customer discovery-search orchestration: scoped query/scroll state, debounce, exact-query cancellation, active-search pagination gate, and stale-query protection on supported Home/Chefs live datasets.

### Later-phase boundaries

- **P38** owns the dedicated Filter and Sort experience.
- Later Dish detail and public Kitchen profile phases own their real detail destinations and therefore the literal search-detail-back acceptance route.
- Later Customer favorite/notification routes remain owned by their phases in `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+.

---

## 6. Current Contract Status

Accepted Home discovery contract:

- `GET /api/v1/discovery/menu-items`
  - query: `latitude`, `longitude`, `radiusMeters`, `page`, `size`
  - authoritative paginated response: `DiscoveryDtos.NearbyMenuItemDiscoveryResponse`.

Accepted nearby-chef/kitchen discovery contract:

- `GET /api/v1/discovery/kitchens`
  - query: `latitude`, `longitude`, `radiusMeters`, `page`, `size`
  - authoritative paginated response: `DiscoveryDtos.NearbyKitchenDiscoveryResponse`
  - kitchen summary includes IDs/names/description/location/coordinates/distance/active-menu-item count.

Accepted customer-location dependency:

- existing saved-address response supplies ID/label/latitude/longitude for shared browsing-location state.

Accepted cart dependencies:

- canonical P28 cart snapshot and P30 add/set-quantity/remove-line mutations remain unchanged.

P37 adds **no** backend/APIM contract. The current discovery endpoints do not expose a free-text query parameter.

Not accepted because no exact current-branch contract or registered product route exists:

- dedicated dish free-text search route/model,
- dedicated chef/kitchen free-text search route/model,
- discovery `query`/`q`/`search` parameter,
- Home aggregation URL/model,
- cuisine taxonomy URL/model,
- discovery `category` parameter,
- discovery `cuisine` parameter,
- cuisine response field,
- recommendation aggregation URL/model,
- favorite API/domain contract,
- nearby-kitchen delivery-serviceability decision/ETA/rating/review/cuisine/favorite/verification/media fields,
- dish-level ID/price payload on the nearby-kitchen summary,
- real Customer Dish/Public Kitchen detail destinations required for literal P37 detail/back acceptance,
- real Customer Cart destination before P45/P46.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19–P24 | **DONE** | Accepted auth/session/onboarding/logout implementation evidence. |
| P25–P30 | **DONE** | Accepted Customer shell/header/cart implementation evidence. |
| P31 Home Feed Data Contract and Query Model | **PARTIAL** | Exact nearby/location/pagination/cache subset validated by CI `31243903844`; category/cuisine/full-home contracts missing. |
| P32 Customer Home — Empty Cart | **PARTIAL** | Supported Home surface validated by CI `31245957014`; richer contracts/later product routes remain blocked. |
| P33 Customer Home — Active Cart | **PARTIAL** | Same-route cart quantity reconciliation validated by CI `31248405375`; real View Cart destination remains later-owned. |
| P34 Nearby Chef Discovery Contract | **PARTIAL** | Exact nearby-kitchen subset validated by CI `31248762726`; richer/serviceability contracts missing. |
| P35 Discover Home Chefs — Empty Cart | **PARTIAL** | Supported real Chefs-root discovery surface validated by CI `31249264023`; richer filters/profile route remain blocked. |
| P36 Discover Home Chefs — Active Cart | **PARTIAL** | Shared View Cart/count/total/content-clearance behavior validated by CI `31249712277`; real Cart and dish Add requirements remain blocked. |
| P37 Search Query Orchestration | **PARTIAL** | Shared debounce/cancellation/scoped query+scroll restoration/active-search pagination validated by CI `31250802472`; exact server dish/chef search contract and literal detail/back route proof remain unavailable. |
| P38 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P37 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/chef-detail/dish-detail/full-search/notification-center/recommendation acceptance items listed in its evidence,
- P33/P36 real `View Cart -> Cart` navigation until P45/P46 provide the real destination,
- P34/P35 richer chef discovery requirements still blocked by missing contracts,
- P36 Reference 08 dish Add behavior blocked by the current nearby-kitchen response,
- P37 server-wide dish/chef free-text search using an exact backend search contract,
- P37 literal detail/back acceptance until later real detail destinations are registered,
- **P38 Filter and Sort**, which has not started,
- full Customer Cart/Bill Summary product screen,
- checkout/payment end-to-end flow,
- Chef operational/product screens,
- live APIM/device runtime certification of static-contract phases,
- physical-device pixel-perfect certification,
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
