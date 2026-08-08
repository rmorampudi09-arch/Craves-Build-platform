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
- **P47 — Address Selection for Commerce: PARTIAL.** Cart-origin saved-address selection reuses the exact authenticated saved-address contract/query, promotes the selected saved-address ID into the cart commerce dependency, keeps shared browsing location synchronized, preserves the existing Cart/tab origin, and invalidates the delivery quote when the address changes. Full acceptance remains blocked because the repository has no exact pre-checkout serviceability/fee/ETA quote/reprice contract and the rebuild does not yet have the later Checkout origin route.
- **P48 — Delivery Quote/Reprice Orchestration: PARTIAL.** A shared quote-invalidation/readiness boundary now centralizes address/cart/coupon dependency semantics, detects quote-relevant authoritative cart snapshot changes without timestamp noise, automatically marks an address-bound quote `STALE` after authoritative cart changes, keeps it `UNRESOLVED` without an address, preserves the last valid cart during background refresh, and fails closed with an explicit contract blocker. Full acceptance remains blocked because no exact address-aware pre-checkout quote/reprice endpoint and response schema exists for serviceability, fee, ETA, taxes, grand total, quote version, or expiry.

**Current executed phase:** **P48 — Delivery Quote/Reprice Orchestration** is **PARTIAL**. Every safe/supportable P48 orchestration behavior available through current authoritative contracts is implemented and passed the required mobile CI. Missing quote/reprice transport is explicitly not fabricated.

**Next phase in sequence:** **P49 — Checkout Session Creation** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P49. Wait for explicit user direction.

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
| P48 | **PARTIAL** | `2bd26edbb687a5baaf104c3d4b73d47978c1b122` | `P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md` | `31260767948` / `93111102045` |
| P49 onward | **NOT STARTED / not accepted** | — | — | — |

### P48 evidence commits

