# Craves v1.15.4 - Scrolling Performance

## Scope

Correct the Android scrolling regression in the v1.15.3 live glass renderer.
Preserve the approved appearance, native sticky rail, navigation and business
flows. Work only on `KUSHIRAVI-app-build` in `C:\mscratch\apps\mobile`.
No GitHub push, backend deployment, dependency addition or payment/order mutation.

## Diagnosis

The previous rim used a second Expo BlurView per glass surface. The underlying
Android blur controller allocates its effect node at the entire target's size,
not just the capsule's size. Combined with the Home feed's default render window,
this accumulated large rendering buffers and off-screen views.

Controlled baseline on device `RS7PB6VOY9ZLLFYD` (RMX5003, Android API 36),
installed version `1.15.3`, code `20`, source
`a77b95c8ebc2b5089d72a93413e1e306ca7925e0`:

| Metric | Before |
| --- | --- |
| Frames during six swipes | 111 |
| Janky frames | 110 (99.10%) |
| Frame latency median / p90 / p95 / p99 | 89 / 101 / 105 / 109 ms |
| GPU median / p90 | 11 / 14 ms |
| Scratch render targets | 421.58 MB |
| Attached views | 2443 |

Evidence: `C:\mscratch\artifacts\v1154-before-frames.log`.
Latency percentiles include Android pipeline delays and are not an FPS estimate.

## Changed Files

- `android/app/src/main/java/com/cravesmobile/CravesGlassReflectionView.kt`:
  directly capture only the rim's bounded rectangle into a native RenderNode;
  reuse cached child drawing and capture until source/position/geometry changes;
  use an analytic rounded-edge normal; release capture on detach and skip hidden
  rims. Keep shader failure safe and reject recursive ancestor capture.
- `android/app/src/main/java/com/cravesmobile/CravesGlassReflectionManager.kt`:
  pass the public React Native backdrop tag to the native view.
- `src/shared/components/LiquidGlassReflection.tsx`: remove the extra BlurView;
  pass the existing target's native tag, retaining optional native support and
  silent fallback. No JavaScript scroll loop or bitmap capture.
- `src/shared/components/LiquidGlassReflection.test.tsx`: verify direct target
  plumbing, no additional BlurView, unchanged center blur, accessibility,
  geometry and unsupported/missing native target fallback.
- `src/features/home/screens/CustomerHomeScreen.tsx`: initial render 4 rows,
  batch 3, window 5 viewport lengths. Keep clipping disabled for complex glass
  and sticky layouts. No data, layout, offset or pagination changes.
- `android/app/build.gradle`: code `21`, name `1.15.4`.
- `KUSHIRAVI_VERSION.md` and this document: checkpoint and verification evidence.

Center blur remains 22 with reduction 2.5. Rim depth 5, capture inset 16 and bend
10 remain unchanged. Text/icons stay outside the backdrop effect. iOS retains
its existing native system glass; Android below API 33 retains existing fallback.

## Automated Checks

- TypeScript and scoped ESLint passed.
- Jest: 187 suites / 954 tests passed.
- Signed release, exact commit/tag, APK/source hashes, install and repeat phone
  profiling will be recorded after verification. No successful native compilation
  is claimed from a bundle-excluded compile shortcut; the complete release build
  is the Android compilation gate.

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
