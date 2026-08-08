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
- **P33 — Customer Home — Active Cart: PARTIAL.** Same Home route reconciles dish cards to the authoritative cart snapshot and real quantity controls. P46 now supplies the real Cart destination; remaining P33 blockers stay recorded in its evidence.
- **P34 — Nearby Chef Discovery Contract: PARTIAL.** Exact `GET /api/v1/discovery/kitchens` transport, validated summary mapping, saved-location coordinates, pagination, cache identity, and invalidation are CI-validated. Final delivery-serviceability and richer kitchen fields remain missing.
- **P35 — Discover Home Chefs — Empty Cart: PARTIAL.** Supported nearby-kitchen discovery surface, location, pagination, loaded-result search, refresh, lifecycle states, and scroll-aware bottom navigation are implemented. Richer rating/ETA/verification/media/favorite/server-search/filter capabilities remain blocked.
- **P36 — Discover Home Chefs — Active Cart: PARTIAL.** Same Chefs route composes authoritative View Cart count/subtotal and zero-cart restoration. P46 now supplies real Cart navigation; dish-level Add behavior/richer contract blockers remain as previously recorded.
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

**Current executed phase:** **P46 — Cart and Bill Summary UI** is **PARTIAL**. Every safe/supportable P46 behavior available through current authoritative contracts is implemented and passed the required CI. Missing server-owned commerce capabilities are explicitly unavailable rather than fabricated.

**Next phase in sequence:** **P47 — Address Selection for Commerce** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P47. Wait for explicit user direction.

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
| P47 onward | **NOT STARTED / not accepted** | — | — | — |

### P46 evidence commits

- User authorized exactly one next phase after P45 while P45 remained correctly recorded as PARTIAL.
- Started from branch head: `2acdaca13e0092639ccaf640f0b1f18b03893bfc`.
- Initial implementation commit: `c6c7e2938a24d256eb61e6642baf961a8e3ec6ad`.
- Initial CI run `31259071209` passed TypeScript and stopped at seven `no-void` lint warnings; no type/functional contract failure was reported before the lint gate.
- Validated implementation commit after lint-only correction: `8de414d1b70635433b4ac9f7f1164da0c29a6790`.
- Evidence commit: `28dcdf19b720fef4d3356bf8795b361305a3e42e`.
- Evidence: `docs/mobile-ui-rebuild/P46_CART_AND_BILL_SUMMARY_UI.md`.
- Final CI run/job: `31259171300` / `93107162275` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31259171300`
- Job ID: `93107162275`
- Head SHA: `8de414d1b70635433b4ac9f7f1164da0c29a6790`
- Phase: **P46 — Cart and Bill Summary UI**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P46 Implemented Boundary

### Typed Cart route and source-preserving navigation

P46 registers logical route `CustomerCart` in each customer tab stack. This keeps the originating tab stack alive so Back returns to the source rather than constructing a disconnected transactional demo navigator.

Home now uses a thin route wrapper that composes the existing Home screen with the shared View Cart overlay. Discover Home Chefs now opens the same Cart route. The Cart route itself keeps the customer bottom navigation visible per Reference Image 18 while suppressing the redundant View Cart overlay.

### Authoritative grouped cart UI

`CustomerCartScreen` consumes `selectCartScreenModel` from P45 and the P28–P30 shared cart domain. Lines are grouped by kitchen in stable server order and rendered through a virtualized `SectionList`.

Visible supported line facts are authoritative cart-response fields: item/kitchen names, unit price, quantity, and line total. The current cart response does not contain dish media, so P46 uses a branded deterministic text fallback rather than inventing an image contract.

### Real quantity/remove behavior

Increment/decrement delegates to P45 quantity-target rules and the existing P30 mutation engine. A target of zero uses the exact remove mutation. Explicit remove and zero-quantity removal require destructive confirmation. Pending line mutations disable their own controls; existing optimistic rollback/reconciliation remains authoritative and failures are surfaced without discarding the last valid cart.

When the final line disappears, the shared item count becomes zero and the global Home/Chefs View Cart overlay hides automatically.

### Refresh, empty, error, and scroll behavior

P46 adds read-only cart refresh over the existing `GET /api/v1/cart` adapter, with duplicate refresh protection. Initial loading, pull-to-refresh, retry/recoverable error, and empty cart states are connected. Existing valid cart data remains usable during recoverable refresh failure when present.

The cart list also uses the shared bottom-navigation hide/reveal scroll controller.

### Bill/address/ETA/offer/checkout fail-closed UI

P45 established that the current server cart contract contains food subtotal but not the complete guide-required pre-checkout bill, selected delivery-address summary, ETA, coupon result, or explicit checkout eligibility.

P46 therefore shows those capabilities accurately without inventing data:

- delivery-address and ETA cards expose their unavailable/current dependency status without fake display values;
- shared browsing-location selection remains functional but is not misrepresented as commerce delivery-address selection;
- Offers & Coupons is present as an unavailable capability rather than a fake Apply interaction;
- Bill details has a real expand/collapse control;
- server food subtotal is displayed;
- delivery/platform/tax/discount/grand-total fields remain explicitly unavailable;
- sticky Proceed to Checkout remains disabled until a complete authoritative bill and explicit eligibility evidence exist.

---

## 5. P46 Acceptance Blockers

Full P46 acceptance remains blocked by the same server-owned commerce contract gaps exposed by P45 plus final visual/device certification:

- server-computed platform fee/tax/delivery fee/grand total before checkout,
- selected commerce delivery-address display/snapshot and exact Cart address-selection result,
- delivery ETA/serviceability quote for Cart,
- coupon application/result and discount amount,
- explicit checkout eligibility/ineligibility evidence,
- cart-line media/image contract if exact Reference 18 imagery requires it,
- physical Android/reference-image certification.

P46 does not derive pricing locally, treat browsing location as checkout address, call side-effecting checkout as a quote, or create fake coupon/checkout behavior.

Because those complete guide interactions cannot be safely implemented from current contracts, P46 is **PARTIAL**, not DONE.

---

## 6. P46 Changed Files

Implementation:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/home/screens/CustomerHomeRouteScreen.tsx`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen.tsx`
- `apps/mobile/src/features/cart/screens/CustomerCartScreen.tsx`
- `apps/mobile/src/features/cart/cartUiModel.ts`
- `apps/mobile/src/features/cart/state/cartRefresh.ts`

Tests:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/features/cart/cartUiModel.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P46_CART_AND_BILL_SUMMARY_UI.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, checkout/payment service, or Android native build configuration was changed.

---

## 7. Architecture Ownership After P46

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations and mutation reconciliation.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described in their evidence.
- P39–P41 remain authoritative for Customer Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for supported customer-facing Kitchen Profile and Kitchen All Dishes contract/UI boundaries.
- **P45 remains authoritative for Cart-screen data/pricing capability composition and fail-closed checkout evidence.**
- **P46 owns the supported Cart/ bill-summary UI, typed CustomerCart route, real Home/Chefs View Cart navigation, grouped cart presentation, line interaction wiring, refresh/lifecycle UI, and the current fail-closed commerce presentation.**
- **P47 — Address Selection for Commerce has not started.**
- Later checkout/payment/order/account/Chef phases remain not started unless an earlier evidence record explicitly says otherwise.

---

## 8. Explicitly Not Complete After P46

Do not describe any of the following as complete:

- the outstanding blockers recorded for P31–P45,
- P46 full server-backed pre-checkout bill/address/ETA/coupon/eligibility/reference-media acceptance,
- **P47 — Address Selection for Commerce**,
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
