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
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated kitchen-summary mapping, saved-location coordinates, pagination, bounded cache identity, and targeted invalidation are implemented and CI-validated. Full P34 acceptance remains blocked because the current branch has no authoritative delivery-serviceability contract; the richer rating/ETA/cuisine/favorite/verification/media/search/filter/sort data required by the Discover Home Chefs references is also absent from the current nearby-kitchen contract.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** The real Customer Chefs root now renders the supported nearby-kitchen discovery surface using P34 data, saved location, pagination, loaded-result search, pull-to-refresh, lifecycle states, and scroll-aware bottom navigation. Full P35 acceptance remains blocked by missing cuisine/filter/favorite/rating/ETA/verification/media/server-search contracts and by the not-yet-registered public kitchen profile route owned by P42/P43.

### P31 evidence

- Started from accepted P30 ledger head: `58ad6ffd46f09992d1ad1098dd4df7cc2c246bd0`.
- Validated implementation commit: `641ef5321a886185e5956f966f1710e231ee2ad4`.
- Evidence commit: `87da0591af6768ab5640f2167c61cc8439b026e8`.
- Evidence: `docs/mobile-ui-rebuild/P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md`.
- CI run/job: `31243903844` / `93069234068` — **SUCCESS**.
- Jest at that gate: **36 suites / 175 tests passed**.
- Outstanding blocker: no authoritative current-branch home aggregation endpoint, cuisine taxonomy endpoint, discovery `category` parameter, discovery `cuisine` parameter, cuisine field, or recommendation aggregation contract.

### P32 evidence

- User explicitly authorized advancing to the next phase while P31 remains recorded as PARTIAL.
- Started from branch head: `3635fe443dd263393e2899a4f0ebb5f555b108ef`.
- Validated implementation commit: `9227a56fb8caf3213d3900bed9e3b4eb7514f543`.
- Evidence commit: `25715d9d79ff3dcf911e24b341d956adf4a952aa`.
- Evidence: `docs/mobile-ui-rebuild/P32_CUSTOMER_HOME_EMPTY_CART.md`.
- CI run/job: `31245957014` / `93074471641` — **SUCCESS**.
- CI gates passed: `npm ci`, strict TypeScript, ESLint zero warnings, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.

### P33 evidence

- User explicitly authorized P33 after confirming P32 was partial.
- Started from branch head: `8a8d3cf42ac8240f1363e28a4e0a8c322d0f55d9`.
- Validated implementation commit: `bcb25866df664a77c8b83fa50c029f967d72a9be`.
- Evidence commit: `aa75b09780823da4de78abdda7393763a4707eff`.
- Evidence: `docs/mobile-ui-rebuild/P33_CUSTOMER_HOME_ACTIVE_CART.md`.
- CI run/job: `31248405375` / `93080699835` — **SUCCESS**.
- Jest at that gate: **37 suites / 179 tests passed**.
- Outstanding blocker: Reference 06 requires a functional `View Cart -> Cart` action, but no Customer Cart route is registered yet and P45/P46 own the Cart data/UI destination. No inert callback, unreachable route, or placeholder Cart screen was introduced.

### P34 evidence

- User explicitly authorized the next single phase after P33; P33 remains correctly recorded as PARTIAL.
- Started from branch head: `bdc157f09b4294b8de67436eeb16e0320ff8d006`.
- Validated implementation commit: `02b17243ff9845825068d3dae4b01c05f5e3ac72`.
- Evidence commit: `60bc159d78e3f410190acb6e13367c375ea1f821`.
- Evidence: `docs/mobile-ui-rebuild/P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md`.
- CI run/job: `31248762726` / `93081608217` — **SUCCESS**.
- CI gates passed: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.
- Outstanding blocker: the Catalog/APIM discovery operation supplies radius-based active kitchen discovery but explicitly does not define delivery serviceability. No current exact contract was found for delivery ETA, rating, cuisine taxonomy/filtering, chef favorites, public verification/media, or chef-search/filter/sort parameters.

### P35 evidence

