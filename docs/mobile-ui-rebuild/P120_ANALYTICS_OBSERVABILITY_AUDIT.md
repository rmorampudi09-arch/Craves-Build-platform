# P120 — Analytics/Observability Audit

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Starting HEAD:** `373787fc1ecc29877f405aa5cd9c35b04511dad2`  
**Final source head:** `ca090d2197627c8ab10eab56d2aaee8f5b6b5776`  
**Scope:** P120 only. P121 was not started.

## Status

**PARTIAL at full production/staged-observability scope; source-level privacy-safe observability boundary and critical-flow instrumentation are implemented.**

The full Guide acceptance cannot truthfully be marked DONE because the current mobile dependency set contains Firebase App/Auth but no approved analytics, crash-reporting, or performance-export SDK/provider. P120 does not invent or silently add a production telemetry vendor, project configuration, consent policy, native configuration, or remote endpoint.

## Sources re-read

Before P120 implementation the authoritative branch and control sources were rechecked:

- `agent.md`;
- `build.md`;
- `phases.md` — P120 is `Analytics/Observability Audit` with screen/action events, crash reporting, correlation IDs, performance traces, and privacy filtering;
- `plan.md` — Analytics and Observability Plan plus Security/Privacy constraints;
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, including the technology-stack observability requirement and staged-production readiness rules;
- current mobile HTTP/session/navigation dependencies and source;
- P119 APIM contract-coverage evidence and current branch HEAD.

## Implemented observability boundary

Added `apps/mobile/src/core/observability/observability.ts` as the single mobile abstraction for:

- screen-view events;
- meaningful action events;
- session events;
- network events;
- performance traces;
- exception capture;
- provider installation through `setObservabilitySink(...)`.

The default state is deliberately no-op. Provider failures are isolated and can never break product behavior. No duplicate analytics stack and no hard-coded telemetry endpoint was introduced.

## Privacy filtering

The central boundary rejects sensitive attribute keys including password/passcode/OTP/token/auth/cookie/secret/credential/card/CVV/UPI/bank/address/coordinate/document/email/phone/payload/body families.

Additional safeguards:

- only finite numbers, booleans, null, and bounded strings are accepted;
- nested objects/arrays are dropped;
- sensitive-looking string values such as email addresses, bearer values, phone-like values, and JWT-like values are redacted even under generic keys;
- control whitespace is normalized;
- raw exception messages and stacks are never exported by `captureException`;
- sink failures are swallowed at the observability boundary to avoid product or logging-loop failures.

Focused tests cover key filtering, generic-value redaction, bounded strings, sink isolation, no raw exception-message export, and one-shot performance-trace completion.

## Screen views and action events

`AppNavigator` observes the active React Navigation route centrally on ready/state changes. Only the route name and coarse product role (`CUSTOMER`, `CHEF`, or `AUTH`) are emitted; route params/resource IDs are not exported.

Inbound-link observation records only whether a link was initial and recognized. The raw URL is never emitted.

Protected backend writes through the existing `httpClient` are classified as mutation action start/success/failure events using only HTTP method and a privacy-sanitized route. Request payloads are never included.

This covers the current authenticated cart/checkout/payment/order/Chef operational mutation boundary without editing each feature into a competing analytics implementation.

## Correlation IDs and network performance

The existing `X-Correlation-ID` ownership remains in `requestMetadata.ts`. P120 reuses that boundary rather than generating a second tracing identifier.

`networkObservability.ts` is wired into the centralized Axios transport for both authenticated and public clients. Per request attempt it records:

- method;
- privacy-sanitized route;
- existing correlation ID;
- completion outcome;
- HTTP status when present;
- duration through the shared performance-trace abstraction.

Network route sanitization removes query strings/fragments and replaces numeric, UUID, email-like, and unusually long dynamic path segments. Request/response bodies and headers are never included.

Existing P117 retry/cancellation ownership is unchanged. Retries remain governed by the existing safe-read/auth recovery policy; P120 only observes each actual transport attempt.

### P119 cross-phase guard preservation

The final sanity pass found that P119 intentionally forbids any Axios import outside `core/http`, including type-only imports. The first P120 network-observer version used an Axios config type outside that directory. Before phase handoff, P120 removed that import and replaced it with a minimal structural request-config interface while keeping the same behavior. Final source head `ca090d2197627c8ab10eab56d2aaee8f5b6b5776` therefore preserves the P119 centralized Axios boundary rather than weakening the prior guard.

No new `httpClient`/`publicApiClient` action, direct backend host, gateway credential literal, or quarantined Chef earnings route was introduced by P120.

## Auth/session observability

`sessionManager` reports coarse privacy-safe events for:

