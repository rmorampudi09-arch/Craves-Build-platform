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
- **P33 — Customer Home — Active Cart: PARTIAL.** The same Home route now reconciles loaded dish cards to the authoritative cart snapshot, exposes real increment/decrement/remove quantity controls, protects duplicate line mutations, and returns to Add when a line reaches zero. The required visible View Cart/count/total and `View Cart -> Cart` action remain blocked because no Customer Cart product route is registered and P45/P46 own that later destination.

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

**Current executed phase:** **P33 — Customer Home — Active Cart** is recorded **PARTIAL** because the safe cart-quantity/reconciliation subset is complete and validated, while the destination-bound View Cart surface cannot be completed without pre-implementing P45/P46-owned work.

**Next phase in sequence:** **P34 — Nearby Chef Discovery Contract** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P34. Wait for explicit user direction.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31248405375`
- Job ID: `93080699835`
- Head SHA: `bcb25866df664a77c8b83fa50c029f967d72a9be`
- Phase: **P33 — Customer Home — Active Cart**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node `22.13.0` setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero warnings,
5. Jest — **37 suites / 179 tests passed**, including cart mutation/domain and Home regressions,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P33 Implemented Customer Home Active-Cart Boundary

P33 uses Reference 06 only within cart contracts and routes that already exist.

Implemented behavior:

- P33 extends the existing `CustomerHomeScreen`; it does not add a duplicate active-cart Home route or a second cart store.
- Home reads the canonical P28/P30 cart snapshot and mutation registry.
- Loaded nearby dishes are matched to canonical cart lines by `menuItemId`.
- A dish with no current cart line shows the existing real Add action.
- A dish with a positive cart quantity shows a quantity selector instead of Add.
- Increment dispatches the existing P30 `setCartItemQuantity` mutation with the canonical line ID.
- Decrement above one dispatches `setCartItemQuantity` with the next quantity.
- Decrement at one dispatches the existing P30 `removeCartItem` mutation.
- Line-scoped pending mutation state disables the quantity controls and protects repeated taps.
- P30 optimistic cart snapshots provide immediate quantity/removal feedback; P30 rollback restores the previous valid snapshot if the server mutation fails.
- Cart-only mutations do not refetch the Home discovery feed.
- Removing a line to zero causes the same Home dish card to return immediately to Add through authoritative cart-state reconciliation.
- Quantity controls have explicit accessibility labels/states and Android-sized touch targets.
- The Home surface now uses the neutral `customer-home` test ID rather than encoding the P32 empty-cart state into the shared route.

### P33 acceptance blocker

Reference 06 also requires the Espresso Brown View Cart control to show live count/total and open Cart.

The branch currently contains the reusable P29 `SharedViewCartOverlay`, but the Customer route registry/types contain no functional Cart product destination. `phases.md` assigns Cart data/pricing extensions to P45 and Cart/Bill Summary UI/navigation to P46.

The guide, `plan.md`, and `agent.md` prohibit empty handlers, placeholder routes, unreachable UI, and pre-implementing later phases. Therefore P33 deliberately does **not**:

- mount View Cart with a no-op `onOpenCart`,
- invent a Cart route,
- create a placeholder Cart screen,
- pre-implement P45/P46,
- claim View Cart count/total/inset behavior as complete.

Therefore P33 is **PARTIAL**, not DONE.

---

## 4. P33 Changed Files

Implementation:

- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P33_CUSTOMER_HOME_ACTIVE_CART.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, Cart product route/UI, checkout/payment, P34 nearby-chef work, or other later phase was changed.

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

### Later-phase boundaries

- **P34** owns the next Nearby Chef Discovery Contract phase and was not started.
- Later Customer discovery/chef/dish/search/favorite/notification product routes remain owned by their phases in `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination; this is the current blocker for P33's functional View Cart action.
- Checkout/payment remain P47+.

---

## 6. Current Contract Status

Accepted Home discovery contract:

- `GET /api/v1/discovery/menu-items`
  - query: `latitude`, `longitude`, `radiusMeters`, `page`, `size`
  - authoritative paginated response: `DiscoveryDtos.NearbyMenuItemDiscoveryResponse`.

Accepted customer-location dependency:

- existing saved-address response supplies `id`, `addressLabel`, `latitude`, and `longitude` for the shared browsing-location state.

Accepted cart dependencies:

- canonical P28 cart snapshot including cart lines and server food subtotal,
- P30 add-item transport/mutation,
- P30 set-quantity transport/mutation,
- P30 remove-line transport/mutation,
- line mutation pending/error metadata.

No new backend/APIM contract was introduced by P33.

Not accepted because no exact current-branch contract or registered product route exists:

- Home aggregation URL,
- cuisine taxonomy URL/model,
- discovery `category` query parameter,
- discovery `cuisine` query parameter,
- cuisine response field,
- recommendation aggregation URL/model,
- favorite API/domain contract,
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
| P34 onward | **NOT STARTED / not accepted** | No later phase is authorized. |

---

## 8. Explicitly Not Complete After P33 Work

Do not describe any of the following as complete:

- P31 category/cuisine/full-home aggregation mapping,
- P32 favorite/chef-detail/dish-detail/full-search/notification-center/recommendation acceptance items listed in its evidence,
- P33 visible View Cart/count/total/Cart navigation/inset acceptance until the real Cart destination exists,
- P34 Nearby Chef Discovery Contract or any later phase,
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