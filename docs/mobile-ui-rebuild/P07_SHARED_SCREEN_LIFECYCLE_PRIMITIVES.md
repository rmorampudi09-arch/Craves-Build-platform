# P07 — Shared Screen/Lifecycle Primitives

## Status

**DONE**

P07 was authorized after P06 was confirmed complete. This phase is intentionally limited to shared screen/lifecycle primitives. It does not begin P08 Query/Store Provider and Cache Rules or any Customer/Chef marketplace screen.

## Baseline

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- P06 completion baseline: `3544af1539fa2e3fc18c22c26aee52a5fa747485`
- P07 implementation head: `4a55e1377e3e3dd2fee08a30b5d3e874d32c1680`
- Master guide: `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Phase definition: `phases.md` — P07 Shared Screen/Lifecycle Primitives

## Scope Implemented

P07 establishes the reusable screen/lifecycle layer required by `phases.md` and the master guide:

- runtime safe-area screen shell,
- optional keyboard avoidance,
- optional scroll handling,
- section skeletons,
- list skeletons,
- recoverable error banner,
- terminal state,
- offline notice,
- permission state,
- retry control,
- shared content lifecycle policy for initial loading versus background refresh.

The implementation extends the existing P04 token system and P06 interaction primitives. It does not introduce a second theme, button family, loading spinner system, query client, store, API client, or navigation root.

## Shared Components Added

- `apps/mobile/src/shared/components/ScreenShell.tsx`
- `apps/mobile/src/shared/components/Skeleton.tsx`
- `apps/mobile/src/shared/components/LifecycleStates.tsx`
- `apps/mobile/src/shared/components/ContentLifecycle.tsx`
- `apps/mobile/src/shared/components/index.ts`

## Existing Foundation Migrated

`apps/mobile/src/features/auth/components/AuthShell.tsx` now composes the shared `ScreenShell` while preserving its existing warm background, constrained content width, scrolling behavior, safe-area handling, and keyboard avoidance. This removes duplicate screen-shell ownership without changing auth transport or product flow.

## Lifecycle Policy

`ContentLifecycle` encodes the P07 acceptance rule:

1. If no valid content exists and the request is initially loading, render the caller-provided skeleton.
2. If valid content already exists, keep that content mounted during background refresh.
3. Recoverable errors and offline state are rendered inline above retained valid content when supplied.
4. A terminal state is used only when no valid content exists and the caller explicitly supplies that terminal state.
5. P07 does not force a generic full-screen spinner for every query.

This is presentation/lifecycle infrastructure only. Query caching, stale-time policy, retry policy, cache keys, invalidation, and private-cache clearing remain P08.

## Accessibility and Responsive Behavior

- `ScreenShell` uses `react-native-safe-area-context` runtime insets rather than fixed system-bar heights.
- Keyboard avoidance is reusable and enabled by default, with a configurable vertical offset.
- Skeletons are hidden from accessibility traversal because they are non-content placeholders.
- Initial lifecycle loading exposes progress/busy semantics.
- Recoverable/offline notices expose alert semantics.
- Terminal/permission titles expose heading semantics.
- Retry/actions reuse the P06 shared `Button`, preserving touch targets, loading/disabled handling, press feedback, scalable text, and accessibility state.

## Tests Added

`apps/mobile/__tests__/LifecyclePrimitives.test.tsx` verifies:

- prior valid content remains rendered during background refresh,
- initial loading without prior content uses the skeleton instead of stale/unavailable content,
- reusable section/list skeleton and permission-state primitives render through the shared barrel.

## API / Backend / Storage Impact

**None.**

P07 adds no endpoint, route key, request/response model, authentication contract, cache rule, persisted data, backend implementation, APIM policy, or infrastructure change. P02 contract classifications remain unchanged.

## Validation Evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run ID: `31201252609`
- Head SHA: `4a55e1377e3e3dd2fee08a30b5d3e874d32c1680`
- Conclusion: **SUCCESS**

Successful checks:

1. dependency installation with `npm ci`,
2. strict TypeScript check with `tsc --noEmit`,
3. ESLint with zero warnings,
4. Jest, including the new P07 lifecycle regression suite,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

The workflow intentionally does not produce a Gradle APK during implementation phases.

## Acceptance Mapping

### Safe-area and keyboard foundation

Accepted through reusable `ScreenShell`, using runtime device insets and optional keyboard avoidance/scroll handling. Existing auth shell now consumes this owner.

### Section/list loading skeletons

Accepted through static `SkeletonBlock`, `SectionSkeleton`, and `ListSkeleton` primitives. Static placeholders avoid making continuous shimmer mandatory and remain compatible with the P05 reduced-motion policy.

### Recoverable/terminal/offline/permission/retry states

Accepted through `RecoverableErrorBanner`, `TerminalState`, `OfflineNotice`, `PermissionState`, and `RetryControl`, with actionable handlers supplied by owning features rather than empty callbacks.

### Preserve prior valid content during refresh

Accepted through `ContentLifecycle` and a focused Jest regression test. A background `refreshing` state does not replace already-valid children with a loading fallback.

### No generic full-screen spinner forced on every query

Accepted. The shared lifecycle policy reserves skeletons for initial no-content loading and leaves background refresh presentation to the retained content plus optional inline notices.

## Visual / Device QA Boundary

P07 is a shared infrastructure phase and does not claim completion of any individual master-guide reference screen. Final per-reference visual certification, device-level keyboard/safe-area testing across target Android devices, and complete accessibility QA remain later phases.

## Blockers

None to P07 acceptance.

## Explicitly Deferred

- P08 query/store provider and cache rules,
- stale-time/cache-key/invalidation/private-cache policy,
- P09 HTTP/session/navigation later-phase audits,
- Customer and Chef marketplace screens,
- screen-specific empty-state compositions,
- connectivity listener ownership and offline mutation policy,
- individual reference visual certification,
- APK/AAB release packaging.

## Next Phase

**P08 — Query/Store Provider and Cache Rules is next in sequence, but NONE AUTHORIZED.** Stop after P07 and wait for explicit user authorization before starting P08.
