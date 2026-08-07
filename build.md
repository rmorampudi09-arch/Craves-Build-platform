# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** Detailed accepted history through P09 remains at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`. Earlier detailed history through P08 remains at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P08.md`. P10 and P11 have dedicated evidence documents and are summarized below.

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

P11 completion evidence:

- Started from P10 record HEAD: `26be99d71c9f7ded7fa5c14561e8c36507a35141`.
- Validated P11 implementation commit: `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58`.
- Evidence: `docs/mobile-ui-rebuild/P11_ROOT_NAVIGATION_TYPED_ROUTE_POLICY.md`.
- CI run: `31209520350` — **SUCCESS**.

**Next phase in sequence:** **P12 — Role Selection UI and State**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P12. Do not pre-implement P12.

P11 establishes role-separated registration for the currently existing anonymous Auth and authenticated Customer/Chef account-resolution routes while retaining one application `NavigationContainer`. It defines typed Auth/Customer/Chef/Transactional/Modal domain ownership, a centralized bottom-navigation/View Cart route-chrome policy, and a fail-closed validated deep-link allowlist for safe currently implemented anonymous entry routes. Transactional and Modal routes remain intentionally unregistered until their owning product phases; P11 does not add placeholder screens or pre-implement P12+ UI.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31209520350`
- Head SHA: `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58`
- Phase: **P11 — Root Navigation and Typed Route Policy**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript check (`tsc --noEmit`),
5. ESLint (`--max-warnings=0`),
6. Jest including P11 route-policy/deep-link tests and all prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the correct implementation-phase policy.

Run `31209520350` validates the P11 mobile-code boundary only. It does not certify P12 Role Selection visuals/state acceptance, P20 startup restoration UX, P21 authoritative backend role resolution, customer/chef shell UI, product deep links, or full-app completion.

---

## 3. What Is Actually Implemented Today

### 3.1 Accepted application foundations — P03 through P10

The existing React Native CLI architecture remains intact: strict TypeScript, React Navigation, Redux Toolkit, TanStack Query, Axios through the centralized core HTTP boundary, React Hook Form/Zod, Reanimated/Gesture Handler, Safe Area Context/Screens, FlashList, Firebase App/Auth, project-approved `expo-secure-store`, Jest, ESLint, Metro/Babel, and Android native ownership under `apps/mobile`.

Accepted P03–P10 ownership and evidence remain in their phase documents and historical ledgers. No duplicate store, query client, HTTP client, navigation container, theme system, or secure-storage implementation was introduced by P11.

### 3.2 Root navigation and route policy — IMPLEMENTED / P11 ACCEPTED

Key files:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/app/navigation/deepLinkPolicy.ts`
- `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`
- `docs/mobile-ui-rebuild/P11_ROOT_NAVIGATION_TYPED_ROUTE_POLICY.md`

Accepted P11 behavior:

- One application `NavigationContainer` remains the navigation owner.
- Anonymous Auth route registration is isolated from authenticated account-resolution registration.
- Authenticated Customer account-resolution routes and Chef account-resolution routes are registered in separate navigators.
- Customer account screens are not registered in the Chef navigator; Chef account screens are not registered in the Customer navigator.
- Existing flat screen route typing remains compatible while explicit Auth, Customer, Chef, Transactional, and Modal domain types establish the future ownership boundary.
- Transactional and Modal domains are deliberately unregistered until their real owning phases; no placeholder route is introduced.
- Current route parameters remain small serializable values; no mutable domain object is added to route params.
- Shared route-chrome policy defines Auth/Transactional/Modal as immersive, Customer shell as bottom-nav/View-Cart eligible by default, and Chef shell as bottom-nav eligible but never Customer View-Cart eligible.
- Every currently registered auth/account-resolution route is explicitly immersive, so no future shell chrome appears on current auth/onboarding/status routes.
- Deep-link handling now has a fail-closed validation boundary. Only safe currently implemented anonymous routes are allowlisted (`RoleSelection`, `PhoneSignIn`, `EmailSignIn`, `ForgotPassword`).
- Deep-link role params accept only `CUSTOMER`/`CHEF`; malformed/extra object payloads, OTP/account/product destinations, unknown routes, and auth-route redirects during an authenticated session are rejected.
- No URL scheme, host, product resource link, notification payload model, backend permission rule, or product route is invented.

### 3.3 Session/token security — IMPLEMENTED / P10 ACCEPTED

P10 remains unchanged by P11.

Key files:

- `apps/mobile/src/core/security/tokenMemory.ts`
- `apps/mobile/src/core/security/refreshTokenStore.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`
- focused P10 tests
- `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`

Accepted P10 security remains: process-memory access token, platform-secure refresh credential, single-record refresh metadata, legacy migration/fail-closed handling, persistence-before-publication rotation ordering, expiry rejection, one in-flight refresh, and credential cleanup on failure/local clear.

### 3.4 Current auth/API contract status — UNCHANGED BY P11

Current coded paths remain as documented by P02/P09/P10, including:

