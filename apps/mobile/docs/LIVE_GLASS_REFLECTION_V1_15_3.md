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

## Accepted Build and Installation

- Branch: `KUSHIRAVI-app-build`; no push or remote/CI change.
- APK source commit: `a77b95c8ebc2b5089d72a93413e1e306ca7925e0`.
- Installable tag: `KUSHIRAVI-app-v1.15.3`. Prior tags untouched.
- Signed ARM64 release: 13m 54s, 823 tasks (34 executed, 789 up-to-date).
  Build log: `C:\mscratch\artifacts\v1153-release-build.log`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.3.apk`.
- APK SHA-256: `F603B3DF07BE11F865F897CE1FD687E476E1D9D2B288E357EEE93E1E13049B27`.
- Exact source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.3-source.zip`.
- ZIP SHA-256: `50C415468515D1E14C570AAB8C4E023FE42214048FDC885E601EC7689047434B`.
  Includes 912 entries, package lock, wrapper, build script and native shader;
  excludes node_modules and private runtime `.env`.
- APK identity verified: `com.cravesapp`, code 20, name 1.15.3, ARM64, MainActivity.
- APK signatures v2/v3 valid. Registered signing identity unchanged:
  SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`,
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Replace-install succeeded on `RS7PB6VOY9ZLLFYD` / RMX5003, Android API 36.
  Package manager reports code 20 / name 1.15.3 / update time
  `2026-09-30 18:09:31`. No uninstall, data reset or downgrade.
- Evidence-only documentation commits after the tag do not change this APK/source.

## Live Phone Evidence

- Native log confirms the registered view and compiled shader are active, including
  the 1080x286 expanded menu capture and individual photo captures. No unavailable,
  shader exception, React Native error or AndroidRuntime fatal entry appeared.
  `C:\mscratch\artifacts\v1153-rim-runtime-final.log`.
- Home kitchen capsules now show photo colors/details through the rounded rim.
  Changing kitchen carousel photos also change the rim, not only its center.
  `C:\mscratch\artifacts\v1153-home-after.png`.
- Stable popular food photo before/after inspected; availability, favorite and
  food-type rims refract photo details. Foreground text/icons stay unwarped.
  `C:\mscratch\artifacts\v1153-food-before.png` and `v1153-food-after.png`.
- Customer menu inspected over both text/actions and moving food photography.
  Curved edges and straight rim contain sharper bent source details, while center
  blur stays soft and black labels/icons remain clear.
  `C:\mscratch\artifacts\v1153-menu-rim-a.png`, `v1153-menu-rim-b.png`,
  `v1153-menu-rim-c.png`.
- Pixel comparison between two scroll positions at a fixed top menu rim band:
  3,385 of 4,480 pixels (75.6%) changed by more than 5 average channel units;
  mean channel difference 15.46. This checks live rim change, not equivalence to
  Apple's shader or a measured frame-rate guarantee.
  `C:\mscratch\artifacts\v1153-rim-pixel-check.json`.
- Customer tab navigation and Chefs/Profile glass checked on light backgrounds.
  Native selection TICK completed for `com.cravesapp` at 18:14:32.110.
  `C:\mscratch\artifacts\v1153-chefs-menu-after.png`, `v1153-haptics.log`.
- Chef Dashboard/Menu/Profile glass and navigation checked without changing
  availability or items. Chef force-stop/reopen retained Chef side.
  `C:\mscratch\artifacts\v1153-chef-after.png`, `v1153-chef-menu-after.png`,
  `v1153-chef-reopen.png`.
- Switched back to the original Customer side; force-stop/reopen retained Customer
  Home. `C:\mscratch\artifacts\v1153-customer-reopen.png`.
- Post-install crash buffer empty:
  `C:\mscratch\artifacts\v1153-crashes-since-install.log`.
- Screen recording was unavailable (phone denied output-file access); no security
  or recording permissions were changed. Verification used live gestures,
  screenshots, pixel comparison and native logs instead.
- No real payment or order was submitted; no cart, favorite or Chef menu data was
  changed. No iOS/older Android hardware available; fallback/platform gates covered
  in component tests. Do not claim hardware validation on those platforms.

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
