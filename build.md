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
- **P33 — Customer Home — Active Cart: PARTIAL.** Same Home route reconciles dish cards to the authoritative cart snapshot and real quantity controls. P46 supplies the real Cart destination; remaining P33 blockers stay recorded in its evidence.
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated summary mapping, saved-location coordinates, pagination, cache identity, and invalidation are CI-validated. Final delivery-serviceability and richer kitchen fields remain missing.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** Supported nearby-kitchen discovery surface, location, pagination, loaded-result search, refresh, lifecycle states, and scroll-aware bottom navigation are implemented. Richer rating/ETA/verification/media/favorite/server-search/filter capabilities remain blocked.
- **P36 — Discover Home Chefs — Active Cart: PARTIAL.** Same Chefs route composes authoritative View Cart count/subtotal and zero-cart restoration. P46 supplies real Cart navigation; dish-level Add behavior/richer contract blockers remain as previously recorded.
- **P37 — Search Query Orchestration: PARTIAL.** Debounce, cancellation, user/location-scoped query and scroll restoration, pagination, and stale-result protection are CI-validated. Server-wide dish/chef free-text search remains unavailable.
- **P38 — Filter and Sort: PARTIAL.** Focused route, separate draft/applied state, Reset/Apply/discard behavior, route policy, and currently supportable filtering are CI-validated. Full server-side filter/sort metadata and parameters remain unavailable.
- **P39 — Dish Detail Data Contract: PARTIAL.** Exact public Catalog item+kitchen composition, current price/availability, media mapping, customer-safe kitchen allowlist, stable cache identity, and future favorite reconciliation boundary are CI-validated. Cuisine/ingredients/allergens/reviews/favorite contracts remain missing.
- **P40 — Dish Detail UI and Interactions: PARTIAL.** Typed route/UI, gallery/share, supported facts, sticky cart actions, current-detail revalidation, cart reconciliation, lifecycle states, and source-position back restoration are CI-validated. Favorite/ingredient/review data and dedicated Buy Now intent remain missing.
- **P41 — Dish Ingredients: PARTIAL.** Typed child route, Dish Detail entry, immersive chrome, state-preserving back behavior, detail-query reuse, lifecycle states, and explicit ingredient/allergen fail-closed capability gate are CI-validated. Authoritative ingredient/allergen/dietary-warning payloads remain missing.
- **P42 — Customer-Facing Kitchen Profile Contract: PARTIAL.** Exact current public active-kitchen and sellable-menu compatibility routes, customer-safe profile allowlisting, supported menu-summary/media mapping, stable customer+kitchen query ownership, and future favorite-cache reconciliation boundary are implemented and CI-validated. Verification, rating/reviews, order-count, final serviceability/ETA, kitchen-favorite, featured/top-dish ranking, kitchen hero/profile media, and paginated public kitchen-menu contracts remain absent.
- **P43 — Customer-Facing Kitchen Profile UI: PARTIAL.** Typed immersive profile route, Chef Discovery → profile navigation, supported Reference 15 composition, public identity/location/tenure/about presentation, bounded non-ranked menu preview, real Dish Detail opening, real shared-cart Add/quantity reconciliation with pre-mutation profile revalidation, lifecycle states, pull-to-refresh, and profile scroll restoration are implemented and CI-validated. P44 supplies the real complete-menu destination, but P43 remains blocked by the missing P42 verification/rating/order/serviceability/favorite/featured/media contracts.
- **P44 — Kitchen All Dishes: PARTIAL.** Typed immersive `CustomerKitchenDishes` route, real Kitchen Profile View all navigation, virtualized complete current-contract menu rendering, authoritative category filtering, Dish Detail opening, shared-cart Add/quantity reconciliation with pre-mutation menu revalidation, lifecycle states, pull-to-refresh, and list scroll/category preservation are implemented and CI-validated. Full Reference 16 acceptance remains blocked by the non-paginated public menu contract, missing rating/favorite/final-serviceability fields, and deferred physical-device/reference certification.
- **P45 — Cart Screen Data and Pricing Model: PARTIAL.** The Cart screen has an explicit data/pricing composition model over the authoritative shared cart: exact cart items and server food subtotal are reused, unsupported pricing/address/ETA/coupon fields are marked unavailable instead of calculated, quantity targets map safely to update/remove/invalid, and checkout fails closed unless explicit server eligibility evidence exists. Full acceptance remains blocked because the current cart contract has no pre-checkout bill breakdown/quote, coupon result, delivery-address summary, ETA, or checkout-eligibility payload.
- **P46 — Cart and Bill Summary UI: PARTIAL.** Typed `CustomerCart` is registered in all customer tab stacks; Home/Chefs View Cart opens it; grouped-kitchen virtualized lines, authoritative prices, quantity/remove mutations, pull-to-refresh, empty/error states, scroll-aware bottom navigation, fail-closed address/ETA/offers, expandable bill details, server food subtotal, and sticky checkout area are implemented and CI-validated. Full acceptance remains blocked by missing complete pre-checkout pricing, commerce address/ETA, coupon result/application, explicit checkout eligibility, cart-line media for exact reference fidelity, and deferred physical-device/reference certification.
- **P47 — Address Selection for Commerce: PARTIAL.** Cart-origin saved-address selection now reuses the exact authenticated saved-address contract/query, promotes the selected saved-address ID into the cart commerce dependency, keeps shared browsing location synchronized, preserves the existing Cart/tab origin, and marks the delivery quote `STALE` when the address changes. Full acceptance remains blocked because the repository has no exact pre-checkout serviceability/fee/ETA quote/reprice contract and the rebuild does not yet have the later Checkout origin route.

