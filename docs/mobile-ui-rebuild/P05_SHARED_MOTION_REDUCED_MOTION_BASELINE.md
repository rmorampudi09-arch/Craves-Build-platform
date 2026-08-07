# P05 — Shared Motion and Reduced-Motion Baseline

## Status

Implementation prepared for the `mobile-ui-rebuild-from-scratch` branch from starting HEAD `783b29224661a969405837c2a1ef7f5a477b427c`.

This phase is intentionally limited to the shared motion/reduced-motion foundation. It does not implement P06 interaction components, navigation shells, View Cart, bottom navigation, modals, marketplace screens, or backend/APIM behavior.

## Authoritative requirements

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` global Animation Guidelines require motion to explain state change rather than delay work, consistent motion across press/chip-tab/list/bottom-nav/View-Cart/skeleton/modal behavior, transform/opacity preference over layout-heavy list animation, platform reduced-motion support, and no animation that blocks navigation or repeats restored success effects.

`phases.md` P05 requires shared duration/easing/spring conventions for press, chip/tab, View Cart, bottom navigation, modal, list insertion/removal, and skeleton behavior, plus reduced-motion handling. Acceptance additionally requires that auth/payment/error navigation never wait for motion and reusable primitives avoid unnecessary large-list animation.

## Implementation

### `apps/mobile/src/design/motion.ts`

The existing design-system ownership is extended with one shared motion vocabulary:

- durations for press, selection, bounded list item changes, bottom navigation, View Cart, modal transitions, and skeleton cycles,
- standard/enter/exit cubic-bezier conventions,
- restrained feedback/settle spring conventions with overshoot clamped,
- intent-level transition definitions restricted to `opacity` and `transform`,
- reduced-motion resolver that converts animated transitions to immediate state changes and disables springs/continuous shimmer,
- explicit zero-delay safety policy for authentication navigation, payment navigation, and error presentation,
- whole-large-list animation disabled by policy,
- bounded list-change helper that permits insertion/removal animation only for a small visible change set.

The values are deliberately restrained and form a reusable baseline; later screen-owning phases may compose them but must not create competing per-screen motion vocabularies.

### `apps/mobile/src/design/reducedMotion.ts`

Adds a single platform accessibility hook backed by React Native `AccessibilityInfo`:

- observes Android/platform `reduceMotionChanged`,
- reads the current system preference on mount,
- begins conservatively with reduced motion enabled until the platform preference resolves,
- cleans up its subscription on unmount.

This hook is intended for later continuous/repeated motion such as skeleton shimmer and any component that must select an immediate low-motion equivalent.

### `apps/mobile/src/design/motion.test.ts`

Focused tests verify:

- interaction/modal durations remain bounded,
- shared transitions only use opacity/transform,
- reduced motion disables interpolation, springs, and continuous skeleton motion,
- authentication/payment/error paths have zero animation delay,
- whole-large-list animation remains disabled and list-change animation is bounded.

## Backend/APIM impact

None. P05 is a client design-system foundation phase. No endpoint, APIM route, request/response model, auth behavior, environment setting, persistence schema, backend source, infrastructure source, or server pipeline is changed.

## Visual/device QA

No screen/reference is implemented by P05, so pixel-level reference certification is not claimed. Final Android device reduced-motion and visual behavior remains part of later component/screen and QA phases.

## Acceptance boundary

P05 is complete only after the repository implementation CI passes the mobile code checks for the P05 implementation commit. The accepted run and completion commit are recorded in `build.md` after verification. P06 is not authorized or started by this phase.
