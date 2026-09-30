# Live Glass Rim - Version 1.15.3

## Request and Scope

The user approved the center blur but requested that moving background content
appear reflected/refracted at the curved rim, instead of only a painted highlight.
This update changes only the shared glass rendering. Existing food/kitchen
capsules and Customer/Chef menus inherit it without screen or flow changes.

## Rendering

- Retain the existing center BlurView at intensity 22, reduction factor 2.5.
- Add a separate, near-sharp BlurView at intensity 1 with the same live blurTarget.
  An extra 16 dp on each side supplies real pixels beyond the rounded edge.
- Wrap only that capture in a native ReactViewGroup with Android RuntimeShader.
  Rounded-rectangle distance determines a 5 dp rim, its curved normal, and a
  maximum 10 dp outward sampling offset. The displacement falls toward zero
  inside the rim; the center is fully transparent. Samples stay inside the
  expanded capture. Existing highlights remain as lighting beneath real pixels.
- Foreground children, text and icons are outside the shader. The additional
  view is noninteractive and excluded from accessibility.
- Rendering is native and uses live backdrop render nodes. No JavaScript scroll
  timers, screenshots, network images, private Expo internals or node_modules
  edits are used. No new dependencies are installed.
- Android API 33+ and hardware acceleration are required for the shader.
  Older Android, missing native view registration, zero-sized layout or runtime
  shader failure retain existing glass without changing the tap surface.
- Supported iOS keeps the existing native clear GlassView. This is not Apple's
  proprietary algorithm and does not claim identical Apple optical parameters.

Native shader API reference:
[Android AGSL integration](https://developer.android.com/develop/ui/views/graphics/agsl/using-agsl).
Backdrop capture reuses the installed Expo Blur 56.0.3 / Dimezis BlurView 3.1.0.

## Changed Files

- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassReflection.tsx`:
  optional native rim component, same-target near-sharp capture, capability guard.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassReflection.test.tsx`:
  same target, center blur, foreground isolation, geometry and safe fallbacks.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassSurface.tsx`:
  add the rim above existing optics and below foreground children.
- `C:\mscratch\apps\mobile\src\design\tokens.ts`:
  add capture inset and bend distance only; approved blur/lighting unchanged.
- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\CravesGlassReflectionView.kt`:
  bounded native shader and lifecycle/unsupported-device fallback.
- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\CravesGlassReflectionManager.kt`:
  React Native view manager and density-independent optical properties.
- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\CravesGlassReflectionPackage.kt`:
  register only the native view, no business/API module.
- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\MainApplication.kt`:
  add the package to the existing list.
- `C:\mscratch\apps\mobile\android\app\build.gradle`:
  versionCode 20 / versionName 1.15.3.
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md` and this document:
  checkpoint and verification evidence.

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Scoped ESLint passed for the reflection wrapper/test, shared surface and tokens.
- Full Jest: 187 suites / 952 tests passed in 141.591 seconds, with
  `--runInBand --testTimeout=30000`; log `C:\mscratch\artifacts\v1153-tests-verified.log`.
  Initial concurrent-build run had one existing cart-test five-second timeout;
  isolated cart checks and the complete rerun passed without changing flow code.
- Final focused reflection tests: all 10 passed, including same capture target,
  touch/accessibility isolation, center blur, foreground separation, old Android,
  iOS and missing/throwing native manager.
- Native Kotlin release compilation succeeded in 8m 37s, 309 tasks (13 executed);
  log `C:\mscratch\artifacts\v1153-native-compile.log`. Standard legacy ReactPackage
  deprecation warning remains; no native compilation errors.

Release build, live phone checks and exact commit/tag/artifact hashes pending.

## Manual Test Steps

1. Open the app on the previously selected side. It should launch normally.
2. On Customer Home, scroll food photos/text behind the menu. The curved rim
   should sample changing background colors/details, not just a fixed white line.
3. Inspect food and kitchen capsules over their photos. Look for bent photo
   details at the rim while the center keeps its approved soft blur.
4. Scroll in both directions and switch menu tabs. Labels/icons remain legible;
   taps and selection haptics still work and content is not newly occluded.
5. Switch to Chef and inspect the unchanged menu; close/reopen on the same side.
6. On an older Android or unavailable renderer, existing glass remains usable.
   On supported iOS, existing native clear system glass remains in place.

No Azure, Firebase, GitHub, credentials or console action is required. No real
order or payment needs to be submitted for this visual-only change.

## Rebuild and Rollback

Build from the exact tagged branch/source ZIP using
`C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.
The source ZIP excludes dependencies and local runtime environment secrets;
restore normal existing environment configuration when rebuilding.

Previous source is preserved at `KUSHIRAVI-app-v1.15.2`, and original Version 1
remains `KUSHIRAVI-app-v1`. Do not move prior tags or clear phone app data.
