# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** The exact authoritative ledger state through accepted P09 is preserved unchanged at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`. Earlier detailed history through P08 remains at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P08.md`. This file is the current authority from P10 onward.

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

P10 completion evidence:

- Started from P09 record HEAD: `7f05c199b5d5c5fdf74783cc40f39cf1afe6009c`.
- Validated P10 implementation commit: `1870aa30172574ad5bb2e192798bbe4f96b736e8`.
- Evidence: `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`.
- CI run: `31208468433` — **SUCCESS**.

**Next phase in sequence:** **P11 — Root Navigation and Typed Route Policy**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P11. Do not pre-implement P11.

P10 accepts and hardens the existing session-security architecture instead of creating a parallel auth/session stack. Access tokens remain process-memory only. Refresh credentials remain in the project-approved platform-secure store. Refresh token plus expiry metadata now persist as one secure record with legacy migration and malformed-state fail-closed handling. Token-pair acceptance and refresh rotation persist the refresh credential before exposing the new access token, expired refresh credentials are rejected locally, concurrent refresh callers still share one in-flight rotation, and refresh failure/logout cleanup clears local credential state. P10 does not implement P11 navigation, proactive refresh scheduling, full P24 logout/private-cache orchestration, backend/APIM functionality, or any product screen.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31208468433`
- Head SHA: `1870aa30172574ad5bb2e192798bbe4f96b736e8`
- Phase: **P10 — Session Token Security Foundation**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript check (`tsc --noEmit`),
5. ESLint (`--max-warnings=0`),
6. Jest including P10 token-memory, secure-store, rotation, failure, expiry, migration, and single-flight regression coverage,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the correct implementation-phase policy.

Run `31208468433` validates the P10 mobile code boundary only. It does not prove runtime operation of the `CONTRACT_ONLY`/`BLOCKED` routes documented by P02, perform end-to-end auth runtime verification, certify P11 navigation, or claim full-app completion.

---

## 3. What Is Actually Implemented Today

### 3.1 Accepted application foundations — P03 through P09

The existing React Native CLI architecture remains intact: strict TypeScript, React Navigation, Redux Toolkit, TanStack Query, Axios through the centralized core HTTP boundary, React Hook Form/Zod, Reanimated/Gesture Handler, Safe Area Context/Screens, FlashList, Firebase App/Auth, project-approved `expo-secure-store`, Jest, ESLint, Metro/Babel, and Android native ownership under `apps/mobile`.

Accepted foundation owners remain documented in the P03–P09 evidence files and the archived ledger through P09. No duplicate store, query client, HTTP client, navigation container, theme system, or secure-storage implementation was introduced by P10.

### 3.2 Session/token security — IMPLEMENTED / P10 ACCEPTED

Key files:

- `apps/mobile/src/core/security/tokenMemory.ts`
- `apps/mobile/src/core/security/tokenMemory.test.ts`
- `apps/mobile/src/core/security/refreshTokenStore.ts`
- `apps/mobile/src/core/security/refreshTokenStore.test.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`
- `apps/mobile/src/features/auth/api/sessionManager.test.ts`
- `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`

Accepted P10 behavior:

- `tokenMemory.ts` remains the only access-token owner; access tokens are process-memory only.
- The existing access-token freshness safety window remains in place and is tested.
- `refreshTokenStore.ts` remains the only persisted refresh-credential owner and uses platform-secure storage through the project-approved SecureStore module.
- Refresh token and expiry metadata are stored as one serialized `craves_refresh_session_v1` secure record rather than independent token/expiry records.
- Existing legacy `refresh_token` / `refresh_token_expires_at` secure records are migrated once into the current record and removed.
- Malformed, incomplete, or invalid persisted refresh metadata fails closed instead of being used.
- Secure cleanup attempts current and legacy-key deletion together.
- `sessionManager.acceptTokenPair()` clears stale memory, persists the refresh credential first, then publishes the access token to memory; a persistence failure leaves no usable access token.
- Refresh-session expiry is checked before a network refresh attempt; expired credentials are cleared and not sent.
- Refresh rotation persists the newly rotated refresh credential before publishing the new access token.
- One shared in-flight refresh promise prevents concurrent refresh duplication.
- Refresh failure clears process-memory access state and performs best-effort secure refresh-state cleanup before surfacing the original error.
- Local session cleanup clears both process-memory and secure refresh state.
- No token is added to AsyncStorage, generic persistence, route parameters, logging, or screen/component state.

### 3.3 Current auth/API contract status — UNCHANGED BY P10

Current coded paths remain as documented by P02/P09, including:

- `POST /api/v1/auth/firebase/exchange`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`
- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

P02 remains authoritative. Firebase exchange, refresh, and logout remain `CONTRACT_ONLY`; `/api/v1/auth/me`, customer profile GET/PUT, and chef application GET/POST remain `BLOCKED` under the accepted static repository evidence. P10 did not invent, alter, or runtime-verify any route or payload.

---

## 4. Current Architecture Ownership After P10

### Session/security ownership

- Access token: `core/security/tokenMemory.ts`, process memory only.
- Refresh credential: `core/security/refreshTokenStore.ts`, platform-secure storage only.
- Token-pair acceptance, restore/rotation, single-flight refresh, local clear: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.
- Private query cache clearing remains the P08 query-layer capability; full logout/role-transition orchestration is still P24.

### Important later-phase boundaries

- P11 owns complete typed Auth/Customer/Chef/Transactional/Modal root navigation and route visibility policy.
- P19 owns Firebase-to-CRAVES exchange acceptance against the exact approved contract.
- P20 owns startup restore/silent-refresh UX, proactive lifecycle behavior, and wrong-root-flash prevention.
- P24 owns full logout/revoke plus private cache/store/role cleanup orchestration.

