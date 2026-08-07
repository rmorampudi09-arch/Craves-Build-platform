# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** Detailed accepted history through P09 remains at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`. Earlier detailed history through P08 remains at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P08.md`. P10, P11, and P12 have dedicated evidence documents and are summarized below.

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

P12 completion evidence:

- Started from P11 record HEAD: `58d3bc43cd510acb0ef37d7d0ee4d940d62bfe11`.
- Validated P12 implementation commit: `e152bf3e1479010078bb13c99333e12c298676f5`.
- Evidence: `docs/mobile-ui-rebuild/P12_ROLE_SELECTION_UI_STATE.md`.
- CI run: `31210359665` — **SUCCESS**.

**Next phase in sequence:** **P13 — Customer Phone Sign-In Visual + Interaction**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P13. Do not pre-implement P13.

P12 accepts the existing Customer/Chef segmented role UI and role-aware copy/art, makes the role selection immediately shared in the existing auth store, and synchronizes typed role-bearing auth routes with that same current-attempt role. Role is preserved through the existing phone/email/OTP/password-recovery chain in process memory only. P11 remains the owner of immersive auth chrome, so bottom navigation and Customer View Cart stay hidden. P12 does not alter APIs or claim P13–P18 screen-specific visual acceptance.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31210359665`
- Head SHA: `e152bf3e1479010078bb13c99333e12c298676f5`
- Phase: **P12 — Role Selection UI and State**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript check (`tsc --noEmit`),
5. ESLint (`--max-warnings=0`),
6. Jest including P12 role-state tests and all prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the correct implementation-phase policy.

Run `31210359665` validates the P12 mobile-code boundary only. It does not certify P13–P18 reference-specific auth-screen visuals, P20 startup restoration UX, P21 authoritative backend role resolution, customer/chef product shells, or full-app completion.

---

## 3. What Is Actually Implemented Today

### 3.1 Accepted application foundations — P03 through P11

The existing React Native CLI architecture remains intact: strict TypeScript, React Navigation, Redux Toolkit, TanStack Query, Axios through the centralized core HTTP boundary, React Hook Form/Zod, Reanimated/Gesture Handler, Safe Area Context/Screens, FlashList, Firebase App/Auth, project-approved `expo-secure-store`, Jest, ESLint, Metro/Babel, and Android native ownership under `apps/mobile`.

Accepted P03–P11 ownership and evidence remain in their phase documents and historical ledgers. P12 does not introduce a duplicate store, navigation container, storage system, API client, query layer, theme system, or token-security owner.

### 3.2 Role selection/current-auth-attempt state — IMPLEMENTED / P12 ACCEPTED

Key files:

- `apps/mobile/src/features/auth/hooks/useAuthAttemptRole.ts`
- `apps/mobile/src/features/auth/screens/RoleSelectionScreen.tsx`
- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx`
- `apps/mobile/src/features/auth/screens/OtpVerificationScreen.tsx`
- `apps/mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`
- `apps/mobile/src/features/auth/screens/PasswordResetSentScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`
- `apps/mobile/src/features/auth/components/RoleSelector.tsx`
- `apps/mobile/src/features/auth/components/AuthHero.tsx`
- `docs/mobile-ui-rebuild/P12_ROLE_SELECTION_UI_STATE.md`

Accepted P12 behavior:

- Customer/Chef selection is represented by the existing accessible segmented control.
- Existing Customer/Chef-specific hero copy, icon, illustration, and CTA copy are driven from the same selected role.
- Selecting a role on `RoleSelectionScreen` updates `auth.selectedRole` immediately rather than waiting for Continue.
- Continue passes the same typed role into the phone auth route.
- A typed role-bearing auth route synchronizes its entry role into the shared current-attempt auth role.
- Role changes on phone/email auth update visible UI and shared role together.
- The selected role is preserved through the existing phone → OTP, phone ↔ email, email → forgot-password → reset-sent → email flows.
- The selected role remains available when the existing authentication transition chooses the current Customer/Chef root.
- Role selection is not persisted to AsyncStorage or SecureStore; it remains current-attempt/process-memory state.
- P11 route policy keeps all current auth screens immersive with bottom navigation hidden and Customer View Cart ineligible.
- No backend role authorization is inferred from the user's selection; P21 remains the authoritative identity/role-resolution phase.

