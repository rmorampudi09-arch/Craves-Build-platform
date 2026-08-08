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

**Current executed phase:** **P34 — Nearby Chef Discovery Contract** is recorded **PARTIAL** because the exact existing nearby-kitchen contract and query/cache boundary are implemented and validated, while the serviceability portion of P34 cannot be completed without an authoritative backend/APIM contract.

**Next phase in sequence:** **P35 — Discover Home Chefs — Empty Cart** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P35. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31248762726`
- Job ID: `93081608217`
- Head SHA: `02b17243ff9845825068d3dae4b01c05f5e3ac72`
- Phase: **P34 — Nearby Chef Discovery Contract**
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

## 3. P34 Implemented Nearby Chef Discovery Boundary

P34 uses References 07 and 08 only to determine the required Discover Home Chefs data needs. It does not begin P35/P36 presentation work.

Implemented behavior:

- Added a dedicated Customer nearby-chef discovery transport over the exact existing Catalog route `GET /api/v1/discovery/kitchens`.
- Sends only `latitude`, `longitude`, `radiusMeters`, `page`, and `size`; no guide-only query parameter is invented.
- Validates latitude/longitude, configured discovery radius ceiling, page, and page-size bounds before transport.
- Zod-validates the exact `NearbyKitchenDiscoveryResponse`/`NearbyKitchenSummaryResponse` shape.
- Rejects stale/mismatched response context when returned location, radius, page, or size differs from the request.
- Preserves backend-provided distance and active-menu-item count as server-owned values.
- Uses the established shared HTTP client and request dedupe behavior.
- Added an infinite-query model using the authenticated CUSTOMER identity and existing saved browsing location.
- Cache identity includes saved-address ID plus exact latitude/longitude, radius, and page size so coordinate changes cannot reuse stale nearby results.
- Pagination trusts backend `hasNext`/page metadata.
- Added targeted nearby-chef discovery invalidation without invalidating unrelated private query domains.
- Added focused transport/query tests, including proof that rating, ETA, and favorite fields are not fabricated into the accepted response.

### P34 contract blocker

Current backend/APIM evidence defines nearby radius filtering and only returns ACTIVE geocoded kitchens having at least one ACTIVE/available sellable menu item. That is useful availability filtering, but it is not an authoritative delivery-serviceability or ETA decision.

The existing APIM discovery handover explicitly excludes delivery serviceability and related delivery/provider/pricing-zone rules. Therefore P34 does not derive serviceability from distance, invent an ETA, or add fake rating/cuisine/favorite/verification/media/search/filter/sort fields.

Therefore P34 is **PARTIAL**, not DONE.

---

## 4. P34 Changed Files

Implementation:

- `apps/mobile/src/features/chefDiscovery/api/nearbyChefDiscoveryApi.ts`
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts`

Tests:

- `apps/mobile/src/features/chefDiscovery/nearbyChefDiscoveryApi.test.ts`
- `apps/mobile/src/features/chefDiscovery/nearbyChefDiscoveryQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P35/P36 Discover Home Chefs UI, Cart/Checkout, or later Chef operational behavior was changed.

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

### Later-phase boundaries

- **P35** owns Discover Home Chefs — Empty Cart presentation and was not started.
- **P36** owns the active-cart variant and was not started.
- Later Customer chef-detail/dish/search/favorite/notification routes remain owned by their phases in `phases.md`.
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

No backend/APIM contract was added or changed by P34.

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
- nearby-chef search/filter/sort parameters,
- current Customer Cart product route/destination before its P45/P46 owning phases.

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
| P35 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P34 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/chef-detail/dish-detail/full-search/notification-center/recommendation acceptance items listed in its evidence,
- P33 visible View Cart/count/total/Cart navigation/inset acceptance until the real Cart destination exists,
- P34 delivery-serviceability/ETA/rating/cuisine/favorite/verification/media/search/filter/sort requirements where no exact backend contract exists,
- P35/P36 Discover Home Chefs UI states,
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
