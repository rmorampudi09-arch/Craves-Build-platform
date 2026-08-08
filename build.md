# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P30 use dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger remains compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00 — Execution Documents and Source Lock: DONE**.
- **P01 — Repository Architecture Inventory: DONE**.
- **P02 — APIM/OpenAPI Contract Inventory: DONE**.
- **P03 — Runtime Configuration and Environment Boundary: DONE**.
- **P04 — Design Token Baseline: DONE**.
- **P05 — Shared Motion and Reduced-Motion Baseline: DONE**.
- **P06 — Shared Interaction Primitives: DONE**.
- **P07 — Shared Screen/Lifecycle Primitives: DONE**.
- **P08 — Query/Store Provider and Cache Rules: DONE**.
- **P09 — Typed HTTP Client Foundation: DONE**.
- **P10 — Session Token Security Foundation: DONE**.
- **P11 — Root Navigation and Typed Route Policy: DONE**.
- **P12 — Role Selection UI and State: DONE**.
- **P13 — Customer Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P14 — Chef Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P15 — Customer Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P16 — Chef Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P17 — OTP Verification, Resend, Expiry, Rate Limit: DONE** at implementation level.
- **P18 — Password Recovery Flow: DONE** at implementation level.
- **P19 — Firebase → CRAVES Session Exchange: DONE** at implementation/static-contract level.
- **P20 — Session Restore and Silent Refresh: DONE** at implementation/static-contract level.
- **P21 — Identity, Role, and Onboarding Resolution: DONE** at implementation/static-contract level.
- **P22 — Customer Registration/Profile Completion: DONE** at implementation/static-contract level.
- **P23 — Chef Application Submission / Status: DONE** at implementation/static-contract level.
- **P24 — Logout, Revoke, and Role-State Cleanup: DONE** at implementation/static-contract level.
- **P25 — Customer Root Shell and Bottom Tabs: DONE** at implementation/static-navigation level.
- **P26 — Customer Bottom-Nav Scroll Hide/Reveal: DONE** at implementation/static-navigation level; final device/reference certification remains later visual QA.
- **P27 — Shared Customer Header/Location/Notification Badge: DONE** at implementation/static-contract level; final device/reference certification remains later visual QA.
- **P28 — Authoritative Cart Domain Skeleton: DONE** at implementation/static-contract level.
- **P29 — Shared View Cart Overlay: DONE** at implementation/static-contract level; final device/reference certification remains later visual QA.
- **P30 — Cart Add/Remove/Quantity Reconciliation: DONE** at implementation/static-contract level.

P30 completion evidence:

- Started from accepted P29 ledger head: `e75ed7f56860026fccccd7ff9a1f3f0218faf2b3`.
- Validated implementation commit: `1e7d8ec460098aaeaf993d5b34129d2c7b8a8f75`.
- Evidence commit: `8ff11cac0bb550d72755e0ff46dda32f0f603c34`.
- Evidence: `docs/mobile-ui-rebuild/P30_CART_ADD_REMOVE_QUANTITY_RECONCILIATION.md`.
- CI run: `31231364244` — **SUCCESS**.
- CI job: `93035709313` — **SUCCESS**.
- Jest: **34 suites passed, 167 tests passed**.

**Next phase in sequence:** **P31 — Home Feed Data Contract and Query Model**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P31 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31231364244`
- Head SHA: `1e7d8ec460098aaeaf993d5b34129d2c7b8a8f75`
- Phase: **P30 — Cart Add/Remove/Quantity Reconciliation**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero warnings,
5. Jest including P30 focused coverage and prior regressions — 34 suites / 167 tests passed,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P30 Accepted Cart Mutation/Reconciliation Behavior

P30 extends the accepted P28 authoritative cart domain and P29 shared View Cart overlay with exact existing line mutation contracts. It does not implement P31 discovery, a Cart product screen, checkout, or payment.

Accepted behavior:

- `POST /api/v1/cart/items` is used for add with exact `{menuItemId, quantity}` request shape.
- `PUT /api/v1/cart/items/{cartItemId}` is used for quantity updates with exact `{quantity}` request shape.
- `DELETE /api/v1/cart/items/{cartItemId}` is used for line removal.
- Every mutation response is parsed as the existing authoritative `CartResponse`; invalid/inconsistent responses are rejected.
- Add waits for authoritative server reconciliation because the backend can create or merge the cart line and refresh catalog/kitchen/price snapshots.
- Quantity update optimistically changes only canonical line quantity; it does not fabricate server-owned line totals or food subtotal.
- Remove optimistically removes the canonical line so derived item count/empty state/View Cart visibility react immediately.
- Quantity/remove failures roll back to the prior snapshot only when no newer authoritative client acceptance revision has arrived.
- All cart writes are serialized, preventing later intent from being overwritten by an earlier out-of-order mutation response.
- Duplicate same-key taps are blocked while pending (`menu:<menuItemId>` for add; `line:<cartItemId>` for update/remove).
- Existing request-id-aware mutation metadata remains authoritative for pending/failed state.
- Only validated authoritative snapshots advance `clientRevision`; optimistic and rollback projections do not.
- Existing P28 selectors remain the one source for item count, per-menu-item quantity, empty state, and server food subtotal, so current and future surfaces synchronize from one cart domain.
- No backend/APIM contract was added or changed by P30.

### Guide alignment

The master guide requires centralized cart state, immediate mutation feedback, duplicate-mutation protection, reliable rollback for low-risk optimistic updates, server reconciliation, derived totals/badges/selectors, and protection against stale/out-of-order responses. P30 implements those rules without inventing pricing or later product-screen contracts.

---

## 4. P30 Changed Files

Implementation:

- `apps/mobile/src/features/cart/api/cartApi.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`
- `apps/mobile/src/features/cart/state/cartMutations.ts`

Tests:

- `apps/mobile/src/features/cart/cartDomain.test.ts`
- `apps/mobile/src/features/cart/cartMutations.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P30_CART_ADD_REMOVE_QUANTITY_RECONCILIATION.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, Home/discovery data model, Cart product screen, checkout, payment, or P31+ product behavior was changed.

