# P09 — Typed HTTP Client Foundation

## Scope

P09 formalizes the mobile transport boundary required by `phases.md` and the master implementation guide. It does not implement P10 session-storage policy, new backend/APIM contracts, or product-screen data flows.

## Implemented boundary

- `core/http/transport.ts` is the only low-level Axios instance factory. It applies the runtime API base URL, the shared 12-second default timeout, and a correlation ID to every request.
- Authenticated requests use `apiClient.ts`, which injects the current process-memory access token and retains the existing single refresh/replay behavior for one 401.
- Firebase token exchange, refresh rotation, and logout now use the centralized unauthenticated transport rather than creating feature-local Axios calls. This avoids authenticated-interceptor recursion while keeping timeout/correlation/error behavior centralized.
- `httpClient.ts` provides typed data-returning read/write helpers. Reads support an explicit `dedupeKey`; identical keyed in-flight reads share one promise and the key is released when the request settles.
- Cancellation is normalized as `REQUEST_CANCELLED` and is never retried.
- Transient retry is conservative and bounded: at most one retry, only for GET/HEAD/OPTIONS, and only for 408/429/500/502/503/504 or recognized network/timeout transport codes. Mutations are not automatically retried.
- Retries preserve the original correlation ID so one logical operation remains traceable across attempts.
- HTTP errors are normalized to `AppApiError` with safe code/status/correlation/retriable/cancelled fields. Server 5xx content and stack-like backend messages are replaced by public-safe copy.

## Acceptance evidence

Focused Jest coverage in `core/http/httpFoundation.test.ts` verifies bearer/correlation metadata, bounded safe-method retry rules, cancellation normalization, stack-trace suppression, safe validation messages, and opt-in in-flight request coalescing.

Current authentication/profile API wrappers no longer import Axios directly; special unauthenticated auth operations route through `core/http/transport.ts`. No screen-level direct Axios/fetch call was introduced by P09.

## Explicit non-goals

- No change to where access or refresh tokens are stored.
- No new proactive refresh scheduling.
- No logout/private-cache orchestration changes.
- No new APIM routes, backend contracts, environment values, or screen behavior.
- No APK/Gradle packaging in this phase; validation remains code-level per the rebuild policy.
