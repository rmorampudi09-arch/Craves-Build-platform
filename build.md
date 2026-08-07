# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P19 each have dedicated evidence under `docs/mobile-ui-rebuild/`.

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

P19 completion evidence:

- Started from commit: `6d70d855b8e62f0d416f8da94ba468d2135e99bf`.
- Validated implementation commit: `0005a7751998ec8626f55bfcd4240aacb4c5e4be`.
- Evidence commit: `26c229026ce4c0918e8144c0c60399e22d34fc2d`.
- Evidence: `docs/mobile-ui-rebuild/P19_FIREBASE_CRAVES_SESSION_EXCHANGE.md`.
- CI run: `31218027179` — **SUCCESS**.

**Next phase in sequence:** **P20 — Session Restore and Silent Refresh**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P20 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31218027179`
- Head SHA: `0005a7751998ec8626f55bfcd4240aacb4c5e4be`
- Phase: **P19 — Firebase → CRAVES Session Exchange**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P19 exchange/fail-closed tests and prior auth regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P19 Accepted Firebase → CRAVES Exchange Boundary

P19 accepts one shared CRAVES session-exchange path after Firebase authentication:

`Firebase OTP/email auth` → fresh Firebase ID token → `authService` → `authApi.exchangeFirebaseToken(...)` → `POST /api/v1/auth/firebase/exchange` through the public shared client → `sessionManager.acceptTokenPair(...)` → authenticated identity returned to the existing screen/store boundary.

### Exact P19 contract

Method/path:

- `POST /api/v1/auth/firebase/exchange`

Request model:

- `FirebaseExchangeRequest`
- JSON field: `firebaseIdToken`

Success model:

- `AuthTokenResponse`
- `tokenType`
- `accessToken`
- `expiresIn`
- `refreshToken`
- `refreshTokenExpiresAt`
- `identity: IdentityResponse`

Current authoritative static sources:

- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/api/FirebaseExchangeRequest.java`
- `services/auth-service/src/main/java/in/craves/auth/api/AuthTokenResponse.java`
- `services/auth-service/src/main/java/in/craves/auth/api/IdentityResponse.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`
- `docs/CRV-AUTH-001-auth-service-LLD.md`

The P19-specific re-audit found that the current branch now contains matching OpenAPI + Spring Auth Service implementation for this exact route. Therefore this **one operation** is accepted as **VERIFIED at current static repository contract/implementation level**, superseding its older P02 `CONTRACT_ONLY` classification for P19 purposes. This does **not** claim a live APIM/device exchange call.

### Correlation, timeout, and error handling

- Exchange uses `publicApiClient`; it does not require a pre-existing CRAVES bearer token.
- Request timeout is bounded at 10,000 ms.
- Shared request metadata attaches `X-Correlation-ID`.
- Shared transport normalizes failures to `AppApiError` while retaining safe backend code/status/correlation evidence.
- Existing screen/store authentication dispatch occurs only after CRAVES exchange and secure token acceptance both succeed.

### Fail-closed behavior completed by P19

Before P19, a failure after Firebase authentication could leave Firebase signed in even though CRAVES session exchange or token persistence had failed.

P19 changes the shared `authService` exchange boundary so that if exchange or secure token-pair acceptance fails:

- local CRAVES credentials are cleared best-effort,
- Firebase authentication state is signed out best-effort,
- cleanup cannot mask the original operation error,
- no authenticated Redux state is published,
- stale/partial credentials are not treated as a successful session.

### P10 token security preserved

- Access token remains process-memory only through `tokenMemory`.
- Refresh credential remains platform-secure only through `refreshTokenStore`.
- Refresh credential is persisted before the access token is exposed.
- Secure-store failure fails closed.

No tokens were moved to component state, AsyncStorage, plain persistence, logs, or screen parameters.

---

## 4. P19 Changed Files

Implementation commit `0005a7751998ec8626f55bfcd4240aacb4c5e4be` changes only:

- `apps/mobile/src/features/auth/state/authService.ts`
- `apps/mobile/src/features/auth/state/authService.test.ts`
- `apps/mobile/src/features/auth/api/authApi.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P19_FIREBASE_CRAVES_SESSION_EXCHANGE.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, product-screen visual, or P20 lifecycle source was changed by P19.

---

## 5. Current Architecture Ownership After P19

### Authentication inputs and provider boundary

- Phone OTP initiation/confirmation: `features/auth/firebase/firebaseAuth.ts`.
- Email/password provider sign-in: same Firebase wrapper.
- Firebase public error normalization: `features/auth/firebase/firebaseAuthError.ts`.
- Shared Firebase → CRAVES orchestration: `features/auth/state/authService.ts`.
- Exact CRAVES auth HTTP wrapper: `features/auth/api/authApi.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/refresh/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection/401 behavior: accepted P09 HTTP client foundation.

### Navigation/store publication

