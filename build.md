# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P25 have dedicated evidence under `docs/mobile-ui-rebuild/`; prior phase details remain there when this living ledger is compacted.

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
- **P25 — Customer Root Shell and Bottom Tabs: DONE** at implementation/static-navigation level; later Customer product screens remain unaccepted until their owning phases.

P25 completion evidence:

- Started from commit: `85545d24c8f05a88ad2b7f7cffcaa6fe08438bfb`.
- Initial implementation commit: `40d31af0b8ac9045b9031991b041ddac4a85d153`.
- Validated implementation commit: `f3b6f9458f2c5e42c58989dbe6115fd382102f85`.
- Evidence commit: `9933e62208e7855d7672af5a211738cfa151a235`.
- Evidence: `docs/mobile-ui-rebuild/P25_CUSTOMER_ROOT_SHELL_BOTTOM_TABS.md`.
- CI run: `31226669633` — **SUCCESS**.

**Next phase in sequence:** **P26 — Customer Bottom-Nav Scroll Hide/Reveal**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P26 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31226669633`
- Head SHA: `f3b6f9458f2c5e42c58989dbe6115fd382102f85`
- Phase: **P25 — Customer Root Shell and Bottom Tabs**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P25 customer-tab/navigation-policy tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The initial P25 run `31226522662` failed only because ESLint correctly rejected an inline tab-icon renderer with `react/no-unstable-nested-components`. The final implementation moved those renderers to stable module-level functions and the complete validation suite then passed.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P25 Accepted Customer Shell Boundary

P25 accepts this bounded transition:

`authenticated Customer + backend-resolved READY onboarding state` → existing authenticated root gate → `CustomerRootNavigator` → typed **Home / Chefs / Orders / Profile** bottom tabs → independent typed native stack per tab.

Accepted behavior:

- The existing single `NavigationContainer` remains authoritative; no parallel navigation system was added.
- A Customer whose onboarding status is `PROFILE_REQUIRED` remains in the existing registration flow.
- A Customer whose onboarding status is `READY` enters the Customer shell.
- Home, Chefs, Orders, and Profile are typed bottom-tab routes in the required order.
- Each tab owns an independent typed native stack so later product child routes can be added without resetting sibling tab state.
- `popToTopOnBlur` remains disabled, preserving each tab stack across tab changes.
- Active-tab tint uses shared Flame Red `#F62E18`; inactive tint uses the shared muted-text token.
- The shell remains under the existing `SafeAreaProvider`; the tab bar does not impose a fixed bottom offset or fixed height that would bypass Android navigation/gesture insets.
- The tab bar hides for the keyboard/IME.
- Customer tab routes resolve to the non-immersive Customer chrome policy while authentication/account-resolution routes remain immersive.
- Existing shared icon infrastructure was extended with Home and Orders icons rather than creating a second icon system.
- P26 scroll-driven hide/reveal behavior was **not** implemented.

### Product-screen boundary

P25 does **not** accept Customer Home, Chefs discovery, My Orders, or Customer Profile as completed product/reference screens. Until their owning phases replace these roots, each tab stack reuses the already-accepted `CustomerAccountStatusScreen` with its real P24 logout path. This avoids fake marketplace data, empty handlers, or falsely claiming later reference screens as complete.

No View Cart/cart domain, discovery/catalog data, orders domain, profile product UI, transactional flows, or Chef product shell was introduced.

---

## 4. P25 Changed Files

Validated P25 implementation changes are limited to:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/customerTabs.ts`
- `apps/mobile/src/app/navigation/customerTabs.test.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/auth/screens/CustomerAccountStatusScreen.tsx`
- `apps/mobile/src/shared/components/Icon.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P25_CUSTOMER_ROOT_SHELL_BOTTOM_TABS.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, or P26+ behavior was changed.

---

## 5. Current Architecture Ownership After P25

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
- TanStack Query owns server state; private cache cleanup remains centralized through `app/query/queryCache.ts`.
- Root navigation remains conditional on `auth.bootstrapStatus`; logout still unmounts the authenticated navigator subtree.
- P25 adds one Customer bottom-tab navigator inside the existing root navigation container.
- Home, Chefs, Orders, and Profile each own a nested typed native stack and preserve stack state on tab changes.
- Product routes are added to those stacks only by their owning later phases.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef authorization.
- P22 Customer profile completion and P23 Chef application/status behavior remain unchanged.
- `CUSTOMER + READY` now routes to the P25 Customer shell; `CUSTOMER + PROFILE_REQUIRED` remains in registration.
- Chef routing remains unchanged by P25.

### Later-phase boundaries

- **P26** owns Customer bottom-navigation scroll hide/reveal behavior.
- Later Customer phases own Home, Chefs discovery, Orders, Profile and their real API-backed product compositions.
- Chef KYC proof upload and Chef operational/product screens remain outside P25.

---

## 6. Current Contract Status

Authentication/profile/onboarding contracts accepted before P25 remain unchanged:

- `POST /api/v1/auth/firebase/exchange` — P19.
- `POST /api/v1/auth/refresh` — P20.
- `GET /api/v1/auth/me` — P21/P23 authority.
- `GET /api/v1/customer/profile` / `PUT /api/v1/customer/profile` — P21/P22.
- `GET /api/v1/chef/application` / `POST /api/v1/chef/application` — P23.
- `POST /api/v1/auth/logout` — P24.
- `POST /api/v1/chef/application/proof-files` — backend route exists but remains outside accepted P23–P25 behavior.

**P25 uses no new APIM/backend contract.** It is a navigation-shell phase only.

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
| P26 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P25

Do not describe any of the following as complete:

- P26 Customer bottom-nav scroll hide/reveal,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because the P25 tab shell now exists,
- authoritative cart/View Cart/cart synchronization,
- Chef KYC proof-file upload,
- Chef operational/product screens,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- live APIM/device runtime certification of P19–P25 flows,
- physical-device pixel-perfect certification of accepted auth references or remaining references,
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
