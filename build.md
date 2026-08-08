# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P27 have dedicated evidence under `docs/mobile-ui-rebuild/`; prior phase details remain there when this living ledger is compacted.

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

P27 completion evidence:

- Started from commit: `9751bc2efc64e5e17f2609bbe553a2044051f237`.
- Validated implementation commit: `64fb707a8c0fc4d706f6ee97c05189c9449f5271`.
- Evidence commit: `ce91e97ddb12b82057e8a05557b9bf8771763f61`.
- Evidence: `docs/mobile-ui-rebuild/P27_SHARED_CUSTOMER_HEADER_LOCATION_NOTIFICATION_BADGE.md`.
- CI run: `31229329651` — **SUCCESS**.
- A prior validation run `31229225679` exposed one lint-only `no-void` finding; it was corrected before the successful final validation.

**Next phase in sequence:** **P28 — Authoritative Cart Domain Skeleton**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P28 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31229329651`
- Head SHA: `64fb707a8c0fc4d706f6ee97c05189c9449f5271`
- Phase: **P27 — Shared Customer Header/Location/Notification Badge**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint,
6. Jest including P27 location/badge tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P27 Accepted Shared Customer Header Behavior

P27 extends the P25/P26 Customer shell without fabricating later Home, Chefs, Orders, Profile, Notifications Center, or cart product screens.

Accepted behavior:

- `CustomerHeader` is the reusable Customer header primitive and supports `default` and `compact` variants.
- The header exposes one accessible location selector entry and one notification bell entry rather than owning product navigation routes itself.
- Header interactions meet the shared 48dp minimum touch-target rule.
- Flame Red and Espresso Brown continue to come from the shared P04 token set.
- A saved location selection is Redux-owned Customer shell state, not a per-screen local copy.
- `useCustomerHeaderState()` is the shared read surface for selected location and notification badge data.
- `CustomerLocationSelector` lists customer-owned saved locations from the approved Customer address route and updates the one shared selected-location state.
- No automatic first/default address is invented if the user has not selected a browsing location.
- Notification data is private TanStack Query server state scoped by authenticated identity and CUSTOMER role.
- The unread badge is calculated only from `readAt === null` and displays `99+` when the derived value exceeds 99.
- Notification runtime parsing allow-lists only customer-visible fields and does not accept/render raw payload, event key, provider, or retry metadata.
- Logout clears Customer shell selection in addition to the existing private query/mutation cache cleanup.
- Existing authentication, navigation, bottom tabs, and P26 hide/reveal behavior remain unchanged.

### Location / notification contract boundary

P27 consumes only approved existing capabilities:

- `GET /api/v1/customer/addresses`
- `GET /api/v1/notifications/in-app` with the documented `limit` range capped at `100`

P27 intentionally does **not** introduce native GPS permissions, geocoding, maps SDKs, delivery/serviceability radius logic, a Notifications Center route, mark-read behavior, target navigation, or any new APIM/backend route. Those remain with their owning later phases/QA gates.

---

## 4. P27 Changed Files

Validated P27 implementation changes from the accepted P26 ledger head are limited to:

- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/components/CustomerHeader.tsx`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `apps/mobile/src/features/customerShell/customerShell.test.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/customerShell/state/customerShellSlice.ts`
- `apps/mobile/src/shared/components/Icon.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P27_SHARED_CUSTOMER_HEADER_LOCATION_NOTIFICATION_BADGE.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, cart/View Cart behavior, P28 domain behavior, or later Customer product screen was changed.

---

## 5. Current Architecture Ownership After P27

### Authentication/session

- Firebase phone/email provider wrapper: `features/auth/firebase/firebaseAuth.ts`.
- Firebase → CRAVES exchange and provider/session cleanup: `features/auth/state/authService.ts`.
- Exact Auth Service wrapper including logout: `features/auth/api/authApi.ts`.
- Access token: process memory through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage through `core/security/refreshTokenStore.ts`.
- Restore/rotation/single-flight/invalidation: `features/auth/api/sessionManager.ts`.
- Startup restore: `features/auth/hooks/useBootstrap.ts`.
- Proactive/foreground refresh: `features/auth/hooks/useSessionLifecycle.ts`.
- Complete app-level logout cleanup: `features/auth/state/logoutCoordinator.ts`.

### State/cache/navigation

- Redux auth state owns requested role, authenticated identity, and onboarding/account resolution.
- Redux Customer shell state owns the current explicitly selected saved browsing location.
- TanStack Query owns server state, including P27 saved-location options and notification list/badge data.
- Private query cleanup remains centralized through `app/query/queryCache.ts`.
- Root navigation remains conditional on `auth.bootstrapStatus`; logout unmounts the authenticated navigator subtree.
- P25 remains the owner of the one Customer bottom-tab navigator and four independent typed tab stacks.
- P26 remains the owner of bottom-navigation scroll hide/reveal behavior.
- P27 owns `CustomerHeader`, `CustomerLocationSelector`, shared Customer location selection, and notification badge derivation.
- Product routes and real Customer tab-root compositions remain owned by later phases and must consume these shared P26/P27 primitives rather than duplicating them.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef authorization.
- P22 Customer profile completion and P23 Chef application/status behavior remain unchanged.
- `CUSTOMER + READY` enters the Customer shell; `CUSTOMER + PROFILE_REQUIRED` remains in registration.
- Chef routing remains unchanged by P27.

### Later-phase boundaries

- **P28** owns the authoritative cart domain skeleton.
- Later phases own View Cart, Customer Home/discovery, Chefs, Orders, Profile, notification center/target routing, checkout and payment according to `phases.md`.
- Chef KYC proof upload and Chef operational/product screens remain outside P27.

---

## 6. Current Contract Status

Authentication/profile/onboarding contracts accepted before P27 remain unchanged:

- `POST /api/v1/auth/firebase/exchange` — P19.
- `POST /api/v1/auth/refresh` — P20.
- `GET /api/v1/auth/me` — P21/P23 authority.
- `GET /api/v1/customer/profile` / `PUT /api/v1/customer/profile` — P21/P22.
- `GET /api/v1/chef/application` / `POST /api/v1/chef/application` — P23.
- `POST /api/v1/auth/logout` — P24.
- `POST /api/v1/chef/application/proof-files` — backend route exists but remains outside accepted P23–P27 behavior.

P27 additionally accepts only these existing Customer shell reads:

- `GET /api/v1/customer/addresses`
- `GET /api/v1/notifications/in-app`

No new backend/APIM contract was invented or modified by P27.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19 Firebase → CRAVES Exchange | **DONE** | Exact exchange and secure token acceptance; CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | Restore/rotation/proactive refresh accepted; CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | Backend authority, onboarding resolution, authenticated root gate; CI `31220843488`. |
| P22 Customer Registration/Profile Completion | **DONE** | Exact profile completion and server-confirmed state transition; CI `31221757744`. |
| P23 Chef Application Submission / Status | **DONE** | Backend-driven application/status flow and approved-role recheck; CI `31222819644`. |
| P24 Logout/Revoke/Role-State Cleanup | **DONE** | Best-effort revoke, unconditional local credential cleanup, private cache/mutation cleanup, role reset, fresh Auth root; CI `31225688358`. |
| P25 Customer Root Shell/Bottom Tabs | **DONE** | Typed four-tab Customer shell, nested stack preservation, Flame Red active state, safe-area-compatible bottom tabs; CI `31226669633`. |
| P26 Customer Bottom-Nav Scroll Hide/Reveal | **DONE** | Shared scroll-direction controller, reduced-motion animation, hidden interaction/accessibility guard, tab/root reveal behavior; CI `31228012689`. |
| P27 Shared Customer Header/Location/Notification Badge | **DONE** | Shared header variants, saved-location selector/global state, private notification badge derivation, logout cleanup; CI `31229329651`. |
| P28 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P27

Do not describe any of the following as complete:

- P28 authoritative cart domain or P29 View Cart overlay,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because the shell/header primitives exist,
- native GPS/location permission behavior,
- geocoding/maps/serviceability logic,
- Notifications Center list/mark-read/target routing merely because the shared badge query exists,
- Chef KYC proof-file upload,
- Chef operational/product screens,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- live APIM/device runtime certification of P19–P27 flows,
- physical-device pixel-perfect certification of accepted auth/header references or remaining references,
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

Preserve useful prior history under `docs/mobile-ui-rebuild/` before compacting this living ledger.
