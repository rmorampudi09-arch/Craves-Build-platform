# P122 — Integration Test Completion

**Phase:** P122  
**Status:** DONE at authorized integration-test + CI scope  
**Starting branch HEAD:** `e8b8a0def1b35cfb911e2e04e6897fb7e654e8d4`  
**Validated implementation head:** `b4693bffcb074ea065937b5b286daf77c07db61a`  
**Branch:** `mobile-ui-rebuild-from-scratch`

## Objective

Prove the cross-feature integration seams required by `phases.md` without starting P123 device/E2E regression work and without changing production runtime behavior.

The phase is intentionally test/tooling-only. Existing production navigation, auth/session, query/cache, cart, notification, Chef order, backend, APIM, OpenAPI, infrastructure, and dependency contracts are preserved.

## Required P122 Coverage

| P122 requirement | Integration evidence |
|---|---|
| Navigation/auth restore | `P122CrossFeatureFlows.test.ts` composes authenticated account resolution with versioned process restoration and typed nested navigation. Existing `inboundRouting.test.ts`, `processRestoration.test.ts`, and `sessionManager.test.ts` remain in the dedicated integration command. |
| Role switch | The P122 seam test proves Chef-private query state is removed before Customer resolution, Customer-scoped query state is preserved, identity remains authenticated, stale Chef routing is deferred, and the existing `chefProfileRoleSwitch.test.ts` remains in the integration command. |
| Cart sync/persistence | The P122 seam test restores the authoritative server cart snapshot, then applies a quantity mutation and proves the final item count and food subtotal come from the server response. Existing cart reconciliation tests remain in the integration command. |
| Location invalidation | The P122 seam test changes the integration boundary through `invalidateCustomerLocationDependentQueries` and proves both Customer Home and nearby-Chef discovery query domains are invalidated together. |
| Notification routing | The P122 seam test resolves an allowlisted ORDER notification and proves it reaches the same authenticated Customer order-detail destination as the typed inbound route. Existing notification and inbound-routing tests remain in the integration command. |
| Chef status transitions | The P122 seam test executes a guarded Chef accept decision, reconciles a newer operational PREPARING snapshot, and proves an older acceptance-pending snapshot cannot regress the cached lifecycle. Existing decision/event-reconciliation tests remain in the integration command. |

## Changed Files

- `apps/mobile/__tests__/integration/P122CrossFeatureFlows.test.ts`
- `apps/mobile/package.json`
- `docs/mobile-ui-rebuild/P122_INTEGRATION_TEST_COMPLETION.md`
- `build.md` (completion ledger append follows this evidence commit)

## Dedicated Integration Command

`apps/mobile/package.json` now exposes `npm run test:integration`, selecting the P122 cross-feature suite plus the existing integration-grade navigation/restoration/session/role/cart/location/notification/Chef-order specs. This provides a stable focused command without creating a second Jest configuration or duplicate test architecture.

## Validation

**CRAVES Mobile Implementation CI** run **#471** / ID `31378804041` validated implementation commit `b4693bffcb074ea065937b5b286daf77c07db61a` successfully.

Passed gates:

- dependency install from lockfile,
- TypeScript strict check,
- ESLint with zero warnings,
- Jest: **132 suites / 598 tests passed**,
- `PASS __tests__/integration/P122CrossFeatureFlows.test.ts`,
- production Android JavaScript bundle generation,
- backend/APIM/infrastructure source guard.

The repository's already-recorded Jest post-run open-handle warning remains after all tests pass; P122 does not hide it or expand into unrelated cleanup. Existing React test `act(...)` console warnings from earlier lifecycle tests are likewise not reclassified as P122 defects because CI and those suites remain green.

The exact `npm run test:integration` script was not added as a separate CI step in this phase; its constituent suites, including the dedicated P122 suite, ran and passed under the full Jest CI gate. The normal full-suite CI remains the authoritative acceptance run.

## Contract / Security Boundary

- No new endpoint, method, route key, request/response schema, status enum, auth rule, pagination rule, or idempotency rule was invented.
- Integration tests compose the existing typed mobile boundaries and mock transport only where the existing unit/integration architecture already owns transport replacement.
- No backend, APIM, OpenAPI, infrastructure, database, native provider, dependency, persistence, or production runtime source changed.
- Role isolation remains fail-closed during Chef-to-Customer transition.
- Notification/deep-link tests use allowlisted typed destinations and UUID resource identifiers only.

## Visual / Device Scope

P122 is a code-level integration-test phase. Visual/device certification is not claimed and belongs to later authorized regression/certification phases.

## Acceptance

- **PASS — Integration suite:** the dedicated P122 cross-feature suite and its supporting integration-grade suites are green inside the successful full Jest CI run.
- **PASS — Auth/session/cart persistence flows:** authenticated process restoration, role isolation, server cart restoration, and authoritative mutation reconciliation are proven at the current mobile contract boundary.
- **PASS — Cross-feature synchronization:** location invalidation, notification routing, and Chef order lifecycle reconciliation are proven without production-source changes.

**P122 status:** **DONE at authorized integration-test + CI scope.**

**Next phase in sequence:** **P123 — Mobile E2E Regression Completion — NOT STARTED.**

**Next phase authorization:** **NONE.**

**Required action:** Stop. Do not pre-implement P123.