---

## 5. Current Architecture Ownership After P30

### Authentication/session

- P19–P24 remain authoritative for Firebase exchange, secure session storage/refresh, identity/onboarding resolution, logout/revoke, and private-state cleanup.

### Customer shell/shared state

- P25 owns the Customer root shell and four typed bottom tabs.
- P26 owns bottom-navigation scroll hide/reveal behavior.
- P27 owns the shared customer header, saved browsing location, and notification badge derivation.
- P28 owns the one canonical cart read domain, server-total snapshot, selectors, dependency metadata, and mutation metadata skeleton.
- P29 owns the reusable shared View Cart presentation/visibility contract.
- P30 owns exact add/update/remove cart-line transport and reconciliation, bounded optimistic quantity/remove behavior, duplicate protection, serialized writes, and rollback/stale-response protection.

### Later-phase boundaries

- **P31** owns Home feed/category/cuisine/location data contract/query mapping, pagination, and cache keys according to `phases.md`.
- P32+ owns customer discovery/product screens according to `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+ according to `phases.md`.

---

## 6. Current Contract Status

Previously accepted authentication/profile/onboarding and P27 customer-shell reads remain unchanged.

Accepted customer cart mobile contract boundary now includes:

- `GET /api/v1/cart` — P28 authoritative cart read.
- `POST /api/v1/cart/items` — P30 add line/item quantity.
- `PUT /api/v1/cart/items/{cartItemId}` — P30 set line quantity.
- `DELETE /api/v1/cart/items/{cartItemId}` — P30 remove line.

No client-owned tax, fee, discount, delivery-fee, grand-total, stock, serviceability, or pricing-version field is invented when the current accepted cart response does not provide it.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19 Firebase → CRAVES Exchange | **DONE** | CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | CI `31220843488`. |
| P22 Customer Registration/Profile Completion | **DONE** | CI `31221757744`. |
| P23 Chef Application Submission / Status | **DONE** | CI `31222819644`. |
| P24 Logout/Revoke/Role-State Cleanup | **DONE** | CI `31225688358`. |
| P25 Customer Root Shell/Bottom Tabs | **DONE** | CI `31226669633`. |
| P26 Customer Bottom-Nav Scroll Hide/Reveal | **DONE** | CI `31228012689`. |
| P27 Shared Customer Header/Location/Notification Badge | **DONE** | CI `31229329651`. |
| P28 Authoritative Cart Domain Skeleton | **DONE** | CI `31229985407`. |
| P29 Shared View Cart Overlay | **DONE** | CI `31230836784`. |
| P30 Cart Add/Remove/Quantity Reconciliation | **DONE** | Exact line writes, duplicate/stale/out-of-order protection, bounded optimistic rollback; CI `31231364244`. |
| P31 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P30

Do not describe any of the following as complete:

- P31 Home feed/category/cuisine/location query model or discovery data integration,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because shell/header/cart foundations exist,
- full dish-card/quantity-selector product UI merely because P30 mutation commands exist,
- Customer Cart product screen/Bill Summary,
- native GPS/location permission behavior or full serviceability/geocoding flows,
- Notifications Center product route/actions merely because the P27 badge exists,
- coupon application, delivery quote, cart address integration, checkout eligibility, tax/fee/grand-total computation,
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