- User authorized exactly one next phase after P47 while P47 remained correctly recorded as PARTIAL.
- Started from branch head: `b29a69b5d6dd37ae268b2d7431312d71e1c50ba5`.
- Quote-orchestration boundary commit: `0acfb33f856f20a2fb52ecb32302746f18551864`.
- Address-invalidation integration commit: `d3cedf512572e02c2ada5003c4ef76294fe8fbd3`.
- Authoritative cart-change invalidation commit: `39650374995a378f2a1a94c0bdff721b60a24dc1`.
- Focused orchestration-test / validated implementation commit: `2bd26edbb687a5baaf104c3d4b73d47978c1b122`.
- Evidence commit: `380cfa9a74f45cfa3e06f666caa803a6e0f37b0b`.
- Evidence: `docs/mobile-ui-rebuild/P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md`.
- Final implementation CI run/job: `31260767948` / `93111102045` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31260767948`
- Job ID: `93111102045`
- Head SHA: `2bd26edbb687a5baaf104c3d4b73d47978c1b122`
- Phase: **P48 — Delivery Quote/Reprice Orchestration**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P48 Implemented Boundary

### Exact contract audit and fail-closed transport boundary

P48 re-audited current Order Service source:

```text
POST /api/v1/cart/validate
POST /api/v1/checkout
```

`POST /api/v1/cart/validate` accepts no delivery-address input and returns the current `CartResponse`, whose totals contain only `foodSubtotal`. It is not an address-aware delivery quote/reprice contract.

`POST /api/v1/checkout` accepts `deliveryAddressId` and returns final checkout pricing, but it creates a checkout resource. It is a side-effecting P49 operation and is not used as a quote probe.

No authoritative `/api/v1/checkout/quote` or equivalent pre-checkout address-aware quote/reprice endpoint/response schema exists in the current repository. P48 therefore records `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE` and does not invent transport.

### Shared dependency invalidation

`apps/mobile/src/features/cart/domain/cartDeliveryQuote.ts` now owns quote invalidation semantics for:

- address changes,
- cart changes,
- future coupon changes.

Without a selected address, the quote dependency is `UNRESOLVED`. With a selected address, a quote-affecting change marks it `STALE`.

P47 address selection delegates to this shared rule, so address and cart flows cannot drift into separate stale-quote semantics.

### Authoritative cart-change detection

`cartSnapshotsRequireQuoteRefresh` compares quote-relevant authoritative server cart state while ignoring transport timestamps. It covers cart/currency identity, line identity/order, quantities, unit prices, line totals, and food subtotal.

`cartSlice.snapshotAccepted` applies this check whenever a server snapshot is accepted. This covers successful add/update/remove responses plus server changes discovered by explicit cart refresh without duplicating invalidation logic in every mutation path.

### Background-state preservation and checkout safety

The existing refresh flow keeps the last valid cart snapshot visible while a read-only cart refresh runs and preserves it after recoverable failure. P48 only changes quote dependency state when a materially changed authoritative snapshot is accepted.

`getCartDeliveryQuoteReadiness` explicitly reports refresh unsupported and checkout usage false until an exact quote/reprice contract exists. A stale, unresolved, error, or legacy/current status alone cannot authorize checkout.

### Focused tests

`apps/mobile/src/features/cart/cartDeliveryQuote.test.ts` verifies:

- no-address invalidation -> `UNRESOLVED`;
- address-bound cart/coupon invalidation -> `STALE`;
- quote-relevant cart changes are detected;
- timestamp-only changes are ignored;
- authoritative snapshot acceptance invalidates a current quote;
- missing quote contract always fails closed for checkout use.

---

## 5. P48 Acceptance Blockers

P48 requires exact quote/reprice endpoint(s) and authoritative refresh of address-dependent delivery serviceability, fee, ETA, taxes/total, quote version/expiry where the contract defines them. Those contracts are not currently present.

P48 therefore does **not**:

- invent `/api/v1/checkout/quote` or another endpoint;
- guess address/cart/coupon request fields;
- reinterpret bodyless cart validation as delivery quoting;
- call checkout creation to obtain a price preview;
- calculate delivery fee, ETA, serviceability, tax, or payable total locally;
- permit stale/unresolved quote state to enable checkout.

Because the required server-owned quote/reprice transport and response are absent, P48 is **PARTIAL**, not DONE.

---

## 6. P48 Changed Files

Implementation/test:

- `apps/mobile/src/features/cart/domain/cartDeliveryQuote.ts`
- `apps/mobile/src/features/cart/domain/cartAddressSelection.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`
- `apps/mobile/src/features/cart/cartDeliveryQuote.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, checkout/payment service, or Android native build configuration was changed.

---

## 7. Architecture Ownership After P48

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations and mutation reconciliation.
- P31–P38 remain authoritative for the currently supported discovery/search/filter boundaries described by their evidence records.
- P39–P41 remain authoritative for Customer Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for supported customer-facing Kitchen Profile and Kitchen All Dishes contract/UI boundaries.
- P45 remains authoritative for Cart-screen data/pricing capability composition and fail-closed checkout evidence.
- P46 remains authoritative for the supported Cart/bill-summary UI and Cart route.
- P47 remains authoritative for Cart-origin saved delivery-address selection and promotion of the exact saved-address ID into the Cart dependency.
- **P48 owns delivery-quote dependency invalidation/readiness orchestration for address/cart/future coupon inputs and authoritative cart-change detection.**
- **P49 — Checkout Session Creation has not started.**
- Later checkout/payment/order/account/Chef phases remain not started unless an earlier evidence record explicitly says otherwise.

---

## 8. Explicitly Not Complete After P48

Do not describe any of the following as complete:

- outstanding blockers recorded for P31–P47;
- P48 authoritative quote/reprice network refresh and full serviceability/fee/ETA acceptance;
- Checkout-origin address selection;
- **P49 — Checkout Session Creation**;
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
Current implemented phase: P48 — PARTIAL
Validated implementation SHA: 2bd26edbb687a5baaf104c3d4b73d47978c1b122
CI: 31260767948 / 93111102045 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md
Blockers: exact pre-checkout address-aware delivery quote/reprice endpoint and response for serviceability/fee/ETA/pricing; physical reference/device certification where applicable
Next phase: P49 — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
