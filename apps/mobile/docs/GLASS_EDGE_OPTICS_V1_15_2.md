# Precise Glass Edge Optics - Version 1.15.2

## Scope

Requested after accepting the v1.15.1 blur. Strengthen only the visible curved
edge optics of the existing food/kitchen glass capsules and Customer/Chef menus.
Do not change the accepted blur, tint, layouts, text/icons or any functional flow.
Work stays local on `KUSHIRAVI-app-build`; no GitHub push or backend deployment.

## Exact Files Changed

- `C:\mscratch\apps\mobile\src\design\tokens.ts`: edge depth 4 to 5dp,
  directional highlight 0.62 to 0.90, edge shade 0.24 to 0.32; add inner-edge
  highlight/shade strengths. Blur 22, reduction factor 2.5 and center lighting unchanged.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.tsx`:
  paired rounded edge bands with directional gradients and luminance masks,
  leaving the center untouched and all overlays non-interactive. No uniform stroke.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.test.tsx`:
  regression checks for fixed blur/lighting, two center-excluding edge masks,
  rounded geometry, no drawn outline and safe tiny layouts.
- `C:\mscratch\apps\mobile\android\app\build.gradle`: build 19 / name 1.15.2.
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`: version checkpoint/evidence.
- `C:\mscratch\apps\mobile\docs\GLASS_EDGE_OPTICS_V1_15_2.md`: this delivery record.

Android's current blur renderer has no native refractive background-displacement
API. These directional edge bands approximate a curved lens highlight/shadow;
they are not a claim of identical Apple Liquid Glass optics. Supported iOS keeps
its existing system-managed clear GlassView; no duplicate edge overlay is added.
No new libraries or native code are required.

## Verification

- TypeScript and scoped ESLint passed.
- Focused glass suite: 9 tests passed, including paired edge geometry, unchanged
  blur/lighting, no uniform stroke and non-negative tiny-layout dimensions.
- Full Jest suite: 186 suites / 942 tests passed in 74.938s.
  Log: `C:\mscratch\artifacts\v1152-tests.log`.
- Signed ARM64 Android release succeeded in 9m 36s: 823 tasks, 41 executed and
  782 up-to-date. Log: `C:\mscratch\artifacts\v1152-release-build.log`.
- APK manifest confirms package `com.cravesapp`, code 19 / name 1.15.2,
  minSdk 24 / targetSdk 36 and arm64-v8a.
- APK v2/v3 signatures verified. Certificate matches the existing Firebase registration:
  SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`,
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Replace-install succeeded on `RS7PB6VOY9ZLLFYD` / RMX5003 (Android 16),
  preserving app data. Android reports versionCode 19 / versionName 1.15.2 and
  `lastUpdateTime=2026-09-30 17:18:32`.
- Live screenshots show a stronger rounded directional edge on kitchen and food
  capsules and Customer/Chef menus, with readable unchanged foregrounds and center blur.
  Customer Chefs/Profile and Chef Dashboard/Menu navigation worked; bottom actions
  remained clear of the menu. Existing menu hide-on-scroll behavior is retained.
- Native selection haptics still completed successfully; Chef workspace reopened
  after force-stop. No post-install app crashes appeared in the crash buffer.
- No cart item, order/payment, kitchen availability or other business-data changes
  were made. Workspace switching was used only for visual verification; the phone
  was returned to its original Chef side. No real payment was attempted.
- Native iOS hardware is not available here.

## Build and Rollback

- Installed Android version: code 19 / name 1.15.2, package `com.cravesapp`.
- Tag: `KUSHIRAVI-app-v1.15.2`.
- Exact APK/source commit: `9bcd1eda070ad6b99a832caec4f0475720c4ba99`.
  Later evidence-only commits do not change the tagged APK/source snapshot.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2.apk`.
  SHA-256: `532AD12A55ED7B8637204D099327003FACAAABCA5524A5DEFB69C85DFD1FA83A`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2-source.zip`.
  SHA-256: `7A3370B12221282F8F4CE22E00B66F8A2D1F37BD8D710DA2B270E250CF2FF575`.
  Archived from the exact tagged mobile source (906 entries); eight required
  rebuild files checked, with node_modules/private runtime .env excluded.
- Build script: `C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.
- Previous installed checkpoint: `KUSHIRAVI-app-v1.15.1`,
  `5dece0e8cae9208aeccdcf12f231e336ad830bec`. Prior tags/artifacts stay untouched.

## Phone Evidence

- Before: `C:\mscratch\artifacts\v1152-customer-home-before.png`,
  `C:\mscratch\artifacts\v1152-food-before.png`,
  `C:\mscratch\artifacts\v1152-edge-before.png` (Chef menu).
- After: `C:\mscratch\artifacts\v1152-home-after.png`,
  `C:\mscratch\artifacts\v1152-food-after.png`,
  `C:\mscratch\artifacts\v1152-chefs-menu-after.png`,
  `C:\mscratch\artifacts\v1152-chef-after.png`,
  `C:\mscratch\artifacts\v1152-chef-menu-after.png`.
- Cold Chef workspace reopen: `C:\mscratch\artifacts\v1152-chef-reopen.png`.
- Native haptic ticks: `C:\mscratch\artifacts\v1152-haptics.log`.
- Post-install crash buffer: `C:\mscratch\artifacts\v1152-crash-check.log` (empty).

This is a live visual comparison, not a frame-rate measurement or actual background
refraction test. Native iOS rendering was intentionally left unchanged and not tested.

## Manual Checks

1. View food availability/type/favorite capsules and kitchen time/favorite/rating
   capsules over light and darker images. Edges should read as curved glass glints,
   not a constant white outline. Center blur and text contrast must remain familiar.
2. Inspect Customer and Chef menus on plain and image backgrounds. Compare the
   curved rim while confirming black icons/text, spacing and safe-area placement.
3. Tap menu tabs to confirm navigation and haptics still work with no press circle.
4. Scroll Home: glass overlays must not consume taps or cause a layout jump.
5. Force-stop and reopen on the selected side; existing side persistence must remain.

No Azure, Firebase, GitHub, signing-console or other manual infrastructure changes
are required. Haptics and payment behavior are unchanged; no purchase is necessary
to verify this visual-only update.
