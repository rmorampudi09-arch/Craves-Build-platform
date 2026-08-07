# P19 — Firebase → CRAVES Session Exchange

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P19 only  
**Started from:** `6d70d855b8e62f0d416f8da94ba468d2135e99bf`  
**Validated implementation commit:** `0005a7751998ec8626f55bfcd4240aacb4c5e4be`  
**CI run:** `31218027179` — **SUCCESS**

---

## 1. Phase boundary

P19 accepts the Firebase-to-CRAVES session exchange boundary only.

Per `phases.md`, P19 owns:

- exchange of a verified Firebase identity through the exact Auth Service contract,
- token-pair acceptance according to the P10 security boundary,
- correlation ID, timeout, and error normalization at the exchange request,
- fail-closed behavior so an exchange failure cannot leave a half-authenticated session.

P19 does **not** accept or expand P20 startup restore/silent-refresh lifecycle behavior, P21 identity/onboarding routing, P22/P23 onboarding flows, or P24 full logout/cache cleanup orchestration.

---

## 2. Exact repository contract accepted for P19

P19 re-audited the current branch rather than relying only on the older P02 snapshot. The current branch now contains matching machine-readable and runnable Auth Service source for this operation.

### HTTP operation

`POST /api/v1/auth/firebase/exchange`

### Request

```json
{
  "firebaseIdToken": "<verified Firebase ID token>"
}
```

### Success response model

`AuthTokenResponse`:

- `tokenType`
- `accessToken`
- `expiresIn`
- `refreshToken`
- `refreshTokenExpiresAt`
- `identity`

`identity` matches the current `IdentityResponse` contract:

- `id`
- `firebaseUid`
- `phoneNumber`
- `email`
- `emailVerified`
- `displayName`
- `status`
- `roles`
- `lastLoginAt`

### Authoritative static evidence

- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/api/FirebaseExchangeRequest.java`
- `services/auth-service/src/main/java/in/craves/auth/api/AuthTokenResponse.java`
- `services/auth-service/src/main/java/in/craves/auth/api/IdentityResponse.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`
- `docs/CRV-AUTH-001-auth-service-LLD.md`

The controller is mounted at `/api/v1/auth`, exposes `POST /firebase/exchange`, validates the request DTO, and delegates to the Auth Service. The service verifies the Firebase ID token with revocation checking, requires a verified phone-number claim, resolves/creates the CRAVES identity, enforces active identity status, ensures the default CUSTOMER role, and issues the CRAVES access/refresh token pair.

Current server-side exchange outcomes include the approved public codes/conditions such as:

- `FIREBASE_TOKEN_INVALID`,
- `PHONE_NUMBER_MISSING`,
- `PHONE_ALREADY_LINKED`,
- `IDENTITY_NOT_ACTIVE`.

This upgrades this one P19 operation from the historical P02 `CONTRACT_ONLY` classification to **VERIFIED at current static repository contract/implementation level**. P19 does not claim a live APIM/device runtime exchange test.

---

## 3. Mobile exchange path accepted

The accepted path is:

`Firebase OTP or email authentication`  
→ fresh Firebase ID token  
→ `authService` shared exchange orchestration  
→ `authApi.exchangeFirebaseToken(...)`  
→ `POST /api/v1/auth/firebase/exchange` through `publicApiClient`  
→ `sessionManager.acceptTokenPair(...)`  
→ refresh credential saved in secure storage  
→ access token exposed only in process memory  
→ authenticated identity returned to the existing screen/store boundary.

Both OTP and email authentication use the same CRAVES exchange implementation; P19 does not create a parallel API/session stack.

---

## 4. Correlation, timeout, and public-client behavior

P19 retains the accepted shared HTTP foundation:

- the exchange uses `publicApiClient`, so it does not depend on a pre-existing CRAVES bearer token,
- the request uses the exact 10,000 ms bounded timeout already defined by the auth wrapper,
- the shared request metadata layer attaches `X-Correlation-ID`,
- the shared transport normalizes request/response failures to `AppApiError`, retaining safe backend code/status/correlation evidence,
- no Firebase ID token, access token, refresh token, password, or OTP is logged.

Focused `authApi` tests now lock the exact path, JSON field name, timeout, response passthrough, and normalized-error passthrough.

---

## 5. Fail-closed half-authentication fix

The pre-P19 baseline exchanged and persisted correctly on success, but a failure after Firebase authentication could leave Firebase signed in, and an exchange failure before token-pair acceptance could leave stale local CRAVES credential state untouched.

P19 closes that boundary in `features/auth/state/authService.ts`:

- exchange and secure token-pair acceptance are treated as one authentication boundary,
- if either operation fails, CRAVES local credentials are cleared best-effort,
- Firebase authentication state is signed out best-effort,
- cleanup uses `Promise.allSettled` so cleanup failures cannot mask the original exchange/persistence failure,
- the original normalized API error remains available to the existing UI recovery path,
- screen/store `authenticated(...)` dispatch still occurs only after the exchange and secure token acceptance both succeed.

This prevents a failed exchange from producing a half-authenticated application state.

---

## 6. P10 security boundary preserved

P19 reuses the already accepted P10 `sessionManager` behavior:

- refresh credential is written through platform-secure `refreshTokenStore`,
- access token is process-memory only through `tokenMemory`,
- token acceptance clears stale access memory first,
- the refresh credential is persisted before the new access token becomes available,
- secure-store failure fails closed and clears local credential state.

P19 does not move token ownership into component state, Redux persistence, AsyncStorage, or plain storage.

---

## 7. Changed implementation files

- `apps/mobile/src/features/auth/state/authService.ts`
  - adds fail-closed cleanup around the exchange + token-pair acceptance boundary.
- `apps/mobile/src/features/auth/state/authService.test.ts`
  - adds focused OTP/email exchange success, exchange failure, secure-persistence failure, and missing-phone recovery cleanup coverage.
- `apps/mobile/src/features/auth/api/authApi.test.ts`
  - locks the exact exchange method/path/body/timeout and normalized-error passthrough.

No backend, OpenAPI, APIM, infrastructure, native Android build configuration, or product-screen visual files were changed by P19.

---

## 8. Validation evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`  
Run ID: `31218027179`  
Head SHA: `0005a7751998ec8626f55bfcd4240aacb4c5e4be`  
Conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript `npx tsc --noEmit`,
5. ESLint with zero warnings,
6. Jest including focused P19 tests and prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard against baseline `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`.

Per the rebuild policy, no APK/AAB was produced for this individual phase.

---

## 9. Visual/device QA

P19 is a non-visual authentication/session boundary. No new reference-image implementation is owned by this phase. Physical-device end-to-end auth/runtime validation remains part of later integration/QA gates and is not falsely claimed here.

---

## 10. P19 completion record

```text
Phase: P19 — Firebase → CRAVES Session Exchange
Status: DONE at implementation/static-contract level
Started from commit: 6d70d855b8e62f0d416f8da94ba468d2135e99bf
Validated implementation commit: 0005a7751998ec8626f55bfcd4240aacb4c5e4be
Guide references: global Authentication and Session rules; phone/email authentication requirements
Changed files: authService.ts, authService.test.ts, authApi.test.ts
APIM/contracts used: POST /api/v1/auth/firebase/exchange; FirebaseExchangeRequest; AuthTokenResponse; IdentityResponse
Behavior completed: exact shared exchange, P10 token acceptance, correlation/timeout/error path, fail-closed partial-auth cleanup
Tests/checks: GitHub Actions 31218027179 SUCCESS
Visual QA: not applicable to this non-visual phase; runtime/device certification deferred to later QA
Blockers: none for P19 implementation acceptance; live APIM exchange not claimed
Next phase: P20 — Session Restore and Silent Refresh; NONE AUTHORIZED
```
