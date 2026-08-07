# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P20 each have dedicated evidence under `docs/mobile-ui-rebuild/`.

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
- **P13 — Customer Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P14 — Chef Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P15 — Customer Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P16 — Chef Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P17 — OTP Verification, Resend, Expiry, Rate Limit: DONE** at implementation level.
- **P18 — Password Recovery Flow: DONE** at implementation level.
- **P19 — Firebase → CRAVES Session Exchange: DONE** at implementation/static-contract level.
- **P20 — Session Restore and Silent Refresh: DONE** at implementation/static-contract level.

P20 completion evidence:

- Started from commit: `6e54098622367e7b4a35173ef3946f62007d16c7`.
- Initial implementation commit: `52499ea6bf59e877d2f618e7b51b6039f8f68176`.
- Validated implementation commit: `fbaee4352d119140ee8a859583478860ee7b6267`.
- Evidence commit: `79af6c807143122b68369d6d650c4bb017e05ede`.
- Evidence: `docs/mobile-ui-rebuild/P20_SESSION_RESTORE_AND_SILENT_REFRESH.md`.
- CI run: `31219378437` — **SUCCESS**.

**Next phase in sequence:** **P21 — Identity, Role, and Onboarding Resolution**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P21 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31219378437`
- Head SHA: `fbaee4352d119140ee8a859583478860ee7b6267`
- Phase: **P20 — Session Restore and Silent Refresh**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P20 session restore/refresh tests and prior auth regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The initial P20 implementation run `31219237307` passed strict TypeScript but failed the zero-warning lint gate on three `no-void` warnings. Those warnings were corrected in `fbaee4352d119140ee8a859583478860ee7b6267`; run `31219378437` then passed the complete workflow.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P20 Accepted Session Restore / Silent Refresh Boundary

P20 accepts one shared session lifecycle:

`app startup` → splash/bootstrap gate → secure refresh credential load → `POST /api/v1/auth/refresh` through the public client → rotated refresh credential persisted → access token published to process memory → authenticated identity published → proactive/foreground silent refresh through the same session manager.

The existing P10 token-security architecture is preserved; P20 does not create a second token store, refresh interceptor, or session state machine.

### Exact P20 contract

Method/path:

- `POST /api/v1/auth/refresh`

Request model:

- `RefreshTokenRequest`
- JSON field: `refreshToken`

Success model:

- `AuthTokenResponse`
- `tokenType`
- `accessToken`
- `expiresIn`
- `refreshToken`
- `refreshTokenExpiresAt`
- `identity`

Current authoritative static sources:

- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`

The current branch OpenAPI and Spring Auth Service agree on refresh-token rotation and invalid/expired/revoked outcomes. P20 therefore accepts this operation as **VERIFIED at current static repository contract/implementation level**. This does **not** claim a live APIM/device refresh call.

### Startup restore and wrong-root flash prevention

- `AppNavigator` keeps `SplashScreen` visible while bootstrap is `idle` or `restoring`.
- Auth/account navigation roots are not rendered until session restoration resolves, so a saved authenticated session does not flash the sign-in root first.
- Startup restoration rotates the secure refresh credential through the shared `sessionManager`.
- The rotated refresh credential is persisted before the new access token is exposed in process memory.
- Missing, expired, rejected, or otherwise terminal refresh credentials fail closed to anonymous/sign-in state.

P20 does **not** resolve authoritative Customer/Chef role or onboarding state; that remains P21.

### Proactive silent refresh

- `tokenMemory` remains memory-only and now exposes the bounded delay until its existing 30-second refresh safety window.
- `useSessionLifecycle` schedules a shared refresh before server access-token expiry after bootstrap becomes authenticated.
- Refresh scheduling pauses while the app is backgrounded/inactive.
- Returning to foreground reschedules a fresh token or immediately refreshes a stale token.
- Startup, 401 recovery, proactive timer refresh, and foreground refresh all coalesce through the existing single in-flight `refreshPromise`.

### Refresh failure behavior

- Local expired refresh credentials are cleared without backend traffic.
- Backend-invalid/revoked/terminal credentials clear local session state and publish session invalidation so authenticated runtime state returns to sign-in.
- A missing refresh credential invalidates an already-authenticated runtime session.
- Failure to persist a rotated refresh credential fails closed.
- **Transient network/5xx/retriable refresh failures preserve the existing valid secure refresh credential** so bootstrap retry or later silent refresh can recover without forcing an unnecessary re-login.

