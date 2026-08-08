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
- **P40 — Dish Detail UI and Interactions: PARTIAL.** The real typed Dish Detail route, immersive chrome, gallery, share, chef/kitchen facts, description, supported facts, sticky price/cart actions, fresh-detail revalidation before add/increase, price-change interception, cart reconciliation, lifecycle states, and exact stack-back source-position preservation are implemented and CI-validated. Full P40 acceptance remains blocked by the missing favorite contract, missing ingredients/reviews contracts, and absence of an approved dedicated single-dish Buy Now checkout intent.

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
- Outstanding blockers: no exact current-branch dish/chef server-search route/parameter/model; literal detail/back acceptance depended on P40 and is now implemented for the supported Home source.

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
- Outstanding blockers: no authoritative cuisine identity/taxonomy on the public item; no ingredients/allergens contract; no customer dish review/aggregate-rating contract; no customer dish favorite read/mutation contract.

### P40 evidence

- User explicitly authorized exactly the next single phase after P39 while P39 remained correctly recorded as PARTIAL.
- Started from branch head: `179c2db312434714aa540fa0de7380b52b310638`.
- Supporting implementation commit: `91249464e5fc52eab35f40153fcc4425e8f7d9b6`.
- Validated implementation commit: `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb`.
- Evidence commit: `d8526f16ce7042db71e59c1fbf3efbda4670d533`.
- Evidence: `docs/mobile-ui-rebuild/P40_DISH_DETAIL_UI_AND_INTERACTIONS.md`.
- CI run/job: `31253969455` / `93094455601` — **SUCCESS**.
- CI gates passed: dependency install, strict TypeScript, ESLint zero-warning gate, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source guard.
- Outstanding blockers: no favorite read/mutation contract; no ingredients/allergens or reviews/rating contract; no dedicated single-dish Buy Now checkout intent that can operate without consuming the existing cart; public Kitchen Profile navigation remains P42/P43-owned.

**Current executed phase:** **P40 — Dish Detail UI and Interactions** is recorded **PARTIAL**. Every supported current-branch P40 behavior is implemented and CI-validated, while unsupported required behaviors are fail-closed rather than fabricated.

**Next phase in sequence:** **P41 — Dish Ingredients** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P41. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31253969455`
- Job ID: `93094455601`
- Head SHA: `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb`
- Phase: **P40 — Dish Detail UI and Interactions**
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

## 3. P40 Implemented Dish Detail UI and Interaction Boundary

P40 consumes the P39 exact public detail contract and introduces no backend/APIM changes.

Implemented behavior:

- Adds typed `CustomerDishDetail` routes to the Home/Chefs customer stacks while only wiring currently supported Home dish-card entry.
- Opens Dish Detail from Home dish image/title using the stable backend `menuItemId`.
- Keeps Dish Detail immersive by hiding bottom navigation and shared cart chrome while focused.
- Uses native-stack back so the mounted source Home list returns at its exact prior position with existing search/filter state intact.
- Renders ordered public media as a horizontally paged gallery with active thumbnail selection and a no-media fallback.
- Implements native Share using authoritative dish/kitchen names.
- Renders customer-safe kitchen display information from the P39 allowlist only.
- Renders supported preparation, serves, spice and package facts and expandable description.
- Renders explicit unsupported ingredient/allergen and review states instead of fake values.
- Implements pull refresh plus loading, invalid-ID, session-required, offline, recoverable error and stale-data feedback.
- Implements a sticky current-price action area with Add to Cart and in-cart quantity controls.
- Re-fetches authoritative P39 detail immediately before Add/quantity increase, rejects identity drift, and surfaces a new price for customer review before mutation.
- Reconciles the authoritative P30 cart mutation response and surfaces a server price change if it changes again between detail refresh and cart mutation.
- Does not invent a same-kitchen-only rule: current order-service checkout intentionally supports a cart containing multiple kitchens and groups orders by kitchen.
- Keeps favorite fail-closed because no server favorite contract exists.
- Keeps Buy Now fail-closed because the only current checkout initiation converts the full existing cart; no dedicated single-dish checkout intent exists.

### P40 acceptance blockers

The current branch has no authoritative contract for:

- customer dish favorite read/mutation state,
- dish ingredients and allergens,
- customer reviews/aggregate rating/review count,
- an approved dedicated single-dish Buy Now checkout intent that does not consume/corrupt the existing cart.

The customer public Kitchen Profile route is later-owned by P42/P43 and was not pre-implemented.

P40 therefore remains **PARTIAL**, not DONE.

---

## 4. P40 Changed Files

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

Evidence:

- `docs/mobile-ui-rebuild/P40_DISH_DETAIL_UI_AND_INTERACTIONS.md`

Ledger:

- `build.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P41 Dish Ingredients screen, public Kitchen Profile UI, Cart/Bill Summary UI, checkout/payment UI, or Chef-owner operational feature was changed.

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
- P40 owns the supported Dish Detail route/UI, source-position back behavior, gallery/share/detail presentation, sticky cart actions and pre-mutation detail revalidation boundary.

### Later-phase boundaries

- **P41** owns the full Dish Ingredients screen; its exact data capability remains blocked by the missing ingredient/allergen contract recorded by P39/P40.
- P42/P43 own the customer-facing public Kitchen Profile contract/UI.
- Later Customer favorite/notification routes remain owned by their phases in `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+; P40 did not pre-implement those screens.

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

Accepted P39/P40 public detail contracts:

- `GET /api/v1/catalog/menu-items/{menuItemId}`
  - authoritative response: `ApiDtos.MenuItemResponse`,
  - public service returns only an `ACTIVE`, available item in an `ACTIVE` kitchen,
  - includes current price/currency and ordered `images` metadata.
- `GET /api/v1/catalog/kitchens/{kitchenId}`
  - authoritative response: `ApiDtos.KitchenProfileResponse`,
  - mobile maps only customer-safe public display/location fields and deliberately excludes identity/contact/private pickup-address fields.

Accepted cart mutation contracts used by P40:

- `POST /api/v1/cart/items` with `{menuItemId, quantity}`,
- `PUT /api/v1/cart/items/{cartItemId}` with `{quantity}`,
- `DELETE /api/v1/cart/items/{cartItemId}`.

Existing checkout contract observed but **not accepted as P40 Buy Now**:

- `POST /api/v1/checkout` with `CheckoutRequest(deliveryAddressId, note)` validates and converts the customer's full current cart.
- No dedicated single-dish checkout-intent route/model is present in the current branch.

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
- dedicated single-dish Buy Now checkout intent,
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
| P40 Dish Detail UI and Interactions | **PARTIAL** | Supported route/UI/gallery/share/cart revalidation/back behavior validated by CI `31253969455`; favorite/ingredients/reviews/dedicated Buy Now contracts remain blocked. |
| P41 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P40 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/full-search/notification/recommendation acceptance items listed in its evidence,
- P33/P36 real `View Cart -> Cart` navigation until P45/P46 provide the destination,
- P34/P35 richer chef discovery requirements blocked by missing contracts,
- P37 real server-wide dish/chef free-text search,
- P38 server-wide cuisine/popularity/rating/delivery-time/price/diet filter/sort coverage and result-count preview,
- P39 cuisine/ingredients/allergens/reviews/favorite capabilities blocked by missing contracts,
- P40 server-backed favorite, real ingredient/review previews, dedicated Buy Now checkout intent, or later-owned Kitchen Profile navigation,
- **P41 Dish Ingredients**, which has not started,
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
