# Craves v1.15.4 - Scrolling Performance

## Scope

Correct the Android scrolling regression in the v1.15.3 live glass renderer.
Preserve the approved appearance, native sticky rail, navigation and business
flows. Work only on `KUSHIRAVI-app-build` in `C:\mscratch\apps\mobile`.
No GitHub push, backend deployment, dependency addition or payment/order mutation.

## Diagnosis

The previous rim used a second Expo BlurView per glass surface. The underlying
Android blur controller allocates its effect node at the entire target's size,
not just the capsule's size ([Dimezis 3.1.0 controller](https://raw.githubusercontent.com/Dimezis/BlurView/version-3.1.0/library/src/main/java/eightbitlab/com/blurview/RenderNodeBlurController.java)).
Combined with the Home feed's default render window, this accumulated large
rendering buffers and off-screen views. The render-window adjustment follows
[React Native's FlatList guidance](https://reactnative.dev/docs/optimizing-flatlist-configuration).

Controlled baseline on device `RS7PB6VOY9ZLLFYD` (RMX5003, Android API 36),
installed version `1.15.3`, code `20`, source
`a77b95c8ebc2b5089d72a93413e1e306ca7925e0`:

| Metric | Before | After | Repeat |
| --- | --- | --- | --- |
| Frames during six swipes | 111 | 302 | 296 |
| Janky frames (current Android counter) | 110 (99.10%) | 7 (2.32%) | 6 (2.03%) |
| Janky frames (separate legacy counter) | 111 (100.00%) | 208 (68.87%) | 209 (70.61%) |
| Frame latency median / p90 / p95 / p99 | 89 / 101 / 105 / 109 ms | 25 / 34 / 38 / 48 ms | 25 / 32 / 38 / 46 ms |
| GPU median / p90 | 11 / 14 ms | 8 / 11 ms | 8 / 11 ms |
| Scratch render targets | 421.58 MB | 94.29 MB | 94.03 MB |
| Attached views | 2443 | 841 | See raw log |

Evidence: `C:\mscratch\artifacts\v1154-before-frames.log`,
`C:\mscratch\artifacts\v1154-after-frames.log`,
`C:\mscratch\artifacts\v1154-after-repeat-frames.log`.
Both Android counters are recorded, not treated as interchangeable. Latency
percentiles include pipeline delays and are not an FPS estimate. Median spacing
between consecutive regular samples' IntendedVsync timestamps improved from
49.79 ms to 16.60 ms. The raw frame table is a rolling sample, not every aggregate
frame and not measured display presentation FPS (DisplayPresentTime is zero).
This is a substantial measured improvement, not a zero-stutter/120-FPS guarantee.

An additional eight-fling test (four down, four up, 200 ms gestures) recorded
212 frames, 13 janky (6.13%), median latency 23 ms / p90 36 ms. It includes
new card/image mounting and an overscroll-triggered existing refresh. Evidence:
`C:\mscratch\artifacts\v1154-fast-frames.log`. Feed cards and the native sticky
category rail remained visible; no persistent blank food rows were observed.

## Changed Files

- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\CravesGlassReflectionView.kt`:
  directly capture only the rim's bounded rectangle into a native RenderNode;
  reuse cached child drawing and capture until source/position/geometry changes;
  use an analytic rounded-edge normal; release capture on detach and skip hidden
  rims. Keep shader failure safe and reject recursive ancestor capture.
- `C:\mscratch\apps\mobile\android\app\src\main\java\com\cravesmobile\CravesGlassReflectionManager.kt`:
  pass the public React Native backdrop tag to the native view.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassReflection.tsx`: remove the extra BlurView;
  pass the existing target's native tag, retaining optional native support and
  silent fallback. No JavaScript scroll loop or bitmap capture.
- `C:\mscratch\apps\mobile\src\shared\components\LiquidGlassReflection.test.tsx`: verify direct target
  plumbing, no additional BlurView, unchanged center blur, accessibility,
  geometry and unsupported/missing native target fallback.
- `C:\mscratch\apps\mobile\src\features\home\screens\CustomerHomeScreen.tsx`: initial render 4 rows,
  batch 3, window 5 viewport lengths. Keep clipping disabled for complex glass
  and sticky layouts. No data, layout, offset or pagination changes.
- `C:\mscratch\apps\mobile\android\app\build.gradle`: code `21`, name `1.15.4`.
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`: checkpoint and verification evidence.
- `C:\mscratch\apps\mobile\docs\SCROLL_PERFORMANCE_V1_15_4.md`: this report.

Center blur remains 22 with reduction 2.5. Rim depth 5, capture inset 16 and bend
10 remain unchanged. Text/icons stay outside the backdrop effect. iOS retains
its existing native system glass; Android below API 33 retains existing fallback.

## Automated Checks

- TypeScript and scoped ESLint passed.
- Jest: 187 suites / 954 tests passed.
- Full signed ARM64 release passed in 5m 17s: 823 tasks, 40 executed.
- APK identity verified: `com.cravesapp`, code `21`, name `1.15.4`, ARM64.
- APK v2/v3 signatures verified. Signing SHA-1 remains
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`;
  SHA-256 remains `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Build log: `C:\mscratch\artifacts\v1154-release-build.log`.

## Delivered Checkpoint

- Source: `f808496eec0a8b983bacb1a391123b3d437c5724`.
- Tag: `KUSHIRAVI-app-v1.15.4`, previous tags untouched.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.4.apk`.
- APK SHA-256: `A11A4D22B98BF6BA73AB112176418CCB0E8E731113CB8B6F548F97CEAA01BDA7`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.4-source.zip`.
- ZIP SHA-256: `E378E1E7EC3166AB20522C7E77B83B49A372E5ED1C24223942E3D2104D4B6CB9`.
- ZIP contains the Gradle wrapper, native renderer, lockfile and build script;
  no node_modules or private .env. It is archived from the exact source commit.
- Replace-installed on `RS7PB6VOY9ZLLFYD` at `2026-09-30 18:55:35`, preserving data.
  Later evidence-only documentation commits do not change this APK/tag/archive.

## Live Verification

- The bounded shader activated for photo capsules and Customer/Chef menus.
  No fallback/error entries in `C:\mscratch\artifacts\v1154-native.log`.
- Food cards, fast/deep flings, direction reversals and native pinned/unpinned
  rail checked in the repeat profiles and screenshots.
- Real photo details/colors still bend along the fixed menu rim. Between screenshots
  `v1154-rim-a.png` and `v1154-rim-b.png`, 93.72% of the selected top-edge band
  changed (x 220..859, y 2155..2174, mean channel difference threshold > 8).
  Native geometry and optical uniforms remain unchanged; this pixel comparison
  demonstrates a changing background, not a performance or identical-image proof.
- Customer Home/Chefs/Orders/Profile navigation and scrolling checked; black
  labels/icons and native selection ticks retained (`v1154-haptics.log`).
- Chef Dashboard/Profile scrolling and menu rendering checked. Both Chef and
  Customer reopened on the selected side after force-stop. Returned to Customer Home.
- Post-install crash buffer empty: `C:\mscratch\artifacts\v1154-crashes.log`.
- Screenshots under `C:\mscratch\artifacts\v1154-*.png`; these are ignored runtime
  evidence, not packaged source assets. No live order/payment/favorite/menu mutation.

## Repeatable Phone Test

1. Cold reopen Customer Home and allow data/images to settle.
2. Reset Android `gfxinfo` counters for `com.cravesapp`.
3. Repeat three times: swipe `(540,1750)` to `(540,650)` over 700 ms, then
   `(540,700)` to `(540,1800)` over 700 ms.
4. Capture `dumpsys gfxinfo com.cravesapp framestats`. Compare the first aggregate
   summary once; the later per-window summary repeats the same counters.
5. Fast fling down/up deeper into the feed. Check for blank rows, clipped glass,
   retained scroll position and a single smoothly pinned/unpinned category rail.
6. Check that photo and menu rims still reflect changing backgrounds, while text,
   icons, center blur and haptics remain unchanged.
7. Open existing Customer tabs and scroll their content; check crash/shader logs.
   Do not create orders, pay, modify favorites or toggle Chef availability.

## Rebuild / Rollback

Use `C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.
The installable source is archived from its exact source commit, excluding
dependencies, private environment files and runtime logs. Signing remains the
existing Firebase-registered certificate. Replace-install preserves app data.
Previous version tags remain untouched; source rollback can use
`git switch --detach KUSHIRAVI-app-v1.15.3` without overwriting its checkpoint.

## Limitations

No iOS or older Android hardware is available. Their capability/fallback paths
are covered by component tests, not measured hardware performance. Device
screen recording is unavailable, so validation uses live gestures, screenshots,
native logs and Android frame profiling. No actual payment/order was submitted.

Separate observation: the second existing promo slide sometimes displayed its
blank placeholder. The carousel code was not edited and its packaged image bytes
match v1.15.3 (SHA-256 `B53E1BDF3640514A4F30D2EF7798A54F09F96E5EED91AF5871FFFAE8AA48E930`).
Its cause and whether it predates this update are not confirmed. It is not claimed
fixed here; do not conflate this observation with feed virtualization blanks or
claim every existing UI issue is resolved by the scrolling performance patch.
