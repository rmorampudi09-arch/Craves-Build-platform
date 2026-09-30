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
- Signed release and live visual results follow after verification.
- Native iOS hardware is not available here.

## Build and Rollback

- Prepared Android version: code 19 / name 1.15.2, package `com.cravesapp`.
- Planned tag: `KUSHIRAVI-app-v1.15.2`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2.apk`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2-source.zip`.
- Build script: `C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.
- Previous installed checkpoint: `KUSHIRAVI-app-v1.15.1`,
  `5dece0e8cae9208aeccdcf12f231e336ad830bec`. Prior tags/artifacts stay untouched.
- Exact source commit, hashes and phone version follow in final build evidence.

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