### Startup recovery UX

- `Try again` restarts bootstrap while retaining a valid saved refresh credential after a transient restore failure.
- `Go to sign in` explicitly discards retained local CRAVES/Firebase authentication state before publishing anonymous state.
- The sign-in escape action has loading/duplicate-tap protection.

---

## 4. P20 Changed Files

Validated implementation changes from P20 start `6e54098622367e7b4a35173ef3946f62007d16c7` through validated head `fbaee4352d119140ee8a859583478860ee7b6267` are limited to:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/core/security/tokenMemory.ts`
- `apps/mobile/src/core/security/tokenMemory.test.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`
- `apps/mobile/src/features/auth/api/sessionManager.test.ts`
- `apps/mobile/src/features/auth/hooks/useSessionLifecycle.ts`
- `apps/mobile/src/features/auth/screens/StartupErrorScreen.tsx`
- `apps/mobile/src/features/auth/state/authService.ts`
- `apps/mobile/src/features/auth/state/authService.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P20_SESSION_RESTORE_AND_SILENT_REFRESH.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, Customer/Chef product UI, or P21 source was changed by P20.

---

## 5. Current Architecture Ownership After P20

### Authentication provider/exchange

- Phone OTP initiation/confirmation: `features/auth/firebase/firebaseAuth.ts`.
- Email/password provider sign-in: same Firebase wrapper.
- Firebase public error normalization: `features/auth/firebase/firebaseAuthError.ts`.
- Shared Firebase → CRAVES orchestration: `features/auth/state/authService.ts`.
- Exact CRAVES auth HTTP wrapper: `features/auth/api/authApi.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/rotation/single-flight/invalidation/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection/reactive 401 retry: accepted P09 HTTP client foundation.
- Proactive and foreground silent-refresh timing: `features/auth/hooks/useSessionLifecycle.ts`.

### Bootstrap/navigation

- Startup restoration state: `features/auth/hooks/useBootstrap.ts`.
- Splash/error gate before auth/account navigation roots: `app/navigation/AppNavigator.tsx`.
- Startup recoverable error UI: `features/auth/screens/StartupErrorScreen.tsx`.

### Later-phase boundaries not pulled into P20

- **P21** owns authoritative identity/role/onboarding resolution.
- **P22/P23** own customer completion and Chef application/status flows.
- **P24** owns complete logout/revoke/private-query/private-store/role cleanup orchestration.
- **P25 onward** owns customer/chef product shells and marketplace functionality.

---

## 6. Current Auth/API Contract Status

- `POST /api/v1/auth/firebase/exchange` — **VERIFIED at static repository contract/implementation level by P19; live APIM runtime not claimed**.
- `POST /api/v1/auth/refresh` — **VERIFIED at static repository contract/implementation level by P20; live APIM/runtime refresh not claimed**.
- `POST /api/v1/auth/logout` — full logout/revoke cleanup remains outside P20; P24 owns acceptance.
- `GET /api/v1/auth/me` — not accepted by P20; P21 owns authoritative identity/role resolution.
- customer profile operations — not accepted by P20; P22 owns profile completion.
- chef application operations — not accepted by P20; P23 owns application/status behavior.

Historical P02 evidence remains preserved and should not be rewritten as though its earlier repository snapshot contained later/current Auth Service evidence.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P09 | **DONE** | Preserved in historical ledgers and dedicated evidence. |
| P10 Session Token Security | **DONE** | Secure token boundary accepted; CI `31208468433`. |
| P11 Root Navigation | **DONE** | Typed route/chrome/deep-link policy accepted; CI `31209520350`. |
| P12 Role Selection | **DONE** | Shared current-attempt role and auth-route synchronization accepted; CI `31210359665`. |
| P13 Customer Phone Sign-In | **DONE** | Customer phone validation/request guard/native Firebase initiation accepted; CI `31211607174`. |
| P14 Chef Phone Sign-In | **DONE** | Chef-specific role/copy/submission behavior accepted through shared phone engine; CI `31212292710`. |
| P15 Customer Email Sign-In | **DONE** | Customer credential UI/validation/request behavior accepted; CI `31213256378`. |
| P16 Chef Email Sign-In | **DONE** | Chef role preservation through shared email engine accepted; CI `31214293358`. |
| P17 OTP | **DONE** | OTP verification/resend/expiry/rate-limit behavior accepted; CI `31215342272`. |
| P18 Password Recovery | **DONE** | Neutral recovery and safe navigation accepted; CI `31217157970`. |
| P19 Firebase → CRAVES Exchange | **DONE** | Current exchange contract, secure token acceptance, and fail-closed partial-auth cleanup accepted; CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | Startup splash/restore gate, single-flight rotation, proactive/foreground silent refresh, terminal invalidation, and transient recovery accepted; CI `31219378437`. |
| P21 Identity/Role Resolution | PARTIAL / existing baseline | Existing code may exist; P21 acceptance not authorized. |
| P22 Customer Registration | PARTIAL / existing baseline | P22 acceptance not authorized. |
| P23 Chef Application Status | PARTIAL / existing baseline | P23 acceptance not authorized. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 8. Explicitly Not Complete After P20

Do not describe any of the following as complete:

- P21 authoritative identity/role/onboarding resolution,
- P22/P23 customer/chef onboarding completion,
- P24 complete logout/revoke/private-cache cleanup,
- live APIM/device runtime certification of the P19 exchange or P20 refresh operation,
- authoritative runtime resolution of unrelated P02 blocked/contract-only operations,
- physical-device pixel-perfect certification of accepted auth references or the remaining reference set,
- Customer product refs beyond accepted auth phases,
- Chef product refs beyond accepted auth phases,
- customer/chef bottom-tab product shells,
- authoritative View Cart/cart synchronization,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
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

Preserve useful prior history under `docs/mobile-ui-rebuild/` before compacting this living ledger.

---

## 10. Recent Phase History

### P18 — Password Recovery Flow

- Status: **DONE** at implementation level.
- Validated implementation commit: `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce`.
- Evidence commit: `fcca218bc4224e55f4318715f70f6e141bee1d7e`.
- Evidence: `docs/mobile-ui-rebuild/P18_PASSWORD_RECOVERY_FLOW.md`.
- CI: `31217157970` — **SUCCESS**.

### P19 — Firebase → CRAVES Session Exchange

- Status: **DONE** at implementation/static-contract level.
- Started from: `6d70d855b8e62f0d416f8da94ba468d2135e99bf`.
- Validated implementation commit: `0005a7751998ec8626f55bfcd4240aacb4c5e4be`.
- Evidence commit: `26c229026ce4c0918e8144c0c60399e22d34fc2d`.
- Evidence: `docs/mobile-ui-rebuild/P19_FIREBASE_CRAVES_SESSION_EXCHANGE.md`.
- Contract accepted: `POST /api/v1/auth/firebase/exchange` at current static repository contract/implementation level.
- CI: `31218027179` — **SUCCESS**.

### P20 — Session Restore and Silent Refresh

- Status: **DONE** at implementation/static-contract level.
- Started from: `6e54098622367e7b4a35173ef3946f62007d16c7`.
- Initial implementation commit: `52499ea6bf59e877d2f618e7b51b6039f8f68176`.
- Validated implementation commit: `fbaee4352d119140ee8a859583478860ee7b6267`.
- Evidence commit: `79af6c807143122b68369d6d650c4bb017e05ede`.
- Evidence: `docs/mobile-ui-rebuild/P20_SESSION_RESTORE_AND_SILENT_REFRESH.md`.
- Changed implementation files: `AppNavigator.tsx`, `tokenMemory.ts`, `tokenMemory.test.ts`, `sessionManager.ts`, `sessionManager.test.ts`, `useSessionLifecycle.ts`, `StartupErrorScreen.tsx`, `authService.ts`, `authService.test.ts`.
- Contract accepted: `POST /api/v1/auth/refresh` with current `RefreshTokenRequest` and `AuthTokenResponse` static repository implementation evidence.
- Behavior completed: startup splash/restore gate, rotated secure-session restore, proactive and foreground silent refresh, single-flight refresh, terminal invalidation, transient retry preservation, and actionable startup recovery.
- CI: `31219378437` — **SUCCESS**.
- Visual/runtime note: P20 is primarily lifecycle behavior; live APIM/device refresh is not falsely claimed.
- Next phase: **P21 — Identity, Role, and Onboarding Resolution — NONE AUTHORIZED**.
