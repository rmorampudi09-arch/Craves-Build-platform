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
- **P43 — Customer-Facing Kitchen Profile UI: PARTIAL.** Typed immersive profile route, Chef Discovery → profile navigation, supported Reference 15 composition, public identity/location/tenure/about presentation, bounded non-ranked menu preview, real Dish Detail opening, real shared-cart Add/quantity reconciliation with pre-mutation profile revalidation, lifecycle states, pull-to-refresh, and profile scroll restoration are implemented and CI-validated. P44 supplies the real complete-menu destination, but P43 remains blocked by the missing P42 verification/rating/order/serviceability/favorite/featured/media contracts.
- **P44 — Kitchen All Dishes: PARTIAL.** Typed immersive `CustomerKitchenDishes` route, real Kitchen Profile View all navigation, virtualized complete current-contract menu rendering, authoritative category filtering, Dish Detail opening, shared-cart Add/quantity reconciliation with pre-mutation menu revalidation, lifecycle states, pull-to-refresh, and list scroll/category preservation are implemented and CI-validated. Full Reference 16 acceptance remains blocked by the non-paginated public menu contract, missing rating/favorite/final-serviceability fields, and deferred physical-device/reference certification.
- **P45 — Cart Screen Data and Pricing Model: PARTIAL.** The Cart screen now has an explicit data/pricing composition model over the authoritative shared cart: exact cart items and server food subtotal are reused, unsupported pricing/address/ETA/coupon fields are marked unavailable instead of calculated, quantity targets map safely to update/remove/invalid, and checkout fails closed unless explicit server eligibility evidence exists. Full acceptance remains blocked because the current cart contract has no pre-checkout bill breakdown/quote, coupon result, delivery-address summary, ETA, or checkout-eligibility payload.

**Current executed phase:** **P45 — Cart Screen Data and Pricing Model** is **PARTIAL**. Every safe/supportable current-contract P45 model and interaction rule implemented in this phase passed CI; missing server-owned data is withheld rather than fabricated.

**Next phase in sequence:** **P46 — Cart Screen UI** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P46. Wait for explicit user direction.

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
| P46 onward | **NOT STARTED / not accepted** | — | — | — |

### P45 evidence commits

- User authorized exactly one next phase after P44 while P44 remained correctly recorded as PARTIAL.
- Started from branch head: `ffd215faf7e3ab312e9b201ebab0e6acaba723aa`.
- Validated implementation commit: `f4e71b370c1607e8df6572d0634dc5282da515f0`.
- Evidence commit: `eef45b32747445b5cca863e5c91e4da5195836cc`.
- Evidence: `docs/mobile-ui-rebuild/P45_CART_SCREEN_DATA_AND_PRICING_MODEL.md`.
- CI run/job: `31258338717` / `93105128626` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31258338717`
- Job ID: `93105128626`
- Head SHA: `f4e71b370c1607e8df6572d0634dc5282da515f0`
- Phase: **P45 — Cart Screen Data and Pricing Model**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P45 Implemented Boundary

### Authoritative Cart screen item model

P45 introduces `cartScreenModel.ts` as a composition layer over the existing P28/P30 authoritative cart domain. `CartScreenItem` is the existing validated `CartLine`; P45 does not create a second mutable screen-local representation or recalculate item price/line totals.

The shared selector `selectCartScreenModel` composes the current accepted cart snapshot and dependency states for the future P46 screen.

### Explicit bill-summary fields without local pricing authority

P45 defines fields for food subtotal, platform fee, tax amount, delivery fee, coupon discount, and grand total. The exact current cart contract is:

```http
GET /api/v1/cart
```

`CartResponse.totals` contains only `foodSubtotal` and currency. P45 therefore marks only food subtotal as `CART_RESPONSE`. Platform fee, tax, delivery fee, coupon discount, and grand total are `null` with `SERVER_CONTRACT_UNAVAILABLE`; the bill summary is explicitly incomplete.

P45 does not use admin charge-policy percentages/flats to recreate pricing on-device.

### Address, ETA, coupon and checkout capability boundaries

The existing shared dependency domain can expose address ID/status, coupon status, and delivery-quote status, but no current customer cart response provides the display address summary, ETA, coupon discount result, or explicit checkout eligibility.

P45 keeps those display values unavailable even if a dependency status is `CURRENT`. Checkout is fail-closed: only explicit semantic evidence originating from a future server-owned eligibility contract may enable it. Current selectors have no such authoritative adapter, so checkout remains disabled with `SERVER_ELIGIBILITY_UNAVAILABLE`.

### Quantity update/remove interaction rule

P45 defines the future Cart UI target-quantity mapping without adding P46 UI:

- positive safe integer -> update through the existing P30 quantity mutation,
- zero -> remove through the existing P30 remove mutation,
- negative/fractional/unsafe -> invalid.

This preserves the existing backend rule that cart item updates require quantity >= 1 and avoids sending zero through the update route.

### Side-effecting checkout is not used as a quote endpoint

The backend `POST /api/v1/checkout` requires a delivery address, validates the cart, computes/persists platform fee/tax/delivery/grand total, creates checkout/order records, and clears the cart. It is not used by P45 to populate a Cart preview.

`POST /api/v1/cart/validate` still returns the same limited `CartResponse` and therefore does not close the missing quote/eligibility boundary.

---

## 5. P45 Acceptance Blockers

Full P45 acceptance remains blocked until the backend exposes an authoritative customer pre-checkout contract for the guide-required Cart composition, including as applicable:

- server-computed platform fee/tax/delivery fee/grand total before checkout,
- coupon application/result and discount amount,
- selected delivery-address display/snapshot data suitable for Cart,
- delivery ETA/quote data,
- explicit checkout eligibility/ineligibility.

No exact executable route/response for those capabilities exists on the current branch. P45 does not invent one and does not infer eligibility from cart non-emptiness, a selected address ID, or dependency status.

Physical Cart-screen visual/device certification belongs to P46/later QA and was not performed in this data/model phase.

Because these contract-dependent capabilities remain unavailable, P45 is **PARTIAL**, not DONE.

---

## 6. P45 Changed Files

Implementation:

- `apps/mobile/src/features/cart/domain/cartScreenModel.ts`
- `apps/mobile/src/features/cart/state/cartSelectors.ts`

Tests:

- `apps/mobile/src/features/cart/cartScreenModel.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P45_CART_SCREEN_DATA_AND_PRICING_MODEL.md`

Ledger:

- `build.md`

No P46 Cart UI, backend, APIM, OpenAPI, infrastructure, database, checkout/payment behavior, or Android native build configuration was changed.

---

## 7. Architecture Ownership After P45

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations and mutation reconciliation.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described in their evidence.
- P39–P41 remain authoritative for Customer Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for supported customer-facing Kitchen Profile and Kitchen All Dishes contract/UI boundaries.
- **P45 owns the Cart-screen data composition, explicit pricing-field availability, delivery/coupon/ETA capability representation, quantity target interaction rule, and fail-closed checkout-eligibility model.**
- **P46 owns Cart Screen UI and has not started.**
- Later checkout/payment/order/account/Chef phases remain not started unless their earlier evidence says otherwise.

---

## 8. Explicitly Not Complete After P45

Do not describe any of the following as complete:

- the outstanding blockers recorded for P31–P44,
- P45 server-backed pre-checkout full bill/coupon/address/ETA/eligibility composition,
- **P46 Cart Screen UI**,
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