### 3.3 Root navigation and route policy — IMPLEMENTED / P11 ACCEPTED

P11 remains unchanged by P12.

Key ownership remains:

- one application `NavigationContainer` in `app/navigation/AppNavigator.tsx`;
- typed Auth/Customer/Chef/Transactional/Modal domain model in `app/navigation/types.ts`;
- centralized bottom-nav/View-Cart/immersive policy in `app/navigation/navigationPolicy.ts`;
- fail-closed anonymous deep-link destination validation in `app/navigation/deepLinkPolicy.ts`.

### 3.4 Session/token security — IMPLEMENTED / P10 ACCEPTED

P10 remains unchanged by P12.

Accepted security remains: process-memory access token, platform-secure refresh credential, single-record refresh metadata, legacy migration/fail-closed handling, persistence-before-publication rotation ordering, expiry rejection, one in-flight refresh, and credential cleanup on failure/local clear.

### 3.5 Current auth/API contract status — UNCHANGED BY P12

Current coded paths remain as documented by P02/P09/P10, including:

- `POST /api/v1/auth/firebase/exchange`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`
- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

P02 remains authoritative. Firebase exchange, refresh, and logout remain `CONTRACT_ONLY`; `/api/v1/auth/me`, customer profile GET/PUT, and chef application GET/POST remain `BLOCKED` under the accepted static repository evidence. P12 does not invent, alter, or runtime-verify any route or payload.

---

## 4. Current Architecture Ownership After P12

### Navigation ownership

- Application navigation container: `app/navigation/AppNavigator.tsx` only.
- Current route parameter definitions/domain model: `app/navigation/types.ts`.
- Shared bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- External destination allowlist/payload validation boundary: `app/navigation/deepLinkPolicy.ts`.

### Authentication role-state ownership

- Shared selected role: `features/auth/state/authSlice.ts` (`auth.selectedRole`).
- Current auth-attempt screen/route synchronization: `features/auth/hooks/useAuthAttemptRole.ts`.
- Role UI: `features/auth/components/RoleSelector.tsx`.
- Role-aware auth art/copy: `features/auth/components/AuthHero.tsx` plus role-aware screen copy.
- Role is not persisted to generic or secure storage by P12.
- User selection remains intent/context only; it is not server authorization.

### Session/security ownership

- Access token: `core/security/tokenMemory.ts`, process memory only.
- Refresh credential: `core/security/refreshTokenStore.ts`, platform-secure storage only.
- Token-pair acceptance, restore/rotation, single-flight refresh, local clear: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.
- Private query cache clearing remains the P08 query-layer capability; full logout/role-transition cleanup is still P24.

### Important later-phase boundaries

- P13/P14 own Customer/Chef Phone Sign-In visual and interaction acceptance.
- P15/P16 own Customer/Chef Email Sign-In visual and interaction acceptance.
- P17 owns OTP acceptance; P18 owns password recovery.
- P19 owns Firebase-to-CRAVES exchange acceptance against the exact approved contract.
- P20 owns startup restore/silent-refresh lifecycle UX and wrong-root-flash prevention.
- P21 owns authoritative backend identity/role/onboarding resolution.
- P24 owns full logout/revoke plus private cache/store/role cleanup orchestration.
- P25/P26 own Customer bottom tabs and their scroll behavior.
- P29 owns View Cart UI/animation/synchronization.

Do not pull those later scopes into P12 retroactively.

---

## 5. Current Test Coverage Relevant to P12

P12-focused tests include `apps/mobile/src/features/auth/state/authSlice.test.ts`:

- default Customer role for a new anonymous attempt,
- immediate shared update to Chef,
- selected role retained through authentication state transition,
- switch back to Customer within the same attempt.

P11 route-policy tests remain relevant and continue to verify the immersive auth/account route boundary. Prior accepted P03–P11 regression suites remain part of the same passing CI run.

---

## 6. Current Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00 Execution Documents | **DONE** | Source-lock/governance accepted. |
| P01 Repository Inventory | **DONE** | Architecture ownership audit accepted. |
| P02 APIM/OpenAPI Inventory | **DONE** | Current mobile consumers classified; unresolved contracts remain explicit. |
| P03 Runtime Config | **DONE** | Central runtime boundary accepted. |
| P04 Design Tokens | **DONE** | Shared token baseline accepted. |
| P05 Motion Baseline | **DONE** | Shared/reduced-motion baseline accepted. |
| P06 Shared Interaction Primitives | **DONE** | Shared actionable controls accepted. |
| P07 Shared Lifecycle Primitives | **DONE** | Shared lifecycle layer accepted. |
| P08 Query/Store Cache Rules | **DONE** | Query/store ownership, contextual keys, private clearing, bounded cache/paging accepted. |
| P09 Typed HTTP Client | **DONE** | Central typed HTTP/error/retry/cancellation/dedupe foundation accepted. |
| P10 Session Token Security | **DONE** | Memory-only access token, secure refresh record, rotation/failure cleanup, focused tests; CI `31208468433` green. |
| P11 Root Navigation | **DONE** | Role-separated current route registries, typed domain ownership, route-chrome policy, fail-closed deep-link boundary; CI `31209520350` green. |
| P12 Role Selection | **DONE** | Role-aware selector/copy/art accepted; shared current-attempt role and typed auth-route synchronization accepted; CI `31210359665` green. |
| P13 Customer Phone Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance is next and is not authorized. |
| P14 Chef Phone Sign-In | PARTIAL / implemented | Existing shared role-aware flow; phase-specific/reference acceptance pending. |
| P15 Customer Email Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance pending. |
| P16 Chef Email Sign-In | PARTIAL / implemented | Existing shared auth logic; phase-specific/reference acceptance pending. |
| P17 OTP | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P18 Password Recovery | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P19 Firebase→CRAVES Exchange | PARTIAL / implemented | Mobile code exists; P02 classifies current route as `CONTRACT_ONLY`. |
| P20 Session Restore/Refresh | PARTIAL / implemented | P10/P11/P12 foundations exist; lifecycle/root UX acceptance remains later and refresh route is `CONTRACT_ONLY`. |
| P21 Identity/Role Resolution | PARTIAL / implemented | `/me` code exists; P02 classifies exact contract as `BLOCKED`. |
| P22 Customer Registration | PARTIAL / implemented | Existing code; P02 customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / implemented | Existing code; P02 chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / implemented | Credential cleanup foundation exists; full private cache/store/role cleanup remains unaccepted. |
| P25 onward | NOT STARTED | Marketplace/customer/chef product phases have not been accepted under this rebuild protocol. |

---

## 7. Explicitly Not Complete

Do not describe any of the following as complete after P12:

- P13 Customer Phone Sign-In reference/device acceptance,
- P14 Chef Phone Sign-In reference/device acceptance,
- P15/P16 email sign-in reference/device acceptance,
- P17 OTP and P18 password-recovery granular acceptance,
- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P24 auth lifecycle acceptance,
- final device-based visual certification of auth screens,
- Customer refs 5–37,
- Chef refs 38–52,
- Customer/chef bottom-tab product shells,
- View Cart UI/authoritative cart system,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- full lifecycle/accessibility/performance/security audits,
- 52-reference visual certification,
- production APK/AAB/signing/release readiness.

---

## 8. Phase Completion Recording Protocol

After every authorized phase, record:

```text
Phase: Pxx — Title
Status: DONE | PARTIAL | BLOCKED
Started from commit: <sha>
Completed at commit: <sha>
Guide references: <screen refs/pages>
Changed files: <exact paths>
APIM/contracts used: <exact route/method/model source>
Behavior completed: <bounded summary>
Tests/checks: <results/run id>
Visual QA: <deferred or evidence>
Blockers: <none or exact missing dependency>
Next phase: NONE AUTHORIZED — waiting for user
```

Do not erase useful history. Preserve prior authoritative detail under `docs/mobile-ui-rebuild/` before any future compaction.

---

## 9. Phase History

Detailed P00–P09 history is preserved unchanged in `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`.

### P10 — Session Token Security Foundation

- Status: **DONE**.
- Started from commit: `7f05c199b5d5c5fdf74783cc40f39cf1afe6009c`.
- Validated implementation completion commit: `1870aa30172574ad5bb2e192798bbe4f96b736e8`.
- Evidence: `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`.
- Guide references: global security-storage, state-management secure-state, security/privacy token, auth-session, and testing standards; no individual reference screen implemented.
- APIM/contracts used: no new contract; existing `POST /api/v1/auth/refresh` retained unchanged and remains `CONTRACT_ONLY` under P02.
- Tests/checks: GitHub Actions run `31208468433` — **SUCCESS**.
- Visual QA: not applicable; no reference-screen layout change.
- APK built: **No**.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P10 client-security acceptance; P02 blockers remain.
- Next phase at completion: P11 required separate user authorization.

### P11 — Root Navigation and Typed Route Policy

- Status: **DONE**.
- Started from commit: `26be99d71c9f7ded7fa5c14561e8c36507a35141`.
- Validated implementation completion commit: `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58`.
- Evidence: `docs/mobile-ui-rebuild/P11_ROOT_NAVIGATION_TYPED_ROUTE_POLICY.md`.
- Guide references: full 183-page master guide global Navigation Standards, Smart UI route visibility rules, Security/Privacy deep-link allowlisting, and Testing/Verification navigation/deep-link requirements; no individual reference screen implemented.
- Changed implementation files: `apps/mobile/src/app/navigation/AppNavigator.tsx`, `apps/mobile/src/app/navigation/types.ts`, `apps/mobile/src/app/navigation/navigationPolicy.ts`, `apps/mobile/src/app/navigation/navigationPolicy.test.ts`, `apps/mobile/src/app/navigation/deepLinkPolicy.ts`, `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`.
- APIM/contracts used: **none**. P11 is a client navigation boundary and does not add/change a backend route, APIM route key, JSON model, auth contract, or server rule.
- Behavior completed: one navigation container retained; current anonymous/customer/chef route registration separated by root; typed domain ownership for Auth/Customer/Chef/Transactional/Modal; centralized bottom-nav/View-Cart/immersive policy; validated fail-closed deep-link allowlist for safe current anonymous entry routes.
- Tests/checks: GitHub Actions run `31209520350` — **SUCCESS**.
- Visual QA: not applicable to a reference screen; device/reference certification remains in later visual QA phases.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P11 acceptance. Product deep links stay intentionally deny-by-default until their owning feature phases can validate access and resource state.
- Next phase at completion: P12 required separate user authorization.

### P12 — Role Selection UI and State

- Status: **DONE**.
- Started from commit: `58d3bc43cd510acb0ef37d7d0ee4d940d62bfe11`.
- Validated implementation completion commit: `e152bf3e1479010078bb13c99333e12c298676f5`.
- Evidence: `docs/mobile-ui-rebuild/P12_ROLE_SELECTION_UI_STATE.md`.
- Guide references: full 183-page reference images 01–04 shared authentication context (pages 23–33): Customer/Chef role selector, `selectedRole`, role-aware copy/art, role preservation across phone/email/OTP/password recovery, and auth-screen chrome hidden.
- Changed implementation files: `apps/mobile/src/features/auth/hooks/useAuthAttemptRole.ts`, `apps/mobile/src/features/auth/screens/RoleSelectionScreen.tsx`, `PhoneSignInScreen.tsx`, `EmailSignInScreen.tsx`, `OtpVerificationScreen.tsx`, `ForgotPasswordScreen.tsx`, `PasswordResetSentScreen.tsx`, and `apps/mobile/src/features/auth/state/authSlice.test.ts`.
- APIM/contracts used: **none changed or added**. Existing auth calls remain untouched; P12 changes role UI/state propagation only.
- Behavior completed: immediate shared Customer/Chef selection; existing role-aware hero/CTA bound to the same role; typed route role synchronized into the current auth attempt; role preserved through existing phone/email/OTP/recovery navigation; no generic/secure persistence added; P11 immersive chrome retained.
- Tests/checks: GitHub Actions run `31210359665` — **SUCCESS**. `npm ci`, strict TypeScript, ESLint with zero warnings, Jest including P12 tests and prior regressions, production Android JS bundle, and backend/APIM/infrastructure guard all passed.
- Visual QA: static/code traceability confirms the role selector and existing role-aware art/copy binding. No pixel-perfect device screenshot claim is made; Customer/Chef phone/email reference-specific device visual gates remain P13–P16.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P12 role-selection/state acceptance. P02 backend-contract blockers remain for later phases.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P12 is complete. **P13 — Customer Phone Sign-In Visual + Interaction** is the next phase in `phases.md`, but it is **not authorized** by completion of P12. Begin P13 only after the user explicitly says to continue/start the next phase.
