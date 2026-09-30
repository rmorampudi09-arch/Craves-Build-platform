# Home Light Glass v1.14

## Scope

Make the existing Home food/kitchen capsules and Home bottom menu brighter and
less blurred using the user's CSS as a visual reference. Make the shared customer
menu's four tab icons/labels black and labels bold. No screen redesign or business
logic change. Existing capsule/menu dimensions, safe areas, scroll behavior,
white favorite outlines, red selected hearts and red Cart shortcut are retained.
A soft white selected-tab highlight preserves the selected state when all tab
icons and labels are black.

## Native Translation of the CSS

All Home glass uses the same profile in `homeLiquidGlass`:

- Blur intensity 10 (was 22); Android reduction factor 2.5, nominal radius 4.
- Light blur tint and white wash `rgba(255,255,255,0.08)`; no dark capsule wash.
- Feathered inner glow: depth 12 dp, white opacity 0.2.
- Directional edge: depth 4 dp, highlight 0.5, shade 0.06 (was 0.24).
- Body lighting: top 0.26, bottom 0.12.
- Unsupported Android fallback: white at 0.18, not the former dark image tint.

No uniform SVG stroke or React Native capsule border is reintroduced. Supported
iOS retains clear native system glass with the white tint. Android uses the
existing backdrop blur and masked inset lighting, not physical refraction.
Browser CSS `backdrop-filter`, saturation/brightness multipliers and the
unspecified `#lg-filter` are not native properties and are not claimed as exact
equivalents. Reference dimensions 420 x 280 are not applied to app controls.
No new package or native module is required.

## Changed Files

- `C:\mscratch\apps\mobile\src\design\tokens.ts`
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.tsx`
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.test.tsx`
- `C:\mscratch\apps\mobile\src\app\navigation\customerTabs.ts`
- `C:\mscratch\apps\mobile\src\app\navigation\customerTabs.test.ts`
- `C:\mscratch\apps\mobile\src\app\navigation\CustomerRootNavigator.tsx`
- `C:\mscratch\apps\mobile\src\app\navigation\CustomerBottomNavController.tsx`
- `C:\mscratch\apps\mobile\android\app\build.gradle`
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`
- This document.

Home card call sites already select the shared Home appearance in v1.13 and
therefore need no further edits. Other screen glass retains its prior appearance.
No backend, API, finance, auth, chef, cart, order, payment or splash files changed.

## Manual Checks

1. Open Home. Check kitchen time, heart and rating capsules are lighter/clearer
   with soft inset highlights, no thin uniform white outline and readable content.
2. Scroll to Popular Near You. Check availability, heart and food-type capsules
   share the same light material; white unselected hearts and red favorites remain.
3. Scroll upward to reveal the menu over light and image backgrounds. Confirm all
   four tab icons and labels are black, labels bold, selected highlight visible,
   existing dimensions/spacing unchanged and content remains scrollable.
4. Switch tabs and return Home. Confirm tab routes still open normally; do not
   toggle favorites, add items, open checkout or make a payment for visual testing.
5. On an older Android device or unavailable blur backend, check the fallback is
   translucent white and does not crash. Native iOS hardware needs separate testing.

## Checkpoint

Prepared Android package `com.cravesapp`, name `1.14`, code `15`, branch
`KUSHIRAVI-app-build`. Release source SHA, tag, APK, source ZIP, test/build and
installation evidence are recorded after verification. Current phone: v1.13.
Earlier rollback tags remain untouched; no GitHub push or Azure deployment.
TypeScript, scoped ESLint and all 182 suites / 929 tests passed before release.
