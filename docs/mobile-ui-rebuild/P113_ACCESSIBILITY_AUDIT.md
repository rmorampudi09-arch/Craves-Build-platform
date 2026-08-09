# P113 — Accessibility Audit

## Scope and authorization

This run implements **P113 only** on `mobile-ui-rebuild-from-scratch`.

The branch ledger still ends at P111, while the user explicitly reported P112 as partially completed and authorized the next phase. P113 does **not** reclassify P112, fabricate P112 evidence, or modify lifecycle product behavior beyond accessibility semantics on existing lifecycle surfaces.

P113 scope from `phases.md`:

- labels and roles
- selected / disabled / loading states
- logical focus order
- contrast
- touch targets
- dynamic type
- error announcements

Acceptance requires critical flows to be usable with screen reader and font scaling. This connector-only run implements the code-level audit/remediation boundary; real TalkBack/VoiceOver and device font-scaling validation remains explicitly unclaimed.

## Sources reviewed

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- React Native 0.85 accessibility API documentation
- shared mobile design tokens and interaction primitives
- Customer global header/location selector
- Chef global header/menu/notification surfaces
- auth role selector and discovery search input
- shared lifecycle/loading/error states

## Implemented accessibility boundary

### 1. Contrast contracts without replacing the approved brand accent

The approved `colors.flameRed` remains exactly `#F62E18` for brand accents and non-text UI where the lower non-text contrast threshold applies.

For normal-sized text, the Guide requires 4.5:1. White against exact Flame Red is below that target, so P113 adds `flameRedAccessible` (`#D92714`) for text-bearing red surfaces and red action text. Shared primary buttons, selected chips/segments, notification counters, and audited shell action copy use that text-safe token.

Semantic badge foregrounds now use darker success/warning/info text tokens against their existing soft semantic surfaces. Secondary and placeholder text tokens were also tightened so normal text remains readable on the project warm/white surfaces.

A focused pure Jest contract test records the color-ratio, scalable-text, and 48 dp touch-target invariants.

### 2. Shared control semantics

- `SegmentedControl` now exposes tab vs radio option semantics and the corresponding selected/checked states.
- Auth role selection uses radio semantics and explicit account-type labels.
- `Chip` exposes toggle-button + checked state only when it is actually selectable; action-only chips remain buttons.
- `PressableCard` no longer announces every action card as “not selected”; selected state is exposed only when the caller supplies selection state.
- Buttons and icon buttons retain disabled/busy state while suppressing their nested spinner from becoming a duplicate screen-reader stop.
- Discovery search now exposes the search role.

### 3. Loading, error, offline, and terminal announcements

- Shared loading indicators expose progress/busy semantics and a polite live region when standalone.
- Initial skeleton content is hidden from the accessibility tree while the parent announces loading.
- Nested loading indicators inside accessible buttons are deliberately hidden to prevent duplicate announcements.
- Recoverable errors and field validation errors use assertive Android live-region behavior plus alert semantics.
- Offline notices and terminal-state transitions use polite announcements.

### 4. Customer shell focus-order fix

`CustomerLocationSelector` previously used a focusable backdrop Pressable containing another Pressable sheet and all sheet controls. Touchable parents are accessibility elements by default, and nested accessible elements can collapse/obscure descendants for VoiceOver/TalkBack.

P113 replaces that nesting with:

- a non-accessible absolute backdrop dismissal target
- a sibling modal sheet with `accessibilityViewIsModal`
- iOS accessibility escape dismissal
- a real heading
- accessible loading/retry state
- radio semantics for saved-address selection

The prior empty `onPress={() => undefined}` sheet interception is removed.

### 5. Chef shell focus-order and state fixes

The Chef workspace menu had the same nested-backdrop pattern. P113 uses the same sibling backdrop/panel model, keeps menu rows independently focusable, adds modal/escape semantics, and preserves the existing visual layout.

Chef notification loading/error/retry/mark-read states now expose progress, alert, disabled, and busy semantics. Notification badge dimensions use minimum rather than fixed height so scaled badge text is not hard-clipped.

### 6. Dynamic type and touch-target guardrails

- Shared text scaling remains enabled.
- The existing Android-first 48 dp minimum touch target is retained and now covered by a focused contract test.
- Notification badges use `minHeight` instead of fixed height so they can grow when the user increases font size.
- This phase does not perform P114 keyboard/safe-area/responsive layout remediation.

## Changed files

Production/runtime:

- `apps/mobile/src/design/tokens.ts`
- `apps/mobile/src/shared/components/Badge.tsx`
- `apps/mobile/src/shared/components/Button.tsx`
- `apps/mobile/src/shared/components/IconButton.tsx`
- `apps/mobile/src/shared/components/LoadingIndicator.tsx`
- `apps/mobile/src/shared/components/Chip.tsx`
- `apps/mobile/src/shared/components/PressableCard.tsx`
- `apps/mobile/src/shared/components/SegmentedControl.tsx`
- `apps/mobile/src/shared/components/InputField.tsx`
- `apps/mobile/src/shared/components/LifecycleStates.tsx`
- `apps/mobile/src/shared/components/ContentLifecycle.tsx`
- `apps/mobile/src/features/auth/components/RoleSelector.tsx`
- `apps/mobile/src/features/discoverySearch/components/DiscoverySearchInput.tsx`
- `apps/mobile/src/features/customerShell/components/CustomerHeader.tsx`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `apps/mobile/src/features/chefShell/components/ChefHeader.tsx`

Focused test source:

- `apps/mobile/src/design/accessibilityContracts.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P113_ACCESSIBILITY_AUDIT.md`
- `build.md` (ledger refresh follows implementation commit)

## Validation and guard state

- The implementation is based on React Native 0.85-supported accessibility roles/states/live-region/modal APIs already available in this workspace; no dependency was added.
- Focus order remains natural document order; the experimental React Native accessibility-order API is intentionally not introduced.
- Brand `#F62E18` remains unchanged as an approved token.
- No backend, APIM, OpenAPI, auth/session, payment-provider, navigation-route, cache, persistence, or unrelated product-flow behavior is changed.
- No P114 keyboard/safe-area/responsive work is started.
- GitHub Actions are not used as an acceptance signal because the account's monthly Actions capacity is exhausted per the user's instruction.
- Full Jest/typecheck/ESLint execution and real TalkBack/VoiceOver/device font-scaling verification are not claimed from this connector-only run.

## Retained verification gap

P113 therefore remains **PARTIAL at full device-validation scope** even after this code remediation. The code-level accessibility boundary is implemented, but final acceptance still requires device/emulator accessibility validation of critical Customer and Chef journeys with large font settings and screen readers enabled.
