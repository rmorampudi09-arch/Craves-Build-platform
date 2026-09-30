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

- Branch: `KUSHIRAVI-app-build`.
- Installed Android version: `com.cravesapp`, name `1.13`, code `14`.
- APK source commit: `2e91f049976686ea082babe9b66e3923c65ec994`.
- Installable tag: `KUSHIRAVI-app-v1.13`. Previous tags remain untouched.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.13.apk`.
- APK SHA-256: `269EDE6F4AB3F5350FA260C07F392F46AF1131FAFAEDB1DBCF10B0D2F78213EB`.
- Exact-tag mobile source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.13-source.zip`.
- ZIP SHA-256: `7C6171525A6F857DD53BD3009D6A7319621402E49FB2DFA14BC02CB0D748D4E3`.
- Release build succeeded in 4m 19s, 823 tasks, arm64-v8a; package/version and
  v2/v3 signatures verified. Existing Firebase-registered certificate retained.
- Installed on `RS7PB6VOY9ZLLFYD` / RMX5003 without clearing app data;
  phone update time `2026-09-30 11:51:00`. Installed APK hash matches the local
  release. Cold launch succeeded.
- TypeScript, scoped ESLint and all 182 suites / 925 mobile tests passed.
  Six focused glass tests passed again after the final native radius adjustment.
- Evidence folder: `C:\mscratch\artifacts\home-glass-v1.13-evidence`.
  `phone-kitchens-menu.png` shows kitchen capsules/menu; `phone-current.png`
  shows food availability/heart/food-type capsules and the menu over an image.
- Phone verification was visual/read-only. Favorite, cart, checkout and payment
  actions were not exercised. Native iOS hardware was not tested.
- No backend/APIM changes, new dependencies, new Azure resources or GitHub push.

This document's final evidence is committed separately from the APK source.
The source ZIP and installable tag remain the exact release source commit above.