- refresh start;
- refresh success;
- refresh failure;
- session establishment;
- local session clear;
- explicit invalidation reasons already represented by the existing controlled enum.

Refresh timing uses the shared performance-trace abstraction. Transient refresh failures can report only safe status/retriable metadata and exception type; credentials and raw error messages are not exposed.

## Crash observation boundary

`globalErrorObservation.ts` installs a React Native global JavaScript error observer at app registration time and delegates to the pre-existing global handler after capture. This preserves existing crash behavior.

`captureException` exports only a controlled event name, error type, timestamp, and sanitized attributes. It intentionally excludes raw error message/stack content.

A production crash-reporting exporter is **not** claimed because no approved crash SDK/provider is currently installed/configured in the inspected mobile dependency/native boundary.

## Deterministic P120 guard

Added:

- `apps/mobile/scripts/p120-observability-audit-check.mjs`;
- `apps/mobile/package.json` script `npm run check:p120`.

The guard checks that the central privacy filter, network correlation/performance hooks, backend-mutation action hook, session hook, route screen-view hook, global error hook, and app installation remain wired. It also rejects raw console telemetry in the observability runtime and raw `error.message`/`error.stack` export from the central boundary.

## Acceptance classification

### Implemented at source level

- Screen views: centrally wired without route params.
- Action events: protected backend mutations and inbound routing are observable without payload/URL leakage.
- Auth/session failures: centrally observable with controlled reasons/status only.
- Correlation IDs: existing request correlation is reused in network observations.
- Performance traces: network attempts and session refresh have timing boundaries.
- Crash capture: uncaught JS errors enter a privacy-safe provider-neutral capture boundary before the existing handler runs.
- Privacy filtering: central key/value/error/network-route filtering plus focused tests and static guard.

### Remaining blockers for full P120 DONE

1. **No approved production observability exporter/provider is installed/configured.** Current dependencies include Firebase App/Auth but not an analytics, crash-reporting, or performance-export module. P120 does not guess the provider choice or native credentials/configuration.
2. **Staged-production enablement cannot be verified** until an approved sink is connected and its environment/consent/privacy configuration is defined.
3. **Provider/device runtime validation is not claimed.** No crash upload, analytics delivery, remote trace, provider dashboard, or device network-correlation session was executed from this connector-only run.
4. The source-level semantic action taxonomy is intentionally limited to centrally observable critical boundaries rather than fabricating an exhaustive product-analytics taxonomy without an approved analytics specification.

## Validation performed in this run

Performed through authoritative repository inspection:

- re-read the current P120 definition and control docs;
- confirmed no existing mobile analytics/crash/performance provider dependency before adding the provider-neutral abstraction;
- re-read modified source after writes;
- compared branch changes from P120 starting HEAD and confirmed the implementation delta is confined to mobile observability/navigation/http/session/test/guard/evidence/ledger files;
- manually reconciled the deterministic `check:p120` markers with the current source;
- reconciled the final source against the P119 Axios-import/transport guard and removed the one type-only cross-boundary import before handoff.

### CI state at evidence refresh

GitHub Actions automatically started **CRAVES Mobile Implementation CI run #468 / ID `31373594216`** for final source head `ca090d2197627c8ab10eab56d2aaee8f5b6b5776`.

At this evidence refresh:

- checkout/setup: PASS;
- dependency installation: PASS;
- TypeScript strict check: PASS;
- ESLint: PASS;
- Jest: still running;
- production Android JavaScript bundle: not yet claimed;
- backend/APIM/infrastructure source guard: not yet claimed;
- overall workflow: still in progress.

Therefore this evidence does **not** label the complete workflow as passing.

Not claimed:

- local `npm run check:p119` execution;
- local `npm run check:p120` execution;
- complete run #468 success unless a later ledger/evidence refresh records it;
- device/emulator/provider runtime verification.

The connector-only environment does not provide a local repository checkout. P120 records only validation actually observed from repository/CI state.

## Changed files

Production/runtime:

- `apps/mobile/index.js`
- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/core/http/httpClient.ts`
- `apps/mobile/src/core/http/transport.ts`
- `apps/mobile/src/core/observability/observability.ts`
- `apps/mobile/src/core/observability/networkObservability.ts`
- `apps/mobile/src/core/observability/globalErrorObservation.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`

Focused tests/guards:

- `apps/mobile/src/core/observability/observability.test.ts`
- `apps/mobile/src/core/observability/networkObservability.test.ts`
- `apps/mobile/scripts/p120-observability-audit-check.mjs`
- `apps/mobile/package.json`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P120_ANALYTICS_OBSERVABILITY_AUDIT.md`
- `build.md`

## Phase boundary

P120 stops here. **P121 — Unit/Component Test Completion was not started or modified.**
