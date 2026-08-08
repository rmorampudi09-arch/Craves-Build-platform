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
- **P32 — Customer Home — Empty Cart: PARTIAL.** The supported empty-cart Home root, exact nearby feed presentation, Add action, saved-location behavior, loaded-result search/category filtering, pagination, refresh, bottom-nav scroll behavior, and lifecycle states are implemented and CI-validated. Full P32 acceptance remains blocked by missing favorite/full-search/category/cuisine/recommendation contracts and by later-owned product routes.
- **P33 — Customer Home — Active Cart: PARTIAL.** The same Home route reconciles loaded dish cards to the authoritative cart snapshot and exposes real quantity controls. The visible real Cart destination remains later-owned by P45/P46.
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated kitchen-summary mapping, saved-location coordinates, pagination, bounded cache identity, and targeted invalidation are implemented and CI-validated. Full acceptance remains blocked by missing delivery-serviceability and richer kitchen fields/contracts.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** The real Customer Chefs root renders the supported nearby-kitchen discovery surface with saved location, pagination, loaded-result search, refresh, lifecycle states, and scroll-aware bottom navigation. Richer filters/favorite/rating/ETA/verification/media/server-search and the later public Kitchen Profile route remain blocked.
- **P36 — Discover Home Chefs — Active Cart: PARTIAL.** The same Chefs route composes the shared View Cart overlay, canonical cart count/server subtotal, dynamic bottom clearance, and zero-cart restoration. Real Cart navigation and dish-level Add behavior remain later/blocker-owned.
- **P37 — Search Query Orchestration: PARTIAL.** Shared Home/Chefs search-session state, debounce, exact-query cancellation, user/location-scoped query and scroll restoration, active-search pagination, and stale-result protection are implemented and CI-validated. Authoritative server-side dish/chef free-text search remains absent.
- **P38 — Filter and Sort: PARTIAL.** The focused Filter and Sort route, separate draft/applied state, Reset/Apply/discard behavior, user/location scope, focused-route chrome hiding, Home/Chefs entry points, supported loaded-Home diet filtering/price ordering, and fail-closed unsupported controls are implemented and CI-validated. Full server-side filter/sort metadata/parameters remain absent.
- **P39 — Dish Detail Data Contract: PARTIAL.** Exact public Catalog menu-item + kitchen composition, stable backend-ID query ownership, ordered media mapping, current price/availability validation, customer-safe kitchen allowlisting, explicit unsupported capability blockers, and the future favorite-cache reconciliation boundary are implemented and CI-validated. Full P39 scope remains blocked because the current branch has no authoritative cuisine, ingredients, allergens, customer reviews/aggregate rating, or dish-favorite read/mutation contract.

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

- User explicitly authorized exactly the next single phase after P36 while P36 remained correctly recorded as PARTIAL.
- Started from branch head: `06fb86bb6d6d1e3e85e709e2bccaaf35345225da`.
- Validated implementation commit: `1d9e084c8825faab7d2578e481c9fdd4cc6ae865`.
- Evidence commit: `bef00a0a0263c6b2b7a069f4f6c1f7ce9d888deb`.
- Evidence: `docs/mobile-ui-rebuild/P37_SEARCH_QUERY_ORCHESTRATION.md`.
- CI run/job: `31250802472` / `93086759138` — **SUCCESS**.
- Outstanding blockers: no exact current-branch dish/chef server-search route/parameter/model; literal detail/back acceptance depends on later-owned detail routes.

### P38 evidence

- User explicitly authorized exactly the next single phase after P37 while P37 remained correctly recorded as PARTIAL.
- Started from branch head: `1fe4b862a42ffd1e6a28f80c02ae425805cd08fb`.
- Validated implementation commit: `4465618e64908c48e535de7d8fe83cd03a3b9bcd`.
- Evidence commit: `774f292ca1cfe041a98a980af441271ba68a5806`.
- Evidence: `docs/mobile-ui-rebuild/P38_FILTER_AND_SORT.md`.
- CI run/job: `31251797224` / `93089169496` — **SUCCESS**.
- Outstanding blockers: no authoritative cuisine taxonomy/facet IDs, popularity/rating/delivery-time/server-wide sort/filter parameters, result-count preview, or kitchen-level filter fields.

### P39 evidence

