# P04 — Design Token Baseline Evidence

## Phase boundary

- Phase: `P04 — Design Token Baseline`
- Authorized branch: `mobile-ui-rebuild-from-scratch`
- Starting branch HEAD: `3a221d71819dc1bb079f01bbcfc5428fc65ca521`
- P05 motion work is explicitly out of scope and was not started.

## Authoritative inputs checked

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, global UI standards section, inspected through the project File Library as required by `agent.md`.

The repository branch does not contain a committed copy of the 183-page guide; the source-lock documents point agents to the full File Library copy. The guide requires Flame Red `#F62E18`, Espresso Brown `#261A15`, warm surfaces, shared semantic colors, tokenized spacing/radius/typography/icon/elevation/borders, safe-area-aware layout, dynamic font scaling, accessible Android interaction sizes, and consistent restrained shadows/borders.

## Implementation

### `apps/mobile/src/design/tokens.ts`

The existing token module remains the single design-token owner. P04 extends it rather than creating a parallel theme system.

Baseline now includes:

- locked brand colors: Flame Red `#F62E18` and Espresso Brown `#261A15`,
- warm/base/muted semantic surface aliases,
- primary/secondary/placeholder text colors,
- distinct success/warning/error/information semantic colors,
- 4 dp spacing rhythm,
- shared radii,
- shared standard/focus/strong border widths,
- typography sizes plus shared font-weight vocabulary,
- dynamic-type default with font scaling enabled and no fixed token line-height that would clip scaled text,
- shared icon sizes,
- Android-first `48 dp` minimum and `56 dp` comfortable interaction targets,
- safe-area content/floating clearances that are additive to runtime `react-native-safe-area-context` insets, not replacements for device insets,
- shared `none`, `card`, and `primaryAction` elevation/shadow definitions.

### Existing foundation adoption

P04 only migrated values that belong to the token baseline:

- `Icon.tsx` now uses the shared Espresso Brown and icon-size defaults instead of a raw brand hex/default size.
- `AuthCard.tsx` now uses semantic surface, border-width, and card-elevation tokens.
- `PrimaryButton.tsx` now uses touch-target, typography, icon-size, border, surface, and primary-action elevation tokens while preserving its existing behavior.
- `InputField.tsx` now uses shared placeholder, border, icon, touch-target, spacing, surface, and dynamic-type tokens while preserving its existing behavior.
- `AuthShell.tsx` keeps runtime `SafeAreaView` ownership and now uses semantic warm-surface and safe-area content-clearance tokens.

No navigation, API, backend/APIM, storage, authentication contract, motion convention, or screen-phase implementation was added.

## Acceptance mapping

### No screen-specific one-off copy of core brand values where a shared token exists

The shared icon default raw Espresso Brown value was removed. Existing P00–P03 auth foundation components consume the centralized token module for brand colors and P04 baseline values.

### Tokens support safe areas

Safe-area tokens represent content clearances only; device-specific insets continue to come from `react-native-safe-area-context`. This prevents fixed status/navigation-bar assumptions.

### Tokens support dynamic type

React Native font scaling remains enabled. The token baseline exposes that policy and deliberately avoids fixed token line heights that could clip scaled text.

## Validation

Focused Jest coverage is added in `apps/mobile/src/design/tokens.test.ts` for:

- locked brand colors,
- 4 dp spacing rhythm,
- semantic colors remaining distinct from Flame Red,
- accessible interaction targets,
- dynamic-type policy,
- safe-area token availability.

The repository implementation CI remains the required completion gate: dependency install, strict TypeScript, ESLint, Jest, Android production JS bundle, and backend/APIM/infrastructure guard. The accepted run is recorded in `build.md` after the implementation commit is pushed and CI completes.