- `POST /api/v1/auth/firebase/exchange`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`
- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

P02 remains authoritative. Firebase exchange, refresh, and logout remain `CONTRACT_ONLY`; `/api/v1/auth/me`, customer profile GET/PUT, and chef application GET/POST remain `BLOCKED` under the accepted static repository evidence. P11 does not invent, alter, or runtime-verify any route or payload.

---

## 4. Current Architecture Ownership After P11

### Navigation ownership

- Application navigation container: `app/navigation/AppNavigator.tsx` only.
- Current route parameter definitions/domain model: `app/navigation/types.ts`.
- Shared bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- External destination allowlist/payload validation boundary: `app/navigation/deepLinkPolicy.ts`.
- Anonymous root: Auth route registry.
- Authenticated Customer root at current implementation depth: Customer account-resolution registry only.
- Authenticated Chef root at current implementation depth: Chef account-resolution registry only.

### Session/security ownership

- Access token: `core/security/tokenMemory.ts`, process memory only.
- Refresh credential: `core/security/refreshTokenStore.ts`, platform-secure storage only.
- Token-pair acceptance, restore/rotation, single-flight refresh, local clear: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.
- Private query cache clearing remains the P08 query-layer capability; full logout/role-transition orchestration is still P24.

### Important later-phase boundaries

- P12 owns Role Selection UI/state acceptance.
- P19 owns Firebase-to-CRAVES exchange acceptance against the exact approved contract.
- P20 owns startup restore/silent-refresh UX, proactive lifecycle behavior, and wrong-root-flash prevention.
- P21 owns authoritative backend role/onboarding resolution; P11 does not upgrade selected-role state into server authorization.
- P24 owns full logout/revoke plus private cache/store/role cleanup orchestration.
- P25/P26 own Customer bottom tabs and their scroll behavior.
- P29 owns View Cart UI/animation/synchronization.
- Later customer/chef/transactional/modal phases add their real screens/routes to the P11 boundaries.

Do not pull those later scopes into P11 retroactively.

---

## 5. Current Test Coverage Relevant to P11

P11-focused tests include:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
  - auth/account-resolution routes remain immersive,
  - Customer domain shell-chrome default,
  - Chef domain View Cart exclusion,
  - Transactional/Modal immersive defaults.
- `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`
  - allowlisted anonymous destinations,
  - role/email serializable param validation,
  - unknown/sensitive route rejection,
  - invalid role/extra-object rejection,
  - authenticated-session rejection of anonymous auth destinations.

Prior accepted P03–P10 regression suites remain part of the same passing CI run.

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
| P12 Role Selection | PARTIAL / NOT ACCEPTED | Existing functional code exists; P12 phase-specific UI/state/reference acceptance is next and is not authorized. |
| P13 Customer Phone Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance pending. |
| P14 Chef Phone Sign-In | PARTIAL / implemented | Existing shared role-aware flow; phase-specific/reference acceptance pending. |
| P15 Customer Email Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance pending. |
| P16 Chef Email Sign-In | PARTIAL / implemented | Existing shared auth logic; phase-specific/reference acceptance pending. |
| P17 OTP | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P18 Password Recovery | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P19 Firebase→CRAVES Exchange | PARTIAL / implemented | Mobile code exists; P02 classifies current route as `CONTRACT_ONLY`. |
| P20 Session Restore/Refresh | PARTIAL / implemented | P10/P11 foundations exist; lifecycle/root UX acceptance remains later and refresh route is `CONTRACT_ONLY`. |
| P21 Identity/Role Resolution | PARTIAL / implemented | `/me` code exists; P02 classifies exact contract as `BLOCKED`. |
| P22 Customer Registration | PARTIAL / implemented | Existing code; P02 customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / implemented | Existing code; P02 chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / implemented | Credential cleanup foundation exists; full private cache/store/role cleanup remains unaccepted. |
| P25 onward | NOT STARTED | Marketplace/customer/chef product phases have not been accepted under this rebuild protocol. |

---

## 7. Explicitly Not Complete

Do not describe any of the following as complete after P11:

- P12 Role Selection UI/state/reference acceptance,
- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P24 auth lifecycle acceptance,
- final reference/device certification of auth screens,
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
- Guide references: full 183-page master guide global Navigation Standards (navigation domains and required behavior), Smart UI route visibility rules, Security/Privacy deep-link allowlisting, and Testing/Verification navigation/deep-link requirements; no individual reference screen was implemented.
- Changed implementation files: `apps/mobile/src/app/navigation/AppNavigator.tsx`, `apps/mobile/src/app/navigation/types.ts`, `apps/mobile/src/app/navigation/navigationPolicy.ts`, `apps/mobile/src/app/navigation/navigationPolicy.test.ts`, `apps/mobile/src/app/navigation/deepLinkPolicy.ts`, `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`.
- APIM/contracts used: **none**. P11 is a client navigation boundary and does not add/change a backend route, APIM route key, JSON model, auth contract, or server rule.
- Behavior completed: one navigation container retained; current anonymous/customer/chef route registration separated by root; typed domain ownership for Auth/Customer/Chef/Transactional/Modal; centralized bottom-nav/View-Cart/immersive policy; validated fail-closed deep-link allowlist for safe current anonymous entry routes.
- Tests/checks: GitHub Actions run `31209520350` — **SUCCESS**. Dependency install, strict TypeScript, ESLint with zero warnings, Jest including P11 policy tests and prior regressions, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all passed.
- Visual QA: not applicable to a reference screen; P11 changes navigation architecture/policy only. Device/reference certification remains in the later visual QA phases.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P11 acceptance. Product deep links stay intentionally deny-by-default until their owning feature phases can validate access and resource state.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P11 is complete. **P12 — Role Selection UI and State** is the next phase in `phases.md`, but it is **not authorized** by completion of P11. Begin P12 only after the user explicitly says to continue/start the next phase.
