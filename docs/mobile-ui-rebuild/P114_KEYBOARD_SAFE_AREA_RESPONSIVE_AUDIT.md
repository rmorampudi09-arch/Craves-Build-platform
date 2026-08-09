# P114 Keyboard / Safe-Area / Responsive Audit

**Phase:** P114 — Keyboard/Safe-Area/Responsive Audit  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start HEAD:** `34e7afcd03c3b57c989bd5a2e4ce92f626569fa1`  
**Status:** PARTIAL at full device-validation scope

## Contract reviewed

P114 is limited to compact/standard/large Android widths, IME behavior, cutouts/system insets, gesture navigation, sticky controls, and larger-font clipping. The acceptance contract is that required fields/CTAs are not obscured and critical content is not clipped at larger font sizes.

Control sources reviewed before implementation:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0.docx`

No P115 reduced-motion work is included in this phase.

## Source audit and remediation

### 1. Keyboard / IME

- Android already uses `android:windowSoftInputMode="adjustResize"` for the main activity.
- Customer and chef bottom tabs already hide while the keyboard is open.
- `ScreenShell` keeps Android `KeyboardAvoidingView` behavior unset so `adjustResize` remains the single Android resize mechanism rather than layering a second fixed keyboard offset on top.
- Scrollable `ScreenShell` content now explicitly supports drag-to-dismiss on Android and interactive dismissal on iOS while retaining `keyboardShouldPersistTaps="handled"`.
- Customer cart and dish-detail scroll surfaces were given the same keyboard-dismiss behavior where they manage their own list/scroll containers.
- Existing chef add/edit menu form paths remain scrollable, so the activity resize can keep lower form fields/actions reachable when the IME is present.

### 2. Safe area / cutout / gesture navigation

- The app already has a root `SafeAreaProvider`, and shared screen shells use safe-area edges rather than hard-coded status/navigation-bar heights.
- The cart was the critical sticky-control gap found in this audit: its absolute checkout bar used a fixed bottom padding while the screen intentionally consumed only the top safe-area edge. That could place the checkout action into a gesture/navigation inset.
- The cart checkout bar now reads the runtime bottom inset, applies safe bottom padding, measures its rendered height, and gives the scrolling content matching clearance. This avoids assuming a fixed sticky-bar height and keeps the final cart content reachable above the bar.
- Dish-detail purchase controls remain inside a screen shell that consumes both top and bottom safe-area edges, so no separate hard-coded navigation-bar offset was introduced.

### 3. Compact / standard / large widths and larger fonts

A small responsive guardrail module was added for audit-sensitive layout decisions:

- compact: `<= 359 dp`
- standard: `360–479 dp`
- large: `>= 480 dp`
- enlarged-font action guard: `fontScale >= 1.3`

These values are used only to prevent critical action-row clipping; they do not introduce a new product layout or tablet navigation model.

Remediations:

- Critical cart checkout content/CTA stacks vertically on compact widths or enlarged font scale.
- Dish-detail title/price and purchase controls stack where a two-column row is unsafe.
- Shared button labels can shrink/wrap within their row instead of forcing horizontal clipping.
- The existing authentication readable-width cap remains `560 dp`, now centralized in the responsive contract rather than duplicated as a magic number.
- Large screens therefore retain the approved single-column auth proportion; this phase does not invent multi-column layouts.

### 4. Existing critical paths checked without redesign

- Customer filter/sort footer: already protected by bottom safe-area handling.
- Dish-detail purchase bar: already inside bottom-safe screen containment; responsive row handling was added only for clipping risk.
- Chef add/edit menu forms: already scrollable and covered by Android `adjustResize`; no product-flow change was made.
- Cart checkout launcher: safe-area/clearance behavior was hardened, but the existing functional checkout availability contract was not changed.

## Automated contract coverage added

`apps/mobile/src/design/responsiveContracts.test.ts` covers:

- 320 dp compact classification
- 390 dp standard classification
- 480 dp large classification
- compact-width critical-action stacking
- enlarged-font critical-action stacking
- bottom-inset padding calculation
- the established 560 dp auth readable-width cap

**Execution status:** Not executed in this connector-only implementation run. GitHub Actions were intentionally not invoked because the user reported the account Actions limit is reached. No test pass is claimed.

## Device / emulator validation matrix

| Validation target | Status |
| --- | --- |
| Compact Android width | Not executed / unclaimed |
| Standard Android width | Not executed / unclaimed |
| Large Android width | Not executed / unclaimed |
| Increased system font scale | Not executed / unclaimed |
| IME open over lower required field/CTA | Not executed / unclaimed |
| Display cutout/system-bar variants | Not executed / unclaimed |
| Gesture-navigation bottom inset | Not executed / unclaimed |

Because these runtime checks were not executed, P114 must not be recorded as fully complete even though the inspected source-level gaps were remediated.

## Retained dependency / non-invention rule

There is no native customer checkout screen/route in the inspected mobile implementation. P114 does **not** invent one. The existing cart checkout launcher/status behavior is retained; this phase only hardens its layout and safe-area behavior.

## Outcome

- Source-level P114 audit/remediation: implemented for the inspected critical paths.
- Full P114 device-validation acceptance: unclaimed.
- Phase status: **PARTIAL** at full validation scope.
- P115: **NOT STARTED**.
- Authorization after this run: **NONE** until the user explicitly requests the next phase.
