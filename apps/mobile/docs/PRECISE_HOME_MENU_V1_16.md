# Craves v1.16 - Precise Home and menu update

## Scope

Only the three requested visual/interaction changes, based on the approved
v1.15.1 restoration. Withdrawn v1.15.2+ implementations are not reused.
No backend, API, authentication, finance, cart/order, Razorpay, Chef business
logic, splash, glass optics, remote or CI changes. No GitHub push.

## Checkpoint

- Branch: `KUSHIRAVI-app-build`.
- Previous installed source: `cc551b94a96f3f8d033bc685a085cee1e83ff964`.
- Previous tag: `KUSHIRAVI-app-v1.15.1-restored`, code 22 / name 1.15.1.
- New version: code 23 / name 1.16; tag `KUSHIRAVI-app-v1.16`.
- New APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.16.apk`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.16-source.zip`.
- Source commit: `a035229b22d4399e8eb23ee1a46bc6770a9c0092`.
- Implementation commit: `efc38f501f27dec04c310e9e91093559082de1bf`.
  The final source adds only a regression-test callback-isolation correction.
  Android application implementation is identical in both commits.

## Files Changed

- `C:\mscratch\apps\mobile\src\shared\components\BottomMenuIcon.tsx`:
  menu-only House, ChefHat, ClipboardList and UserRound outlines. Chef Analytics
  uses a matching outline chart. Stable existing sizes; icons do not add a
  second accessibility label over the tab label.
- `C:\mscratch\apps\mobile\src\design\tokens.ts`:
  bottom-menu foreground tokens: active Craves accessible red `#D92714`, inactive
  neutral gray `#666666`, outline stroke 1.8. Other text/icon colors unchanged.
- `C:\mscratch\apps\mobile\src\app\navigation\CustomerRootNavigator.tsx` and
  `C:\mscratch\apps\mobile\src\app\navigation\ChefRootNavigator.tsx`:
  use the shared menu icons without changing destinations or state behavior.
- `C:\mscratch\apps\mobile\src\app\navigation\customerTabs.ts` and
  `C:\mscratch\apps\mobile\src\app\navigation\chefTabs.ts`:
  apply active/inactive foreground to both labels and icons.
- `C:\mscratch\apps\mobile\src\features\home\components\HomeCategoryRail.tsx`:
  use the already-installed gesture-handler ScrollView for native horizontal
  touch arbitration. Retain nested scrolling, direction lock, keys, selection,
  layout and a single mounted rail. Home's native stickyHeaderIndices unchanged.
- `C:\mscratch\apps\mobile\src\features\home\components\KitchenImageCarousel.tsx`:
  disable manual photo scrolling, remove obsolete user-drag tracking, retain
  automatic two-second paging, real-position dots and kitchen taps. AppState,
  reduced-motion and inactive-screen safeguards unchanged. The separate horizontal
  list of kitchen cards remains scrollable; only photos inside each card change.
- `C:\mscratch\apps\mobile\package.json` and
  `C:\mscratch\apps\mobile\package-lock.json`:
  pin `lucide-react-native` 1.49.0. Reuse existing react-native-svg 15.15.4;
  no new native module. Public per-icon exports avoid importing the entire set.
- `C:\mscratch\apps\mobile\jest.config.js`:
  map those public icon exports to the library's CommonJS files only in Jest.
  Metro continues to use the normal React Native exports.
- `C:\mscratch\apps\mobile\src\shared\components\BottomMenuIcon.test.tsx`,
  `C:\mscratch\apps\mobile\src\features\home\components\HomeCategoryRail.test.tsx`,
  `C:\mscratch\apps\mobile\src\features\home\components\KitchenImageCarousel.test.tsx`,
  `C:\mscratch\apps\mobile\src\app\navigation\customerTabs.test.ts`, and
  `C:\mscratch\apps\mobile\src\app\navigation\chefTabs.test.ts`:
  targeted foreground, icon, gesture, automatic-paging and pause regressions.
- `C:\mscratch\apps\mobile\android\app\build.gradle`:
  versionCode 23 / versionName 1.16.
- `C:\mscratch\apps\mobile\AGENTS.md`,
  `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`, and this document:
  checkpoint and verification records. Older checkpoints remain untouched.