Do not pull those later scopes into P10 retroactively.

---

## 5. Current Test Coverage Relevant to P10

P10-focused tests now include:

- `apps/mobile/src/core/security/tokenMemory.test.ts`
  - memory lifecycle,
  - freshness safety window,
  - immediately stale short-lived tokens.
- `apps/mobile/src/core/security/refreshTokenStore.test.ts`
  - single secure-record persistence,
  - current-record loading,
  - legacy-key migration,
  - malformed-state fail-closed behavior,
  - invalid metadata rejection,
  - complete secure cleanup.
- `apps/mobile/src/features/auth/api/sessionManager.test.ts`
  - secure persistence before access-token publication,
  - token-pair persistence failure cleanup,
  - expired refresh rejection without backend traffic,
  - rotation ordering,
  - concurrent single-flight refresh,
  - refresh-failure cleanup,
  - local credential cleanup.

Prior accepted P03–P09 regression suites remain part of the same passing CI run.

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
| P09 Typed HTTP Client | **DONE** | Central typed HTTP/error/retry/cancellation/dedupe foundation accepted; CI `31207371023` green. |
| P10 Session Token Security | **DONE** | Memory-only access token, atomic secure refresh record, migration/fail-closed behavior, rotation ordering, single-flight refresh, cleanup and focused tests accepted; CI `31208468433` green. |
| P11 Root Navigation | PARTIAL / NOT ACCEPTED | Existing auth navigation exists, but complete typed route domains/policy are not accepted. This is the next phase and is not authorized. |
| P12 Role Selection | PARTIAL / implemented | Existing functional code; phase-specific acceptance still pending. |
| P13 Customer Phone Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance pending. |
| P14 Chef Phone Sign-In | PARTIAL / implemented | Existing shared role-aware flow; phase-specific/reference acceptance pending. |
| P15 Customer Email Sign-In | PARTIAL / implemented | Existing functional code; phase-specific/reference acceptance pending. |
| P16 Chef Email Sign-In | PARTIAL / implemented | Existing shared auth logic; phase-specific/reference acceptance pending. |
| P17 OTP | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P18 Password Recovery | PARTIAL / implemented | Existing behavior; granular acceptance pending. |
| P19 Firebase→CRAVES Exchange | PARTIAL / implemented | Mobile code exists; P02 classifies current route as `CONTRACT_ONLY`. |
| P20 Session Restore/Refresh | PARTIAL / implemented | Security foundation accepted in P10; lifecycle/root UX acceptance remains later and refresh route is `CONTRACT_ONLY`. |
| P21 Identity/Role Resolution | PARTIAL / implemented | `/me` code exists; P02 classifies exact contract as `BLOCKED`. |
| P22 Customer Registration | PARTIAL / implemented | Existing code; P02 customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / implemented | Existing code; P02 chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / implemented | Credential cleanup foundation exists; full private cache/store/role cleanup remains unaccepted. |
| P25 onward | NOT STARTED | Marketplace/customer/chef product phases have not been accepted under this rebuild protocol. |

---

## 7. Explicitly Not Complete

Do not describe any of the following as complete after P10:

- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- P11 complete root navigation and typed route policy,
- full P19/P20/P24 auth lifecycle acceptance,
- final reference/device certification of auth screens,
- Customer refs 5–37,
- Chef refs 38–52,
- authoritative cart/View Cart system,
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

Do not erase useful history. Preserve prior authoritative versions under `docs/mobile-ui-rebuild/` before compacting.

---

## 9. Phase History

Detailed P00–P09 history is preserved unchanged in `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`.

### P10 — Session Token Security Foundation

- Status: **DONE**.
- Started from commit: `7f05c199b5d5c5fdf74783cc40f39cf1afe6009c`.
- Validated implementation completion commit: `1870aa30172574ad5bb2e192798bbe4f96b736e8`.
- Evidence: `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`.
- Guide references: global Technology Stack security storage, State Management secure state, Security/Privacy/Compliance token rules, authentication session model, and testing standards in the full 183-page master guide; no individual reference screen was implemented.
- Changed files: `apps/mobile/src/core/security/refreshTokenStore.ts`, `apps/mobile/src/core/security/refreshTokenStore.test.ts`, `apps/mobile/src/core/security/tokenMemory.test.ts`, `apps/mobile/src/features/auth/api/sessionManager.ts`, `apps/mobile/src/features/auth/api/sessionManager.test.ts`, `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`; `build.md` is the completion ledger and the prior exact ledger is archived at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P09.md`.
- APIM/contracts used: no new contract. Existing `POST /api/v1/auth/refresh` request/response path is retained unchanged and remains `CONTRACT_ONLY` under P02. No endpoint, route key, request field, response field, enum, or server rule was invented.
- Behavior completed: memory-only access-token ownership; one-record secure refresh credential/expiry persistence; legacy secure-key migration; malformed/incomplete state fail-closed cleanup; refresh expiry precheck; secure persistence before access-token publication on accept/rotation; single in-flight refresh; failure/local-clear credential cleanup.
- Tests/checks: GitHub Actions run `31208468433` — **SUCCESS**. Dependency install, strict TypeScript, ESLint with zero warnings, Jest including focused P10 security/session tests, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all passed.
- Visual QA: not applicable; P10 changes no reference-screen layout or visual behavior.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P10 client-security acceptance. P02 runtime/contract blockers remain unchanged.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P10 is complete. **P11 — Root Navigation and Typed Route Policy** is the next phase in `phases.md`, but it is **not authorized** by completion of P10. Begin P11 only after the user explicitly says to continue/start the next phase.
