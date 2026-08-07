# P20 — Session Restore and Silent Refresh

## Status

**DONE at mobile implementation/static-contract level.**

P20 was authorized after P19 was verified complete. This phase is limited to startup session restoration, refresh-token rotation lifecycle, proactive silent access-token refresh, wrong-auth-root flash prevention, and stale/invalid refresh-credential recovery. P21 identity/role/onboarding authority is explicitly not included.

## Starting point

- Branch: `mobile-ui-rebuild-from-scratch`
- Started from commit: `6e54098622367e7b4a35173ef3946f62007d16c7`
- P20 implementation commit: `52499ea6bf59e877d2f618e7b51b6039f8f68176`
- Lint-gate correction / validated implementation commit: `fbaee4352d119140ee8a859583478860ee7b6267`

## Governing sources audited

P20 was implemented against the current branch copies of:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `docs/mobile-ui-rebuild/P10_SESSION_TOKEN_SECURITY_FOUNDATION.md`
- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`

The master implementation guide requires required session state to be hydrated during startup, access credentials to remain memory-only, refresh credentials to remain in secure storage, silent refresh through the shared auth flow, and a valid restored session to avoid flashing the login/wrong root first.

## Exact refresh contract

P20 uses the existing current repository contract only:

- Method/path: `POST /api/v1/auth/refresh`
- Request model: `RefreshTokenRequest`
- Request JSON field: `refreshToken`
- Success model: `AuthTokenResponse`
  - `tokenType`
  - `accessToken`
  - `expiresIn`
  - `refreshToken`
  - `refreshTokenExpiresAt`
  - `identity`
- Terminal contract outcomes include invalid, expired, or revoked refresh credentials.

The current OpenAPI and Spring Auth Service implementation agree on this rotation behavior. P20 therefore accepts the route at current **static repository contract/implementation level only**. No live APIM/device refresh call is claimed by this phase.

## Accepted architecture ownership

P20 keeps the existing architecture instead of creating a parallel session system:

- `core/security/tokenMemory.ts` — process-memory access token and refresh-due timing.
- `core/security/refreshTokenStore.ts` — platform-secure refresh credential persistence.
- `features/auth/api/sessionManager.ts` — token-pair acceptance, startup restore, refresh rotation, one-refresh-in-flight coalescing, invalidation and local credential clearing.
- `features/auth/hooks/useBootstrap.ts` — startup restore state publication.
- `features/auth/hooks/useSessionLifecycle.ts` — authenticated proactive/foreground silent-refresh scheduling.
- `app/navigation/AppNavigator.tsx` — splash/error gate before auth/account roots render.

## Behavior completed

### Startup restore and wrong-root flash prevention

- Startup remains on `SplashScreen` while bootstrap is `idle`/`restoring`.
- The navigation container/auth root is not rendered until restore resolves, so the login root is not flashed before a valid saved session is evaluated.
- A valid secure refresh credential is rotated on startup through the shared session manager and publishes the returned identity only after the new refresh credential has been persisted securely.
- Missing/expired/rejected credentials resolve safely to anonymous/sign-in rather than publishing stale authenticated state.

P20 deliberately does not decide authoritative Customer/Chef/onboarding routing. That remains P21.

### Proactive silent refresh

- Access-token memory now exposes the bounded time remaining until the existing 30-second refresh safety window.
- Once bootstrap is authenticated, one lifecycle hook schedules refresh before server access-token expiry.
- The timer is paused while the application is backgrounded/inactive.
- When the app returns active, a still-fresh token is rescheduled; a stale token triggers immediate shared refresh.
- Refresh continues to use the existing single in-flight `refreshPromise`, preventing concurrent startup/401/timer refresh storms.

### Rotation and failure behavior

- Rotated refresh credentials are persisted before the new access token is exposed in memory.
- Invalid, expired, revoked, or other terminal refresh failures clear local session credentials and publish runtime session invalidation so the app returns to sign-in.
- A missing refresh credential invalidates an already-authenticated runtime session.
- Secure persistence failure after rotation fails closed and invalidates the session.
- Transient network/5xx/retriable refresh failures **do not delete an otherwise valid secure refresh credential**. This allows startup retry or a later silent refresh to recover without forcing a needless re-login.

### Startup recovery UX

- `Try again` keeps the saved refresh credential available after a transient restore failure and restarts bootstrap.
- `Go to sign in` explicitly discards retained local CRAVES/Firebase authentication state before publishing anonymous state.
- The sign-in escape action has a loading/duplicate-tap guard.

## Changed implementation files

Validated P20 implementation changes are limited to:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/core/security/tokenMemory.ts`
- `apps/mobile/src/core/security/tokenMemory.test.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`
- `apps/mobile/src/features/auth/api/sessionManager.test.ts`
- `apps/mobile/src/features/auth/hooks/useSessionLifecycle.ts`
- `apps/mobile/src/features/auth/screens/StartupErrorScreen.tsx`
- `apps/mobile/src/features/auth/state/authService.ts`
- `apps/mobile/src/features/auth/state/authService.test.ts`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, Customer/Chef product screen, or P21 source was changed.

## Focused test coverage

P20 adds/extends coverage for:

- access-token refresh-due timing and invalid lifetime fail-safe behavior,
- refresh-token persistence before access-token publication,
- local expired refresh rejection without backend traffic,
- refresh rotation ordering,
- one in-flight refresh coalescing,
- terminal backend refresh rejection and invalidation,
- preservation of secure refresh state on transient network failure,
- authenticated runtime invalidation when refresh credentials disappear,
- rotated refresh persistence failure fail-closed behavior,
- explicit startup-recovery local/Firebase cleanup.

## Validation

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated head:

- `fbaee4352d119140ee8a859583478860ee7b6267`
- GitHub Actions run: `31219378437`
- Conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including P20 session tests and prior auth regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

An earlier implementation run (`31219237307`) reached successful strict TypeScript but failed the zero-warning lint gate on three `no-void` warnings. The warnings were corrected in `fbaee4352d119140ee8a859583478860ee7b6267`; the complete rerun above passed all gates.

## Deferred / not claimed

P20 does not claim or implement:

- P21 authoritative identity/role/onboarding resolution,
- Customer Home or Chef Dashboard product shells,
- complete logout/revoke/private-cache cleanup (P24),
- live APIM/device refresh certification,
- APK/AAB packaging,
- physical-device visual certification.

## Next phase

The sequence names **P21 — Identity, Role, and Onboarding Resolution** next.

**Next phase authorization: NONE AUTHORIZED. Stop after P20.**
