# P115 — Reduced Motion and Animation Audit

## Scope

This evidence records the single authorized P115 mobile phase on `mobile-ui-rebuild-from-scratch`. P116 and later work is intentionally untouched.

The phase was executed against `plan.md`, `phases.md`, `agent.md`, `build.md`, and the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` motion guidance. The implementation keeps motion explanatory and short in the normal state, removes interpolation/continuous motion for the platform reduced-motion preference, avoids layout-heavy list animation, and does not delay navigation or error presentation for animation completion.

## Source audit

The current mobile tree's concrete motion surfaces were reviewed at the existing product boundary:

- Shared motion primitives in `apps/mobile/src/design/motion.ts` already define bounded durations, opacity/transform-only shared transitions, no whole-large-list animation, and zero critical navigation/error delays.
- `apps/mobile/src/design/reducedMotion.ts` already exposes the platform reduced-motion preference and starts conservatively in the reduced state until the asynchronous platform value is known.
- Customer floating bottom navigation already resolves its Animated transition through the shared reduced-motion policy and disables pointer events/accessibility exposure while hidden.
- The shared View Cart overlay used the same motion contract but duplicated its own asynchronous `AccessibilityInfo` subscription; it is now standardized on the shared conservative reduced-motion hook.
- Auth/account native-stack transitions used `fade_from_bottom` unconditionally.
- Customer product native stacks used `fade` unconditionally.
- Chef product/order/profile native stacks used `fade` unconditionally.
- Customer Location Selector used a React Native `Modal` slide transition unconditionally.
- Customer Address Editor used a React Native `Modal` slide transition unconditionally.
- The shared loading primitive used a continuously spinning native `ActivityIndicator` without a reduced-motion visual equivalent.
- The shared Skeleton component is currently static; there is no running shimmer/loop to suppress.

## Implementation

### Shared platform transition resolver

`apps/mobile/src/design/motion.ts` now exposes `resolveReducedMotionAnimation(...)`. It preserves the existing transition string when reduced motion is off and resolves it to `none` when reduced motion is on. This gives native-stack and React Native Modal transitions the same accessibility policy as Animated-based surfaces without redesigning their normal-state behavior.

Focused source coverage was added in `apps/mobile/src/design/motion.test.ts` for normal and reduced platform transition resolution.

### Native-stack transitions

The following navigators now derive their existing stack animation from `useReducedMotionPreference()`:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`

Normal motion remains the existing `fade_from_bottom`/`fade`. With reduced motion enabled the transition becomes `none`. Route names, route hierarchy, gestures, auth/role routing, deep-link behavior, restoration behavior, and tab structure are unchanged.

### Modal/sheet transitions

The following existing slide surfaces now resolve to `none` when reduced motion is enabled while preserving `slide` otherwise:

- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx`

Their visibility, dismissal, backdrop, accessibility-modal, and form behavior are unchanged.

### View Cart overlay

`apps/mobile/src/features/cart/components/SharedViewCartOverlay.tsx` now uses the shared `useReducedMotionPreference()` hook rather than maintaining a second nullable reduced-motion state and subscription. When reduced motion is enabled the shared motion contract immediately settles the overlay at its final state with no spring/timing interpolation.

The overlay continues to return `null` when it is not eligible/visible, so a hidden overlay cannot intercept input.

### Loading indicator

`apps/mobile/src/shared/components/LoadingIndicator.tsx` keeps the existing native `ActivityIndicator` when reduced motion is off. When reduced motion is enabled it substitutes a static token-based ring while retaining the same progressbar/busy accessibility semantics and optional label. Loading state therefore remains visible without continuous rotation.

## Non-goals / preserved boundaries

- No P116 dark-mode or token-conformance work was started.
- No screen was redesigned.
- No route or navigation destination was added, removed, or renamed.
- No backend, APIM, OpenAPI, auth/session, cache, persistence, payment, or business-domain contract changed.
- No decorative animation was added.
- No whole-list/layout-heavy animation was introduced.

## Validation truth

### Source-level validation performed

- Re-read the P115 phase boundary and motion guidance before implementation.
- Reviewed the concrete current motion/reduced-motion call sites identified in the mobile tree.
- Re-fetched modified branch files/commit diffs after writes to confirm the intended reduced-motion wiring and narrow file scope.
- Kept normal transition values unchanged and introduced low/no-motion equivalents only under the platform reduced-motion preference.

### Validation not claimed

This execution environment does not provide a usable local checkout/device session. A local clone attempt could not resolve `github.com`, so Jest, TypeScript, ESLint, Metro/bundle execution, simulator/emulator testing, and physical-device testing were not run here. GitHub Actions were not invoked because the user reported the account Actions limit is exhausted.

Therefore P115 remains **PARTIAL at full runtime/device-validation scope** until executable checks and a real reduced-motion on/off device/emulator pass are completed. No passing CI or device result is fabricated.

## Changed files

Production/runtime:

- `apps/mobile/src/design/motion.ts`
- `apps/mobile/src/shared/components/LoadingIndicator.tsx`
- `apps/mobile/src/features/cart/components/SharedViewCartOverlay.tsx`
- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx`

Focused test source:

- `apps/mobile/src/design/motion.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P115_REDUCED_MOTION_ANIMATION_AUDIT.md`
- `build.md`

## Stop boundary

P115 is the only phase implemented in this run. P116 remains unstarted and unauthorized here.
