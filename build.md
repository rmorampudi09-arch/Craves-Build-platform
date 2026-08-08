# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P31 use dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger remains compact while those records preserve phase detail.

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
- **P31 — Home Feed Data Contract and Query Model: PARTIAL** at implementation/static-contract level. Exact nearby-menu/location/pagination/cache behavior is implemented and validated; category/cuisine/full-home mapping remains blocked because the current branch has no authoritative concrete contract for those capabilities.

P31 evidence:

- Started from accepted P30 ledger head: `58ad6ffd46f09992d1ad1098dd4df7cc2c246bd0`.
- Validated implementation commit: `641ef5321a886185e5956f966f1710e231ee2ad4`.
- Evidence commit: `87da0591af6768ab5640f2167c61cc8439b026e8`.
- Evidence: `docs/mobile-ui-rebuild/P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md`.
- CI run: `31243903844` — **SUCCESS**.
- CI job: `93069234068` — **SUCCESS**.
- Jest: **36 suites passed, 175 tests passed**.
- Exact blocker: no authoritative current-branch home aggregation endpoint, cuisine taxonomy endpoint, `category` discovery query parameter, `cuisine` discovery query parameter, or cuisine field in the nearby-menu discovery response.

**Current phase in sequence:** **P31 — Home Feed Data Contract and Query Model** remains open because required category/cuisine/full-home contract mapping is blocked.

**Next phase after P31:** **P32 — Customer Home — Empty Cart**, but it is **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P32. Resolve/supply the missing P31 authoritative contracts or explicitly change the phase authority before advancing.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31243903844`
- Job ID: `93069234068`
- Head SHA: `641ef5321a886185e5956f966f1710e231ee2ad4`
- Phase: **P31 — Home Feed Data Contract and Query Model**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero warnings,
5. Jest including P31 focused coverage and prior regressions — 36 suites / 175 tests passed,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P31 Implemented Home Feed Query Boundary

P31 reviewed the master guide's customer Home expectations against current backend/APIM reality before introducing mobile data contracts.

Accepted exact contract behavior:

- Nearby menu data uses only `GET /api/v1/discovery/menu-items`.
- Exact supported query parameters are `latitude`, `longitude`, `radiusMeters`, `page`, and `size`.
- Mobile request validation matches the backend's location/radius/page/page-size bounds.
- Nearby discovery responses are strictly parsed before they become usable mobile data.
- Backend page metadata (`page`, `size`, `totalElements`, `totalPages`, `hasNext`) drives infinite-query pagination.
- The selected saved customer address now carries validated latitude/longitude from the existing customer address response contract.
- Home discovery query keys are private and scoped by authenticated customer identity, CUSTOMER role, saved-address ID, normalized filter intent, radius, and page size.
- Changing the shared browsing location invalidates all Home discovery query variants without invalidating unrelated private domains.
- Category/cuisine filter intent is represented in the query model, but transport is fail-closed when either unsupported filter is requested.
- No hardcoded production feed, cuisine list, guessed category parameter, guessed cuisine parameter, or guessed Home aggregation URL was added.
- No backend/APIM contract was added or changed by P31.

### P31 contract blocker

The current branch does not provide an authoritative concrete contract for:

- a full Home-feed aggregation endpoint,
- cuisine taxonomy,
- server-side nearby `category` filtering,
- server-side nearby `cuisine` filtering,
- cuisine data in the current nearby-menu response,
- the guide's logical recommendation aggregation capability.

Because `agent.md` forbids inventing missing API contracts, P31 remains **PARTIAL** even though its exact supported subset passes CI.

---

## 4. P31 Changed Files

Implementation:

- `apps/mobile/src/features/customerShell/state/customerShellSlice.ts`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/home/api/homeFeedApi.ts`
- `apps/mobile/src/features/home/query/homeFeedQueries.ts`

Tests:

- `apps/mobile/src/features/customerShell/customerShell.test.ts`
- `apps/mobile/src/features/home/homeFeedApi.test.ts`
- `apps/mobile/src/features/home/homeFeedQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P32 Home screen, checkout, payment, or Chef product behavior was changed.

---

## 5. Current Architecture Ownership After P31 Work

### Authentication/session

- P19–P24 remain authoritative for Firebase exchange, secure session storage/refresh, identity/onboarding resolution, logout/revoke, and private-state cleanup.

### Customer shell/shared state

- P25 owns the Customer root shell and four typed bottom tabs.
- P26 owns bottom-navigation scroll hide/reveal behavior.
- P27 owns the shared customer header, saved browsing location, and notification badge derivation.
- P28 owns the one canonical cart read domain, server-total snapshot, selectors, dependency metadata, and mutation metadata skeleton.
- P29 owns the reusable shared View Cart presentation/visibility contract.
- P30 owns exact add/update/remove cart-line transport and reconciliation, bounded optimistic quantity/remove behavior, duplicate protection, serialized writes, and rollback/stale-response protection.
- P31 currently owns the validated nearby Home-discovery adapter/query model, saved-location coordinate propagation, pagination/cache keys, location invalidation, and explicit fail-closed treatment of unsupported category/cuisine filter intent.

### Later-phase boundaries

- **P31 remains open** until the missing authoritative category/cuisine/full-home contract is supplied/resolved or phase authority is explicitly changed.
- **P32+** owns customer discovery/product screens according to `phases.md`; none was started by P31.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+ according to `phases.md`.

---

## 6. Current Contract Status

Previously accepted authentication/profile/onboarding, P27 customer-shell reads, and P28–P30 cart contracts remain unchanged.

Accepted current P31 mobile discovery contract boundary:

- `GET /api/v1/discovery/menu-items`
  - query: `latitude`, `longitude`, `radiusMeters`, `page`, `size`
  - authoritative paginated response from `DiscoveryDtos.NearbyMenuItemDiscoveryResponse`.

Accepted customer-location dependency:

- existing saved-address response supplies `id`, `addressLabel`, `latitude`, and `longitude` used by the shared browsing-location state.

Not accepted because no exact current-branch server/APIM contract was found:

- Home aggregation URL,
- cuisine taxonomy URL/model,
- discovery `category` query parameter,
- discovery `cuisine` query parameter,
- cuisine response field,
- recommendation aggregation URL/model.

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
| P30 Cart Add/Remove/Quantity Reconciliation | **DONE** | CI `31231364244`. |
| P31 Home Feed Data Contract and Query Model | **PARTIAL** | Exact nearby/location/pagination/cache/invalidation subset validated by CI `31243903844`; category/cuisine/full-home contract missing. |
| P32 onward | **NOT STARTED / not accepted** | P31 is not DONE; no later phase was authorized or started. |

---

## 8. Explicitly Not Complete After P31 Work

Do not describe any of the following as complete:

- P31 exact category/cuisine/full-home aggregation mapping,
- P32 Customer Home — Empty Cart,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because shell/header/cart/query foundations exist,
- full dish-card/quantity-selector product UI merely because P30 mutation commands and P31 nearby data exist,
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
