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

**Current executed phase:** **P32 — Customer Home — Empty Cart** is recorded **PARTIAL** because explicit acceptance actions still depend on missing contracts/later product routes.

**Next phase in sequence:** **P33 — Customer Home — Active Cart** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P33. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31245957014`
- Job ID: `93074471641`
- Head SHA: `9227a56fb8caf3213d3900bed9e3b4eb7514f543`
- Phase: **P32 — Customer Home — Empty Cart**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node `22.13.0` setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero warnings,
5. Jest including P32 presentation coverage and prior regressions,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P32 Implemented Customer Home Boundary

P32 uses Reference 05 — Customer Home — Empty Cart — only within contracts and routes that already exist.

Implemented behavior:

- `CustomerHomeRoot` now renders the real P32 `CustomerHomeScreen` instead of the temporary account-status surface.
- Chefs, Orders, and Profile tab roots remain untouched for their owning phases.
- Shared P27 location header, notification badge state, and saved-location selector are reused.
- Shared P26 bottom-nav hide/reveal is driven by the Home list scroll offset.
- Home data uses only the P31 `GET /api/v1/discovery/menu-items` adapter with exact `latitude`, `longitude`, `radiusMeters`, `page`, and `size` parameters.
- Only backend-returned active/available nearby menu items become product data; no hardcoded production dishes, chefs, cuisines, banners, or recommendations were added.
- Debounced search filters the already-loaded authoritative nearby result set only.
- Category chips are derived only from categories present in already-loaded nearby results and filter that loaded set only; P32 does not pretend this is server-side category search.
- Add uses the existing P30 `addCartItem({menuItemId, quantity: 1})` mutation boundary and surfaces mutation failure.
- Pull-to-refresh and backend-driven infinite pagination are connected.
- Home renders backend image/price/currency/kitchen/distance/location/food-type fields with a neutral category fallback when an image URL is absent.
- Initial loading, no-location, empty, filtered-empty, recoverable error, offline/network error, background refresh, next-page loading, and cart-mutation error states are connected.
- P32 adds no View Cart control and implements no P33 active-cart Home composition.

### P32 acceptance blockers

The following are intentionally not fabricated:

- persistent Favorite action — no authoritative favorite API/domain contract exists in the current branch,
- full catalog-search route/contract — local loaded-result search is real but bounded,
- server-side category filtering — P31 proved no accepted `category` query parameter exists,
- cuisine taxonomy/filtering — no authoritative cuisine contract/response field exists,
- Chef-card destination — owning Chef discovery/detail product routes are later phases,
- Dish-card destination — owning Dish Detail route is a later phase,
- Notifications Center destination — P27 supplies badge/read state but no registered product route yet,
- promotional Home aggregation/recommendation sections — no authoritative current-branch aggregation/recommendation contract exists.

Therefore P32 is **PARTIAL**, not DONE.

---

## 4. P32 Changed Files

Implementation:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/features/home/homePresentation.ts`

Tests:

- `apps/mobile/src/features/home/homePresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P32_CUSTOMER_HOME_EMPTY_CART.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P33 active-cart Home behavior, checkout, payment, Chef product screen, Orders product screen, or Profile product screen was changed.

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
- P30 owns exact add/update/remove cart-line transport and reconciliation.
- P31 owns the validated nearby Home-discovery adapter/query model, saved-location coordinate propagation, pagination/cache keys, location invalidation, and fail-closed unsupported category/cuisine server-filter intent.
- P32 owns the current supported Customer Home empty-cart presentation and its connection to those accepted shared foundations.

### Later-phase boundaries

- **P33** owns the Customer Home active-cart variant and was not started.
- Later Customer discovery/chef/dish/search/favorite/notification product routes remain owned by their phases in `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+.

---

## 6. Current Contract Status

Accepted Home discovery contract:

- `GET /api/v1/discovery/menu-items`
  - query: `latitude`, `longitude`, `radiusMeters`, `page`, `size`
  - authoritative paginated response: `DiscoveryDtos.NearbyMenuItemDiscoveryResponse`.

Accepted customer-location dependency:

- existing saved-address response supplies `id`, `addressLabel`, `latitude`, and `longitude` for the shared browsing-location state.

Accepted cart mutation dependency:

- P30 canonical add-item transport/mutation invoked by P32 Add action.

Not accepted because no exact current-branch contract was found:

- Home aggregation URL,
- cuisine taxonomy URL/model,
- discovery `category` query parameter,
- discovery `cuisine` query parameter,
- cuisine response field,
- recommendation aggregation URL/model,
- favorite API/domain contract.

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
| P33 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P32 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/chef-detail/dish-detail/full-search/notification-center/recommendation acceptance items listed above,
- P33 Customer Home — Active Cart,
- later Customer Discovery/Chefs/Orders/Profile product screens,
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
