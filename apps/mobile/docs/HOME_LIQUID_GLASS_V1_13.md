# Home Liquid Glass v1.13

## Precise Scope

Remove the thin uniform white capsule outline in Home food and nearby kitchen
cards. Lower blur and strengthen soft directional edge optics on those capsules
and the Home bottom menu, without changing layout or application behavior.

## Shared Values

All Home glass uses `homeLiquidGlass` in the existing design tokens: blur intensity
22, Android blur reduction factor 2.5, feathered edge depth 4 dp, peak light 0.62,
edge shade 0.24, top light 0.18 and bottom light 0.08. Image and navigation washes
remain contrast-appropriate for white card text and dark menu text respectively.
No white stroke or React Native border is added to the Home glass surface.

On supported iOS, the existing Expo GlassView uses Apple's clear native material.
Apple exposes material styles/tint, not a portable iPhone-specific numeric blur or
refraction profile. Android uses its existing real backdrop blur plus feathered
directional lighting; that lighting suggests edge depth but is not physical image
refraction or an identical Apple shader. No new library or native module added.

References: https://developer.apple.com/documentation/uikit/uiglasseffect and
https://docs.expo.dev/versions/v55.0.0/sdk/glass-effect/ . The installed Expo package
types were checked for the supported clear style.

## Changed Files

- `C:\mscratch\apps\mobile\src\design\tokens.ts`
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.tsx`
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.test.tsx`
- `C:\mscratch\apps\mobile\src\features\home\screens\CustomerHomeScreen.tsx`
- `C:\mscratch\apps\mobile\src\features\home\components\HomePromoAndKitchens.tsx`
- `C:\mscratch\apps\mobile\src\app\navigation\CustomerBottomNavController.tsx`
- `C:\mscratch\apps\mobile\android\app\build.gradle`
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`
- This document.

## Manual Verification

1. Open Home. Check kitchen time, heart and rating capsules: no uniform white
   outline, soft directional edge light, readable labels and white heart outline.
2. Scroll to food cards. Check availability, heart and food-type capsules have
   identical lower blur/lighting. Favorite icons still respond as before.
3. Scroll up to reveal the menu over different images/light backgrounds. Confirm
   tabs/cart remain readable, the menu dimensions and safe-area spacing unchanged.
4. Open other tabs: their existing glass appearance is retained. Do not start a
   checkout or payment during this UI verification.

## Checkpoint

Prepared version: Android 1.13 / code 14 on KUSHIRAVI-app-build. Build and
installation evidence are recorded after verification. Current phone is v1.12.
No Azure/APIM deployment or GitHub push is required for this change.
TypeScript, scoped ESLint and all 182 suites / 925 mobile tests passed.
