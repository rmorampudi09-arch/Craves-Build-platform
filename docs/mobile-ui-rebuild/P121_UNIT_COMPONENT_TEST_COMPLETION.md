# P121 — Unit/Component Test Completion

## Phase boundary

- Starting branch: `mobile-ui-rebuild-from-scratch`
- Starting HEAD: `4095f3dce1dc79718c8601769170f14d7a74c99d`
- Authorized phase: **P121 only**
- Next phase: **P122 — Integration Test Completion — not started**

## Requirements rechecked

P121 is limited to closing isolated unit/component test gaps before broader integration testing. The governing plan/phases require coverage for reusable behavior, lifecycle cleanup, accessibility/state behavior, API/error edges, and fragile mutation interactions while keeping the tests isolated from cross-feature integration concerns. The master implementation guide likewise requires unit coverage for core utilities/hooks and interaction/lifecycle behavior before integration/manual QA.

## Existing coverage retained

The current mobile tree already contains focused contract suites for validation and API/error foundations, including auth-domain policy tests, runtime configuration, HTTP foundation/error/retry behavior, security/token storage, query policy, and other feature-domain utilities. P121 does not duplicate those already-covered contracts.

## Gaps closed in P121

### Shared interaction component contracts

Added `apps/mobile/__tests__/SharedInteractionPrimitives.test.tsx` to cover non-trivial reusable behavior in the shared interaction layer:

- `Button` exposes disabled + busy accessibility state while `loading` is true.
- Loading sets the native pressable disabled contract so mutation CTAs cannot accept a duplicate tap while pending.
- Button availability restores when loading ends.
- `SegmentedControl` exposes deterministic selected/unselected tab state.
- Segment selection forwards only the chosen typed value.
- Radio-mode semantics use `radiogroup`/`radio` checked state correctly.
- Group disabling propagates to every segment.

### Session lifecycle cleanup and refresh edges

Added `apps/mobile/src/features/auth/hooks/useSessionLifecycle.test.tsx` to cover lifecycle behavior that previously had no direct hook suite:

- invalidation subscription cleanup on unmount;
- AppState subscription cleanup on unmount;
- pending refresh timer cleanup on unmount;
- sign-out when scheduled refresh returns no session;
- bounded retry after a retriable refresh failure without premature sign-out;
- background transition clears pending refresh work;
- stale foreground resume performs an immediate refresh and resumes scheduling.

These are hook/component tests with mocked dependencies only; they do not test navigation, multiple features, backend/APIM integration, or end-to-end flows.

## CI correction loop

The first P121 source commit, `0c0b26f79af6a21a1e41be033d2995790dd5fac1`, passed TypeScript and ESLint but failed Jest because the new tests made two test-harness assumptions: React Native `Pressable` nodes were queried by renderer node type even though this Jest renderer flattens them, and several lifecycle cases asserted the global Jest timer count even when unrelated renderer timers could exist. No production defect was identified.

The P121-only correction commit, `4a25b31e3df0d29730af853e49f5c7526d1df1b3`, changed only the two new test files. Shared component contracts are now asserted directly from the component elements, and lifecycle cases assert observable refresh timing/dispatch behavior while retaining the dedicated teardown timer assertion.

## Production impact

No production/runtime source, dependency, backend, APIM, OpenAPI, infrastructure, navigation, persistence, or product contract is changed by P121. The phase adds isolated test coverage and evidence only.

## Validation result

`CRAVES Mobile Implementation CI` run **#470** / run ID **31376209595** validated commit `4a25b31e3df0d29730af853e49f5c7526d1df1b3` successfully.

Passed gates:

- dependency install (`npm ci`);
- TypeScript strict check (`npx tsc --noEmit`);
- ESLint with zero warnings;
- full Jest suite — **131 suites, 592 tests, all passing**;
- production Android JavaScript bundle;
- backend-source unchanged guard.

The earlier run #469 failure is superseded by run #470 after the P121-only test correction and is retained above as correction evidence rather than hidden.

## P121 acceptance mapping

1. **Non-trivial reusable UI behavior:** covered directly for shared Button and SegmentedControl contracts, with existing lifecycle primitives retained.
2. **Lifecycle cleanup:** covered directly for invalidation subscription, AppState listener, and refresh timer teardown.
3. **Mutation edge behavior:** covered at the reusable CTA boundary through pending/loading duplicate-tap blocking and restoration after completion.
4. **State/accessibility behavior:** selected/disabled/busy/checked semantics are asserted at component level.
5. **API/error behavior:** session refresh null-session and retriable-error paths are asserted at hook level; existing HTTP/API-error suites remain in place.
6. **Isolation from P122 integration scope:** tests mock external dependencies and do not cross feature boundaries.
7. **Repository validation:** the corrected P121 commit passes the complete configured mobile CI gate.

## Stop boundary

P121 is complete at the authorized unit/component test + CI scope. **P122 is not implemented or modified in this phase.**