**Current executed phase:** **P47 — Address Selection for Commerce** is **PARTIAL**. Every safe/supportable P47 behavior available through current authoritative contracts is implemented and passed the required mobile CI. Missing serviceability/fee/ETA orchestration is explicitly not fabricated.

**Next phase in sequence:** **P48 — Delivery Quote/Reprice Orchestration** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P48. Wait for explicit user direction.

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
| P45 | **PARTIAL** | `f4e71b370c1607e8df6572d0634dc5282da515f0` | `P45_CART_SCREEN_DATA_AND_PRICING_MODEL.md` | `31258338717` / `93105128626` |
| P46 | **PARTIAL** | `8de414d1b70635433b4ac9f7f1164da0c29a6790` | `P46_CART_AND_BILL_SUMMARY_UI.md` | `31259171300` / `93107162275` |
| P47 | **PARTIAL** | `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41` | `P47_ADDRESS_SELECTION_FOR_COMMERCE.md` | `31260111878` / `93109503409` |
| P48 onward | **NOT STARTED / not accepted** | — | — | — |

### P47 evidence commits

- User authorized exactly one next phase after P46 while P46 remained correctly recorded as PARTIAL.
- Started from branch head: `02938b1286d8207d00b1af71e393e13a5c5bdecb`.
- Address-selection transition commit: `e90e7ab050501c5de7f1f1896ffd51aeba33d23e`.
- Focused transition-test commit: `f148f7a947f0c4f01a26fb151e272566a258fe94`.
- Validated commerce-selector integration commit: `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41`.
- Evidence commit: `466dd7355e5824be3f970182684447551106f7ff`.
- Evidence: `docs/mobile-ui-rebuild/P47_ADDRESS_SELECTION_FOR_COMMERCE.md`.
- Final implementation CI run/job: `31260111878` / `93109503409` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31260111878`
- Job ID: `93109503409`
- Head SHA: `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41`
- Phase: **P47 — Address Selection for Commerce**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P47 Implemented Boundary

### Exact saved-address contract reuse

P47 reuses the existing authenticated saved-address query and parser backed by:

```text
GET /api/v1/customer/addresses
```

Authoritative sources audited:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/CustomerProfileController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/README.md`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`

No duplicate address cache, new transport wrapper, guessed response field, or identity/private field exposure was introduced.

### Cart-origin commerce selection

The existing `CustomerLocationSelector` remains the shared saved-location selector but now recognizes `CustomerCart` as a commerce origin.

From Cart it:

- presents delivery-address-specific copy;
- uses the Cart address dependency for selection state;
- keeps the established shared browsing location synchronized through the existing selector hook;
- promotes the selected authoritative saved-address ID into `cart.dependencies.address`;
- preserves the existing Cart screen/tab stack rather than opening or duplicating another Cart instance;
- closes the selector back onto the same Cart origin.

### Quote dependency invalidation

`resolveCartAddressSelection` owns the P47 domain transition. When the customer selects a different saved address:

- the selected address dependency becomes current;
- the existing delivery-quote dependency becomes `STALE`;
- the same-address selection leaves the delivery-quote status unchanged.

This ensures location-dependent Cart state is invalidated without pretending serviceability, fee, ETA, tax, or total was recalculated.

### Focused tests

`apps/mobile/src/features/cart/cartAddressSelection.test.ts` verifies:

- changed address -> quote becomes `STALE`;
- same address -> quote state is preserved;
- first commerce address selection -> quote becomes `STALE`.

---

## 5. P47 Acceptance Blockers

Full P47 acceptance requires an address change to refresh delivery serviceability, fee, and ETA. The exact authoritative contract required for that is not currently present in the repository.

Audited current Order Service source:

```text
POST /api/v1/cart/validate
```

`services/order-service/src/main/java/in/craves/order/web/CartController.java` shows that this route accepts no delivery-address input and returns the current Cart response; it is not a delivery quote/reprice API. Repository search found no exact supported `/api/v1/checkout/quote` implementation, and current Order Service documentation records delivery serviceability/pricing as outside the implemented boundary.

P47 therefore does **not**:

- invent a quote/reprice endpoint,
- infer serviceability from saved-address distance,
- locally calculate delivery fee or ETA,
- call checkout creation as a quote,
- fabricate a successful commerce-address validation.

P48 explicitly owns exact delivery quote/reprice orchestration and remains not started.

The later Checkout mobile route is also not yet implemented, so P47 certifies the supported Cart-origin selection only. Physical-device/reference-image certification remains deferred under the implementation-phase policy.

Because the required server-owned quote/serviceability capability is absent, P47 is **PARTIAL**, not DONE.

---

## 6. P47 Changed Files

Implementation/test:

- `apps/mobile/src/features/cart/domain/cartAddressSelection.ts`
- `apps/mobile/src/features/cart/cartAddressSelection.test.ts`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P47_ADDRESS_SELECTION_FOR_COMMERCE.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, checkout/payment service, or Android native build configuration was changed.

---

## 7. Architecture Ownership After P47

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations and mutation reconciliation.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described by their evidence records.
- P39–P41 remain authoritative for Customer Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for supported customer-facing Kitchen Profile and Kitchen All Dishes contract/UI boundaries.
- P45 remains authoritative for Cart-screen data/pricing capability composition and fail-closed checkout evidence.
- P46 remains authoritative for the supported Cart/bill-summary UI and Cart route.
- **P47 owns Cart-origin saved delivery-address selection, promotion of the exact saved-address ID into the Cart commerce dependency, and address-change invalidation of the delivery-quote dependency.**
- **P48 — Delivery Quote/Reprice Orchestration has not started.**
- Later checkout/payment/order/account/Chef phases remain not started unless an earlier evidence record explicitly says otherwise.

---

## 8. Explicitly Not Complete After P47

Do not describe any of the following as complete:

- outstanding blockers recorded for P31–P46;
- P47 full serviceability/fee/ETA refresh acceptance;
- Checkout-origin address selection;
- **P48 — Delivery Quote/Reprice Orchestration**;
- checkout/payment end-to-end flow;
- Chef operational/product screens;
- live APIM/device runtime certification unless a later evidence record explicitly says so;
- full lifecycle/accessibility/performance/security audits;
- final visual certification of all 52 references;
- final Android APK/AAB.

---

## 9. Required Handoff State

```text
Current branch: mobile-ui-rebuild-from-scratch
Current implemented phase: P47 — PARTIAL
Validated implementation SHA: 921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41
CI: 31260111878 / 93109503409 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P47_ADDRESS_SELECTION_FOR_COMMERCE.md
Blockers: exact pre-checkout delivery serviceability/fee/ETA quote/reprice contract; later Checkout origin; physical reference/device certification
Next phase: P48 — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