- User explicitly authorized exactly the next single phase after P38 while P38 remained correctly recorded as PARTIAL.
- Started from branch head: `11aa9c4226d653bc387e68b61cb418ac3a68e267`.
- Validated implementation commit: `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94`.
- Evidence commit: `af46686d03ea5ded4c7011320ef875f83f862e58`.
- Evidence: `docs/mobile-ui-rebuild/P39_DISH_DETAIL_DATA_CONTRACT.md`.
- CI run/job: `31252552058` / `93091033108` — **SUCCESS**.
- CI gates passed: dependency install, strict TypeScript, ESLint zero-warning gate, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.
- Outstanding blockers: no authoritative cuisine identity/taxonomy on the public item; no ingredients/allergens contract; no customer dish review/aggregate-rating contract; no customer dish favorite read/mutation contract.

**Current executed phase:** **P39 — Dish Detail Data Contract** is recorded **PARTIAL**. The exact available public Catalog detail/media/kitchen/price/availability subset and customer-scoped cache/entity ownership are implemented and CI-validated, while required cuisine/ingredients/allergens/reviews/favorite capabilities have no authoritative current-branch contract and are explicitly blocked rather than fabricated.

**Next phase in sequence:** **P40 — Dish Detail UI and Interactions** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P40. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31252552058`
- Job ID: `93091033108`
- Head SHA: `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94`
- Phase: **P39 — Dish Detail Data Contract**
- Conclusion: **SUCCESS**
- TypeScript: **SUCCESS**
- ESLint: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

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

## 3. P39 Implemented Dish Detail Data Contract Boundary

P39 implements only the contract/model/cache boundary required for Guide Reference 13. It does not implement P40 screen composition.

Implemented behavior:

- Uses exact existing public Catalog routes:
  - `GET /api/v1/catalog/menu-items/{menuItemId}`,
  - `GET /api/v1/catalog/kitchens/{kitchenId}`.
- Validates the menu item from a stable backend UUID; synthetic card/index IDs fail closed.
- Validates the returned item ID against the requested ID and the returned kitchen ID against the item's `kitchenId`.
- Requires the public detail to remain `ACTIVE`, currently available, and positively priced rather than falling back to stale discovery-card price/availability.
- Maps the supported detail fields: name/description/category/food type/current price/currency/serves/preparation/spice/package/thermobox/availability.
- Maps all usable public menu-item image URLs while preserving backend response order.
- Uses an explicit public kitchen allowlist: kitchen ID/name/display name/description/area/city/state only.
- Does not expose kitchen identity ID, phone, email, or private pickup-address fields in the customer Dish Detail model.
- Keeps absent optional backend fields nullable rather than generating replacement production data.
- Exposes explicit contract gaps for cuisine, ingredients, allergens, reviews, and favorite state.
- Adds a customer-scoped TanStack Query entity key using `userId + CUSTOMER + menuItemId`.
- Defines a bounded invalidation helper for a future authoritative favorite mutation so affected detail and same-customer Home dish-list caches can be reconciled together.
- Does not define or call a favorite endpoint because no accepted favorite contract exists.
- Adds tests for route mapping, identity matching, privacy allowlisting, media ordering, nullable behavior, unsupported capability boundaries, stale-price/availability protection, entity keys, and cache invalidation scope.

### P39 acceptance blockers

The current branch has no authoritative contract for:

- cuisine identity/value/taxonomy on public dish detail,
- dish ingredients,
- allergen metadata,
- customer dish reviews or aggregate rating/review count,
- customer dish favorite read/mutation state.

Media is supported by the current public menu-item response and is implemented. No fake cuisine/ingredient/allergen/review/rating/favorite value or endpoint was introduced.

P39 therefore remains **PARTIAL**, not DONE.

---

## 4. P39 Changed Files

Implementation:

- `apps/mobile/src/features/dishDetail/api/dishDetailApi.ts`
- `apps/mobile/src/features/dishDetail/query/dishDetailQueries.ts`

Tests:

- `apps/mobile/src/features/dishDetail/dishDetailApi.test.ts`
- `apps/mobile/src/features/dishDetail/dishDetailQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P39_DISH_DETAIL_DATA_CONTRACT.md`

Ledger:

- `build.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P40 Dish Detail UI/navigation, Cart/Bill Summary UI, checkout/payment, public Kitchen Profile UI, or Chef-owner operational feature was changed.

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
- P32/P33 own the supported Customer Home empty/active-cart presentation behavior on the same Home route.
- P34 owns the exact supported nearby-kitchen discovery transport/query/cache boundary.
- P35/P36 own the supported Customer Chefs empty/active-cart discovery presentation/chrome behavior.
- P37 owns shared Customer discovery-search orchestration.
- P38 owns focused Customer Filter and Sort routing, draft/applied semantics, chrome policy, and supported current-contract filtering boundaries.
- P39 owns the Customer Dish Detail server-data model, exact public Catalog item+kitchen composition, current-price/availability validation, media mapping, private customer entity cache key, and future favorite-cache reconciliation boundary.