## Manual Test Steps

1. Cold-open Customer Home. Home icon and label must be red; other tabs must be
   softer gray outlines. Tap each tab and return Home. Active color must follow
   the selection, haptics remain, no large press ripple or layout change.
2. Scroll Home until the category row is pinned beneath the location header.
   Swipe it left and right, then scroll several dishes farther down and repeat.
   All nine categories must remain reachable; vertical position must not jump.
3. Reverse the vertical scroll through the pin/unpin boundary. The same category
   row must move continuously with no duplicate row, gap, remount or offset reset.
4. Tap a category and All. Existing filtering must remain; horizontal dragging
   must not accidentally select a category.
5. At Nearby kitchens, watch a multi-photo card advance every two seconds and
   wrap. Dots must follow the displayed photo. Swipe a photo: it must not manually
   page. Tap the card: the existing kitchen screen must still open.
6. Background and reopen the app. Automatic photos pause offscreen/background.
   With reduced motion enabled, photos do not animate automatically.
7. Open Chef workspace and change tabs. Existing destinations remain and menu
   foregrounds/icons follow the same visual rule. Return Customer Home.

These checks do not place orders, change favorites, submit payments or edit Chef
data. Physical gesture smoothness must be verified on the phone, not inferred
from unit-test props alone. iOS requires a separate device check.

## Rebuild

Extract the source ZIP and run `apps\mobile\scripts\build-kushiravi-release-apk.ps1`
from its saved source tree, or run that script from the local tagged checkout.
Use the established local runtime environment configuration, Android SDK and
JDK 21. Secrets and local environment files are not included in the ZIP.

Library references: [Lucide React Native](https://lucide.dev/guide/react-native)
and [Gesture Handler native wrapping](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gesture-handlers/nativeview-gh/).

## Verification

- TypeScript: `--noEmit` passed, including the final source.
- Scoped ESLint passed, including a final check of the corrected carousel test.
- Full Jest: 188 suites / 950 tests passed in 418.745 seconds. An initial run
  had one newly-added background test invoking an old mocked listener. Clear the
  mock history and use the current mounted listener; no application change needed.
- Established release script with `-SkipNpmCi -PhoneOnly`: success, 26m 5s,
  823 tasks (41 executed, 782 up-to-date). Bundle and 35 assets generated.
- APK metadata: com.cravesapp, code 23 / name 1.16, arm64-v8a.
- V2/V3 signatures verify; unchanged registered certificate:
  SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`;
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- APK SHA-256: `B3C953B7C4F8A1AD3DF39E658FD68463399D20D539C9F8111363004D4F45FD3D`.
- Source ZIP SHA-256: `9EEBBD2D36F252792D7AE87B98D48D5FA5BCD798014B6B54593D12EECCC765BD`.
  911 entries from the tag; wrapper, lockfile and build script verified. Local
  environment files, node_modules and generated builds excluded.
- Phone RS7PB6VOY9ZLLFYD / RMX5003: replace-install success without clearing data.
  dumpsys confirms code 23 / name 1.16, lastUpdateTime 2026-09-30 22:24:55.
- Live visual/touch checks: awaiting the user's phone unlock. NotificationShade
  has focus over Craves and screenshots are black. Window policy confirms secure
  keyguard showing and the display off/dozing; no attempt to bypass it.
  This is not a verified app
  rendering failure or a claim that the scrolling fix was tested physically.
- No ReactNativeJS, AndroidRuntime or fatal-native errors since installation;
  log filtered from 2026-09-30 22:24:55 saved as v1.16-installed-errors.log.
- Before-change reproduction: horizontal swipe works just after pinning but is
  ignored deeper in the feed. Evidence: v1.16-before-horizontal.png and
  v1.16-before-deep-horizontal.png in C:\mscratch\artifacts.

Build/test logs: `C:\mscratch\artifacts\v1.16-release-build.log`,
`v1.16-full-tests-final.log`, `v1.16-typescript-final.log`, `v1.16-eslint.log`
and `v1.16-final-test-eslint.log` in the same artifacts directory.

The tag and source ZIP retain the exact build checkpoint. Later documentation
commits record build/install results only and do not replace the tagged source.
