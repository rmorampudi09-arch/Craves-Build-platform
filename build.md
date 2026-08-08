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
- **P42 — Customer-Facing Kitchen Profile Contract: PARTIAL.** Exact current public active-kitchen and sellable-menu compatibility routes, customer-safe profile allowlisting, supported menu-summary/media mapping, stable customer+kitchen query ownership, and future favorite-cache reconciliation boundary are implemented and CI-validated. Full P42 acceptance remains blocked because there is no authoritative public verification, rating/reviews, order-count, final delivery-serviceability/ETA, kitchen-favorite, featured/top-dish ranking, kitchen hero/profile media, or paginated public kitchen-menu contract.

**Current executed phase:** **P42 — Customer-Facing Kitchen Profile Contract** is **PARTIAL**. Every safe/supportable current-branch P42 contract/query/cache boundary implemented in this phase passed CI. Missing guide capabilities are recorded as explicit contract gaps rather than fabricated.

**Next phase in sequence:** **P43 — Customer-Facing Kitchen Profile UI** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P43. Wait for explicit user direction.

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
| P43 onward | **NOT STARTED / not accepted** | — | — | — |

### P42 evidence commits

- User authorized exactly the next single phase after P41 while P41 remained correctly recorded as PARTIAL.
- Started from branch head: `68314bffe0db36d720dd5892dcd088da72fe5eb8`.
- Validated implementation commit: `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d`.
- Evidence commit: `4f3e5b221192463ffaab02bbefbcfb873dfe1d2f`.
- Evidence: `docs/mobile-ui-rebuild/P42_CUSTOMER_FACING_KITCHEN_PROFILE_CONTRACT.md`.
- CI run/job: `31255118989` / `93097257711` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31255118989`
- Job ID: `93097257711`
- Head SHA: `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d`
- Phase: **P42 — Customer-Facing Kitchen Profile Contract**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P42 Implemented Contract Boundary

### Exact public contracts used

Authoritative backend sources:

- `services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java`
- `services/catalog-service/src/main/java/in/craves/catalog/web/ApiDtos.java`
- `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java`
- `services/catalog-service/src/main/java/in/craves/catalog/security/SecurityConfig.java`
- `services/catalog-service/README.md`

Exact paths:

```http
GET /api/v1/catalog/kitchens/{kitchenId}
GET /api/v1/catalog/kitchens/{kitchenId}/menu-items
```

Contract facts:

- public kitchen detail uses `ApiDtos.KitchenProfileResponse`,
- service returns the public kitchen only when status is `ACTIVE`,
- public kitchen menu uses `List<ApiDtos.MenuItemResponse>`,
- service returns only `ACTIVE` and currently available items,
- backend menu ordering is `category, item_name`,
- the current public kitchen-menu compatibility route is unpaginated,
- `/api/v1/catalog/**` is public in the current Catalog Service security boundary.

### Customer-safe profile mapping

The raw backend kitchen response contains owner/contact/pickup-address data. P42 exposes only the customer-facing allowlist:

- kitchen ID,
- kitchen name,
- display name,
- public description/biography,
- area/city/state,
- `createdAt` as the available factual joined/tenure timestamp.

The mobile customer model deliberately excludes raw:

- owner `identityId`,
- phone/email,
- pickup address lines/landmark/postal code,
- exact kitchen latitude/longitude,
- owner-oriented update metadata.

### Supported menu-summary mapping

P42 validates and maps the current sellable menu response for supported summary data:

- stable dish ID,
- item name/description/category/food type,
- current price/currency,
- serves/preparation/spice fields where present,
- usable HTTPS public item images in backend-returned order.

It verifies menu-item-to-kitchen identity and image-to-menu-item identity and fails closed on contradictory/non-sellable rows.

The existing category/name ordering is **not** presented as “Top Dishes” or popularity ranking.

### Query/cache ownership

P42 adds one customer-private TanStack Query entity key scoped by authenticated customer identity + stable backend kitchen UUID. It does not copy the profile into a second global server-state store.

A typed future kitchen-favorite cache boundary exists so an eventual authoritative favorite mutation can reconcile only:

- the affected customer's exact kitchen profile, and
- that same customer's nearby-chef discovery caches.

No favorite transport is invented or invoked.

---

## 5. P42 Acceptance Blockers

The current branch has no authoritative customer-facing contract for:

- public kitchen verification/trust badge/status,
- kitchen rating, aggregate review, or review count,
- customer-facing fulfilled order count,
- final delivery serviceability or ETA for the selected customer address,
- kitchen favorite read/mutation,
- featured/Top Dishes ranking,
- kitchen/chef hero media or public profile portrait,
- paginated public kitchen menu suitable for the later complete-menu experience.

Nearby discovery radius/distance remains browsing data only and is not treated as final delivery eligibility.

Because Reference 15 requires several of these capabilities, P42 remains **PARTIAL**, not DONE. No fake “verified” state, static rating, invented order count, guessed ETA, fake favorite state, or made-up top-dish ranking is used.

---

## 6. P42 Changed Files

Implementation:

- `apps/mobile/src/features/kitchenProfile/api/kitchenProfileApi.ts`
- `apps/mobile/src/features/kitchenProfile/query/kitchenProfileQueries.ts`

Tests:

- `apps/mobile/src/features/kitchenProfile/kitchenProfileApi.test.ts`
- `apps/mobile/src/features/kitchenProfile/kitchenProfileQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P42_CUSTOMER_FACING_KITCHEN_PROFILE_CONTRACT.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P43 UI/navigation implementation, P44 All Dishes UI, checkout/payment, or Chef-owner operational feature was changed.

---

## 7. Architecture Ownership After P42

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/cart foundations.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described in their evidence.
- P39 owns Customer Dish Detail server-data/cache boundaries.
- P40 owns supported Dish Detail UI/cart-revalidation/back behavior.
- P41 owns the Dish Ingredients child-route/lifecycle/capability boundary.
- **P42 owns the customer-facing public Kitchen Profile data contract/query/cache boundary.**
- **P43 owns the Customer-Facing Kitchen Profile UI/interactions and has not started.**
- P44 owns Kitchen All Dishes UI/complete-menu behavior and has not started.
- P45/P46 own Cart screen data/pricing and Cart/Bill Summary UI.
- Later checkout/payment/order/account/Chef phases remain not started unless their earlier evidence says otherwise.

---

## 8. Explicitly Not Complete After P42

Do not describe any of the following as complete:

- the outstanding blockers recorded for P31–P41,
- P42 verification/rating/review/order-count/serviceability/ETA/favorite/featured-ranking/kitchen-media/paginated-menu capabilities,
- **P43 Customer-Facing Kitchen Profile UI**, including Reference 15 visual fidelity, navigation/actions, lifecycle UI, and device/reference certification,
- P44 Kitchen All Dishes,
- full Customer Cart/Bill Summary,
- checkout/payment end-to-end flow,
- Chef operational/product screens,
- live APIM/device runtime certification unless a later evidence record explicitly says so,
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