- OTP and email screens call the shared auth service.
- `authActions.authenticated(identity)` is dispatched only after `authService` returns a successfully exchanged and securely accepted CRAVES token pair.
- P19 does not alter startup root selection, role/onboarding authority, or product navigation.

### Later-phase boundaries not pulled into P19

- **P20** owns startup session restore/silent refresh lifecycle behavior and wrong-root flash prevention.
- **P21** owns authoritative identity/role/onboarding resolution.
- **P22/P23** own customer completion and Chef application/status flows.
- **P24** owns complete logout/revoke/private-cache/role cleanup orchestration.
- **P25 onward** owns customer/chef product shells and marketplace functionality.

---

## 6. Current Auth/API Contract Status

P19 changes only the current acceptance status of the exchange operation after re-auditing current branch evidence:

- `POST /api/v1/auth/firebase/exchange` — **VERIFIED at static repository contract/implementation level by P19; live APIM runtime not claimed**.
- `POST /api/v1/auth/refresh` — remains outside P19 acceptance; P20 owns restore/refresh lifecycle acceptance.
- `POST /api/v1/auth/logout` — remains outside P19 completion; P24 owns complete logout/revoke cleanup acceptance.
- `GET /api/v1/auth/me` — not accepted by P19; P21 owns identity/role resolution.
- customer profile operations — not accepted by P19; P22 owns profile completion.
- chef application operations — not accepted by P19; P23 owns application/status behavior.

Historical P02 evidence remains preserved and should not be rewritten as though its earlier repository snapshot contained the later/current Auth Service evidence.

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
| P19 Firebase → CRAVES Exchange | **DONE** | Exact current Auth Service exchange contract, P10 token acceptance, correlation/timeout/error path, and fail-closed partial-auth cleanup accepted; CI `31218027179`. |
| P20 Session Restore/Refresh | PARTIAL / foundation exists | P10 session manager code exists; P20 lifecycle/root UX acceptance is not authorized yet. |
| P21 Identity/Role Resolution | PARTIAL / existing baseline | Existing code may exist; P21 acceptance not authorized. |
| P22 Customer Registration | PARTIAL / existing baseline | P22 acceptance not authorized. |
| P23 Chef Application Status | PARTIAL / existing baseline | P23 acceptance not authorized. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 8. Explicitly Not Complete After P19

Do not describe any of the following as complete:

- P20 startup restore/silent-refresh lifecycle UX,
- P21 authoritative identity/role/onboarding resolution,
- P22/P23 customer/chef onboarding completion,
- P24 complete logout/revoke/private-cache cleanup,
- live APIM/device runtime certification of the P19 exchange,
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

### P13 — Customer Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Validated implementation commit: `40e43930c1026b3805332e9d41e75fefc2457b17`.
- Evidence: `docs/mobile-ui-rebuild/P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI: `31211607174` — **SUCCESS**.

### P14 — Chef Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Validated implementation commit: `2735e0fa0d352863cda16ac480939b1862c1b483`.
- Evidence: `docs/mobile-ui-rebuild/P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI: `31212292710` — **SUCCESS**.

### P15 — Customer Email/Password Sign-In

- Status: **DONE** at implementation level.
- Validated implementation commit: `595bdf73a2afefc58554b0d3cd3beda600d8aa6c`.
- Evidence: `docs/mobile-ui-rebuild/P15_CUSTOMER_EMAIL_SIGN_IN.md`.
- CI: `31213256378` — **SUCCESS**.

### P16 — Chef Email/Password Sign-In

- Status: **DONE** at implementation level.
- Validated implementation commit: `44f82184f169e3c01363658e8bd1c33eca3a85cc`.
- Evidence: `docs/mobile-ui-rebuild/P16_CHEF_EMAIL_SIGN_IN.md`.
- CI: `31214293358` — **SUCCESS**.

### P17 — OTP Verification, Resend, Expiry, Rate Limit

- Status: **DONE** at implementation level.
- Validated implementation commit: `9400a269d6f750712227550c27df4430cc00853c`.
- Evidence: `docs/mobile-ui-rebuild/P17_OTP_VERIFICATION_RESEND_EXPIRY_RATE_LIMIT.md`.
- CI: `31215342272` — **SUCCESS**.

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
- Changed implementation files: `authService.ts`, `authService.test.ts`, `authApi.test.ts`.
- Contract accepted: `POST /api/v1/auth/firebase/exchange` with exact current `FirebaseExchangeRequest`, `AuthTokenResponse`, and `IdentityResponse` models.
- Behavior completed: shared OTP/email Firebase-token exchange, public-client correlation/timeout/error path, P10 secure token acceptance, and fail-closed cleanup of Firebase + local CRAVES state on exchange/persistence failure.
- CI: `31218027179` — **SUCCESS**.
- Visual/runtime note: P19 is non-visual; live APIM/device exchange is not falsely claimed.
- Next phase: **P20 — Session Restore and Silent Refresh — NONE AUTHORIZED**.
