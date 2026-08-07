# P10 — Session Token Security Foundation

## Scope

P10 audits and hardens the existing mobile session-token boundary required by `phases.md`, `plan.md`, `agent.md`, and the 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.

The master guide requires access credentials to remain in process memory, refresh credentials to remain only in platform-secure storage, sensitive session state to be cleared on logout/failure, and session restoration/rotation to be testable without creating a parallel authentication architecture.

P10 does not add product screens, proactive refresh scheduling, root-navigation policy, backend/APIM implementation, or new authentication endpoints.

## Accepted ownership

- `core/security/tokenMemory.ts` remains the sole process-memory access-token owner.
- `core/security/refreshTokenStore.ts` remains the sole persisted refresh-credential owner and continues to use `expo-secure-store`, which is the project-approved React Native CLI native secure-storage module.
- `features/auth/api/sessionManager.ts` remains the single token-pair acceptance, restore/refresh rotation, single-flight refresh, and local credential-clearing owner.
- `core/http/apiClient.ts` continues to read only the process-memory access token and delegates 401 refresh to `sessionManager`; P10 does not introduce another interceptor/session store.

## Security hardening implemented

### Access token

- Access tokens remain process-memory only through `tokenMemory`.
- No access token is written to AsyncStorage, general-purpose storage, route params, or logs.
- The existing 30-second freshness safety window remains in place and is covered by focused tests.

### Refresh credential storage

- Refresh token plus expiry metadata are now persisted as one serialized secure-store record (`craves_refresh_session_v1`) instead of two independent secure-store writes.
- The single-record format removes the previous partial-write state where token and expiry could diverge.
- Existing development installs using the previous `refresh_token` / `refresh_token_expires_at` secure keys are migrated once into the current record and the legacy keys are removed.
- Malformed or incomplete persisted refresh state fails closed and is removed rather than being used.
- Invalid refresh-session metadata is rejected before persistence.
- `clear()` attempts deletion of the current and both legacy secure keys together.

### Token-pair acceptance and rotation

- A newly issued/rotated refresh credential is successfully persisted before its access token is exposed in process memory. This prevents a half-authenticated state when secure persistence fails.
- Refresh-session expiry is checked before a refresh request. Expired persisted credentials are cleared locally and are not sent to the backend.
- Refresh rotation still uses one shared in-flight promise, so concurrent 401/startup callers coalesce into one rotation attempt.
- Any refresh failure clears the process-memory access token and performs best-effort secure refresh-state cleanup before the original error is surfaced.
- Local session cleanup clears both memory and secure refresh state.

## Focused tests

P10 adds/extends Jest coverage for:

- `core/security/tokenMemory.test.ts`
  - process-memory lifecycle,
  - freshness safety window,
  - immediately stale short-lived tokens.
- `core/security/refreshTokenStore.test.ts`
  - one-record secure persistence,
  - current record loading,
  - legacy secure-key migration,
  - malformed-state fail-closed behavior,
  - invalid metadata rejection,
  - complete secure cleanup.
- `features/auth/api/sessionManager.test.ts`
  - secure persistence before access-token publication,
  - failure cleanup during token-pair acceptance,
  - expired refresh rejection without backend traffic,
  - refresh rotation ordering,
  - single in-flight refresh coalescing,
  - refresh failure cleanup,
  - local logout cleanup.

## Contract / backend boundary

P10 does not change the current mobile refresh path or request/response model. The existing code still uses:

- `POST /api/v1/auth/refresh`

Per accepted P02 evidence, this operation remains `CONTRACT_ONLY`; current repository backend/APIM runtime evidence does not prove the versioned route is operational. P10 validates client-side credential security and rotation ownership only and does not claim end-to-end refresh runtime verification.

No backend, APIM, infrastructure, route key, request field, response field, environment value, or server business rule is added or changed.

## Explicit non-goals / later phases

- Proactive refresh scheduling and startup UX/root-flash behavior remain P20.
- Full logout/revoke plus private query/store cleanup orchestration remains P24.
- Root navigation and role-separated route policy remains P11.
- Firebase-to-CRAVES exchange acceptance remains P19.
- No APK/Gradle packaging is added; P10 follows the existing code-level CI policy.