### Later-phase boundaries

- **P40** owns Dish Detail UI and interactions and remains **NOT STARTED**.
- P41 owns the full Dish Ingredients screen; its exact data capability is currently blocked by the missing ingredient/allergen contract recorded by P39.
- P42/P43 own the customer-facing public Kitchen Profile contract/UI.
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
  - authoritative paginated response: `DiscoveryDtos.NearbyKitchenDiscoveryResponse`.

Accepted P39 public detail contracts:

- `GET /api/v1/catalog/menu-items/{menuItemId}`
  - authoritative response: `ApiDtos.MenuItemResponse`,
  - public service returns only an `ACTIVE`, available item in an `ACTIVE` kitchen,
  - includes current price/currency and ordered `images` metadata.
- `GET /api/v1/catalog/kitchens/{kitchenId}`
  - authoritative response: `ApiDtos.KitchenProfileResponse`,
  - mobile P39 maps only customer-safe public display/location fields and deliberately excludes identity/contact/private pickup-address fields.

Accepted customer-location/cart dependencies remain unchanged from prior phases.

Not accepted because no exact current-branch contract or registered product capability exists:

- dedicated dish/chef free-text server-search route/model,
- Home aggregation URL/model,
- cuisine taxonomy URL/model or cuisine field on public dish detail,
- discovery server-wide category/cuisine/sort/diet/filter parameters,
- filter result-count preview contract,
- recommendation aggregation URL/model,
- dish ingredients contract,
- dish allergen contract,
- customer dish review/aggregate-rating contract,
- customer dish favorite read/mutation contract,
- nearby-kitchen final delivery-serviceability/ETA/rating/review/cuisine/favorite/verification/media/filter/sort fields,
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
| P32 Customer Home — Empty Cart | **PARTIAL** | Supported Home surface validated by CI `31245957014`; richer contracts/later routes remain blocked. |
| P33 Customer Home — Active Cart | **PARTIAL** | Same-route cart quantity reconciliation validated by CI `31248405375`; real Cart destination remains later-owned. |
| P34 Nearby Chef Discovery Contract | **PARTIAL** | Exact nearby-kitchen subset validated by CI `31248762726`; richer/serviceability contracts missing. |
| P35 Discover Home Chefs — Empty Cart | **PARTIAL** | Supported Chefs-root discovery surface validated by CI `31249264023`; richer filters/profile route remain blocked. |
| P36 Discover Home Chefs — Active Cart | **PARTIAL** | Shared active-cart behavior validated by CI `31249712277`; real Cart and dish Add requirements remain blocked. |
| P37 Search Query Orchestration | **PARTIAL** | Debounce/cancellation/scoped query+scroll restoration/pagination validated by CI `31250802472`; exact server search contract remains unavailable. |
| P38 Filter and Sort | **PARTIAL** | Focused route/draft-applied semantics/current-response supported filtering validated by CI `31251797224`; full server filter/sort contracts missing. |
| P39 Dish Detail Data Contract | **PARTIAL** | Exact public Catalog detail/media/kitchen/current-price/cache boundary validated by CI `31252552058`; cuisine/ingredients/allergens/reviews/favorite contracts missing. |
| P40 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P39 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/full-search/notification/recommendation acceptance items listed in its evidence,
- P33/P36 real `View Cart -> Cart` navigation until P45/P46 provide the destination,
- P34/P35 richer chef discovery requirements blocked by missing contracts,
- P37 real server-wide dish/chef free-text search,
- P38 server-wide cuisine/popularity/rating/delivery-time/price/diet filter/sort coverage and result-count preview,
- P39 cuisine/ingredients/allergens/reviews/favorite capabilities blocked by missing contracts,
- **P40 Dish Detail UI and Interactions**, which has not started,
- P41 Dish Ingredients UI/data completion,
- customer-facing public Kitchen Profile implementation,
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
