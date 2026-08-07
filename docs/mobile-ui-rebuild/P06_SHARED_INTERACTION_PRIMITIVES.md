# P06 — Shared Interaction Primitives

## Status

**DONE**

P06 was authorized after P05 was confirmed complete. This phase is intentionally limited to shared interaction primitives. It does not begin P07 Shared Screen/Lifecycle Primitives or any Customer/Chef marketplace screen.

## Baseline

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- P05 implementation baseline: `53f27fd405208cdd6b740124c0901857d04bd8fd`
- P06 implementation head: `6d9578c1b2d60362ee124f162e4d046d7b471fdc`
- Master guide: `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Phase definition: `phases.md` — P06 Shared Interaction Primitives

## Scope Implemented

P06 establishes the cross-feature interaction layer required by `phases.md`:

- buttons,
- icon buttons,
- pressable cards,
- inputs,
- validation/error/helper messaging,
- chips,
- segmented controls,
- badges,
- loading indicators.

The implementation extends the existing P04 design-token and P05 motion/reduced-motion owners rather than creating a parallel component or animation system.

## Shared Components Added

- `apps/mobile/src/shared/components/Button.tsx`
- `apps/mobile/src/shared/components/IconButton.tsx`
- `apps/mobile/src/shared/components/PressableCard.tsx`
- `apps/mobile/src/shared/components/InputField.tsx`
- `apps/mobile/src/shared/components/Chip.tsx`
- `apps/mobile/src/shared/components/SegmentedControl.tsx`
- `apps/mobile/src/shared/components/Badge.tsx`
- `apps/mobile/src/shared/components/LoadingIndicator.tsx`
- `apps/mobile/src/shared/components/index.ts`

## Existing Foundation Migrated

To avoid duplicate interaction implementations while preserving P05-era authentication behavior:

- `apps/mobile/src/features/auth/components/PrimaryButton.tsx` is now a compatibility wrapper over the shared `Button` and preserves auth-specific spacing.
- `apps/mobile/src/features/auth/components/InputField.tsx` is now a compatibility wrapper over the shared `InputField` and preserves auth-specific spacing.
- `apps/mobile/src/features/auth/components/RoleSelector.tsx` now composes the shared typed `SegmentedControl`.
- `apps/mobile/src/design/tokens.ts` now owns the soft semantic status surfaces used by badges (`successSoft`, `warningSoft`, `errorSoft`, `infoSoft`) so the shared component does not introduce one-off status colors.

## Acceptance Mapping

### Minimum interaction targets

- Buttons use the existing `56 dp` comfortable target.
- Icon buttons, chips, segmented-control segments, pressable cards, and interactive input affordances use at least the existing `48 dp` Android-first minimum.
- Input controls preserve the existing comfortable field height and use a full-size icon-button target for interactive trailing icons.

### Press feedback

- Buttons, icon buttons, cards, and chips provide immediate opacity feedback.
- Non-essential scale feedback is suppressed when the existing platform reduced-motion preference is enabled.
- Segmented controls use immediate static selected-state feedback without requiring animation.

### Disabled/loading semantics

- Buttons and icon buttons block duplicate presses while disabled or loading and publish accessibility `disabled` / `busy` state.
- Loading state uses the shared `LoadingIndicator` rather than an empty or screen-specific handler abstraction.
- Inputs expose disabled/editable state consistently.

### Accessibility roles/states

- Buttons, icon buttons, pressable cards, chips, and segmented options expose button roles and relevant selected/disabled/busy state.
- Loading indicators expose a progress role and polite live-region semantics.
- Validation errors use an alert role.
- Interactive input icons require a meaningful accessibility label.
- Text keeps React Native font scaling enabled through the accepted P04 token policy.

### No empty handler abstraction

Every interactive primitive requires or receives a concrete handler where interaction exists. Loading/disabled state prevents handler execution rather than substituting no-op callbacks.

## API / Backend / Storage Impact

**None.**

P06 adds no endpoint, route key, request/response model, authentication contract, cache rule, storage behavior, backend implementation, APIM policy, or infrastructure change. P02 contract classifications remain unchanged.

## Validation Evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run ID: `31199569464`
- Head SHA: `6d9578c1b2d60362ee124f162e4d046d7b471fdc`
- Conclusion: **SUCCESS**

Successful checks:

1. dependency installation with `npm ci`,
2. strict TypeScript check with `tsc --noEmit`,
3. ESLint with zero warnings,
4. Jest,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

The workflow intentionally does not produce a Gradle APK during implementation phases.

## Visual / Device QA Boundary

P06 is a shared-component foundation phase and does not claim completion of an individual master-guide reference screen. Final per-reference/device visual certification and device-level accessibility QA remain in the later screen and QA phases.

## Blockers

None to P06 acceptance.

## Explicitly Deferred

- P07 safe-area/lifecycle/skeleton/error/offline/permission/retry primitives,
- query/store cache policy,
- HTTP/session/navigation later-phase audits,
- Customer and Chef marketplace screens,
- individual reference visual certification,
- APK/AAB release packaging.

## Next Phase

**P07 — Shared Screen/Lifecycle Primitives is next in sequence, but NONE AUTHORIZED.** Stop after P06 and wait for explicit user authorization before starting P07.
