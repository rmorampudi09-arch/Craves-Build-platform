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
- Exact source/build/install evidence will be added after verification.

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

Pending final automated checks, signed release build and live phone checks.