- User explicitly authorized exactly the next single phase after P34 while P34 remains correctly recorded as PARTIAL.
- Started from branch head: `154f3334f0cefcb8a4841d6023b1b97f231c293b`.
- Validated implementation commit: `5fd2dfa0b36de13f38db16f45fed374d7f295724`.
- Evidence commit: `74c529cc2c3d84835d8420e0c984cabe24d5f886`.
- Evidence: `docs/mobile-ui-rebuild/P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md`.
- Guide ref: 7 / `image7.jpeg` — Discover Home Chefs — Empty Cart.
- CI run/job: `31249264023` / `93082900325` — **SUCCESS**.
- CI gates passed: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.
- Outstanding blockers: no exact cuisine/filter/favorite/rating/ETA/verification/media/server-search contract and no public Customer kitchen-profile route/contract is registered yet. Physical-device/reference-image pixel certification remains deferred to later visual QA phases.

**Current executed phase:** **P35 — Discover Home Chefs — Empty Cart** is recorded **PARTIAL** because the supported nearby-kitchen empty-cart surface is implemented and CI-validated, while guide-required rich data/filter/favorite/profile-navigation behavior cannot be completed without authoritative contracts/routes.

**Next phase in sequence:** **P36 — Discover Home Chefs — Active Cart** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P36. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31249264023`
- Job ID: `93082900325`
- Head SHA: `5fd2dfa0b36de13f38db16f45fed374d7f295724`
- Phase: **P35 — Discover Home Chefs — Empty Cart**
- Conclusion: **SUCCESS**

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

## 3. P35 Implemented Discover Home Chefs Empty-Cart Boundary

P35 uses Reference 07 and the existing P34 nearby-kitchen contract only. It does not begin P36 active-cart behavior or P42/P43 public kitchen-profile implementation.

Implemented behavior:

- Replaced the P25 temporary account-status content at `CustomerChefsRoot` with the real P35 discovery screen while keeping the existing typed tab/stack architecture.
- Reuses the P27 Customer header, saved browsing location, and notification-count refresh behavior.
- Reuses the P34 infinite nearby-kitchen query over `GET /api/v1/discovery/kitchens`.
- Uses only backend-owned kitchen fields: ID, names/description, area/city/state, coordinates, distance, and active-menu-item count.
- Uses the existing saved location coordinates and a bounded 10 km request radius without inventing a delivery ETA/serviceability conclusion.
- Paginates using backend `hasNext`, supports pull-to-refresh, and keeps page data bounded through the existing query cache model.
- Provides missing-location, loading skeleton, populated, no-nearby-results, local-search-empty, offline, recoverable-error, refresh, and pagination-loading states.
- Adds a presentation helper that deduplicates kitchens by stable ID, formats distance/location, derives initials only as a no-media fallback, and performs bounded search over already loaded contract fields.
- Loaded-result search does not send unsupported server query parameters and does not claim to be complete server search.
- The filter action reports the missing cuisine/rating/sort contract instead of returning fabricated results.
- Kitchen card interaction reports the missing public profile route/contract rather than navigating to an unreachable placeholder; P42/P43 remain the owning later phases.
- Bottom navigation follows the existing P26 hide/reveal controller while the chef list scrolls.
- P35 does not introduce a screen-local View Cart. The shared P29 cart visibility contract remains authoritative and the requested empty-cart state renders no View Cart.
- Added focused presentation tests for page flattening/deduplication, loaded-result search, distance/location formatting, and initials fallback.

### P35 acceptance blockers

Reference 07 and `phases.md` require richer filter/favorite/profile behavior than the current branch can truthfully support. There is no authoritative current contract for cuisine taxonomy/filtering, favorites, rating, ETA, delivery serviceability, public verification/media, or server-side chef search/filter/sort. There is also no registered public Customer kitchen-profile route yet; P42/P43 own that later product boundary.

The guide, `plan.md`, and `agent.md` prohibit fabricated fields, empty handlers, placeholder routes, and pre-implementing later phases. Therefore P35 remains **PARTIAL**, not DONE.

---

## 4. P35 Changed Files

Implementation:

- `apps/mobile/src/features/chefDiscovery/chefDiscoveryPresentation.ts`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`

Tests:

- `apps/mobile/src/features/chefDiscovery/chefDiscoveryPresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P36 active-cart chef-discovery behavior, Cart/Checkout, public kitchen-profile implementation, or Chef-owner operational feature was changed.

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
- P33 owns the current supported active-cart Home card quantity/reconciliation behavior on that same Home route.
- P34 owns the exact supported nearby-kitchen discovery transport/query/cache boundary for the Customer Chefs experience.
- P35 owns the current supported Customer Chefs empty-cart discovery presentation, loaded-result search, lifecycle/pagination presentation, and connection of the real Chefs tab root to P34 data.

### Later-phase boundaries

- **P36** owns the Discover Home Chefs active-cart variant and was not started.
- **P37** owns full search-query orchestration when exact search contracts exist.
- **P38** owns the dedicated Filter and Sort experience.
- **P42/P43** own the customer-facing public kitchen-profile contract/UI and the real kitchen-profile destination required for full P35 card-navigation acceptance.
- Later Customer dish/favorite/notification routes remain owned by their phases in `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination; this remains the blocker for P33's functional View Cart action.
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
  - kitchen summary: `id`, names/description, area/city/state, exact kitchen coordinates, `distanceMeters`, `activeMenuItemCount`
  - backend includes only ACTIVE geocoded kitchens within radius that have at least one qualifying ACTIVE/available menu item.

Accepted customer-location dependency:

- existing saved-address response supplies `id`, `addressLabel`, `latitude`, and `longitude` for the shared browsing-location state.

Accepted cart dependencies:

- canonical P28 cart snapshot including cart lines and server food subtotal,
- P30 add-item transport/mutation,
- P30 set-quantity transport/mutation,
- P30 remove-line transport/mutation,
- line mutation pending/error metadata.

No backend/APIM contract was added or changed by P35.

Not accepted because no exact current-branch contract or registered product route exists:

- Home aggregation URL,
- cuisine taxonomy URL/model,
- discovery `category` query parameter,
- discovery `cuisine` query parameter,
- cuisine response field,
- recommendation aggregation URL/model,
- favorite API/domain contract,
- nearby-kitchen delivery-serviceability decision,
- nearby-kitchen delivery ETA,
- nearby-kitchen rating/review summary,
- public nearby-kitchen verification/media summary,
- nearby-chef server search/filter/sort parameters,
- public Customer kitchen-profile destination before P42/P43,
- current Customer Cart product route/destination before P45/P46.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19–P24 | **DONE** | Accepted auth/session/onboarding/logout implementation evidence. |
| P25–P30 | **DONE** | Accepted Customer shell/header/cart implementation evidence. |
| P31 Home Feed Data Contract and Query Model | **PARTIAL** | Exact nearby/location/pagination/cache subset validated by CI `31243903844`; category/cuisine/full-home contracts missing. |
| P32 Customer Home — Empty Cart | **PARTIAL** | Supported Home empty-cart surface validated by CI `31245957014`; favorite/full-search/server-category/cuisine/recommendation and later product-route actions remain blocked. |
| P33 Customer Home — Active Cart | **PARTIAL** | Same-route cart quantity/add/remove reconciliation validated by CI `31248405375`; functional View Cart remains blocked on the P45/P46-owned Cart destination. |
| P34 Nearby Chef Discovery Contract | **PARTIAL** | Exact nearby-kitchen/location/pagination/query-cache subset validated by CI `31248762726`; authoritative delivery-serviceability and richer guide-required chef-summary contracts are missing. |
| P35 Discover Home Chefs — Empty Cart | **PARTIAL** | Supported real Chefs-root discovery surface validated by CI `31249264023`; full filters/favorites/rich metadata/server search and public profile navigation remain blocked by missing contracts/routes. |
| P36 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P35 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/chef-detail/dish-detail/full-search/notification-center/recommendation acceptance items listed in its evidence,
- P33 visible View Cart/count/total/Cart navigation/inset acceptance until the real Cart destination exists,
- P34 delivery-serviceability/ETA/rating/cuisine/favorite/verification/media/search/filter/sort requirements where no exact backend contract exists,
- P35 cuisine/filter/favorite/rating/ETA/verification/media/server-search/public-profile-navigation requirements blocked by missing current contracts/routes,
- P36 Discover Home Chefs active-cart state,
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
