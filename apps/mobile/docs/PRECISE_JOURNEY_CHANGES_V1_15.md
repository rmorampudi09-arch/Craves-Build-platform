# Precise Menu and Journey Changes - Version 1.15.1

## Scope

Requested on 2026-09-30. Built from the exact v1.13 source on KUSHIRAVI-app-build.
Only the seven requested changes are implemented. Existing layouts, menu routes,
Cart shortcut, food/kitchen capsule optics, splash, APIs and backend are retained.
Customer tabs remain Home, Chefs, Orders, Profile; Chef's five tabs remain intact.
Screens intentionally hiding the menu (including payment/detail flows) keep that policy.

## Implementation Files (Relative to C:\mscratch\apps\mobile)

- `src/design/tokens.ts`: scoped black color token.
- `src/app/navigation/customerTabs.ts`, `chefTabs.ts`: black menu foregrounds.
- `src/app/navigation/CustomerBottomNavController.tsx`: consistent menu glass and haptic Cart action.
- `src/app/navigation/ChefRootNavigator.tsx`: glass menu with blur-connected scenes and reserved safe-area space.
- `src/shared/components/LiquidBottomTabBar.tsx`: reusable Chef glass menu, blur scenes and non-ripple tab button.
- `src/shared/haptics/customerHaptics.ts`: optional Expo selection haptics, silent failure.
- `src/features/auth/storage/activeRoleStorage.ts`: identity-scoped, ordered last-workspace writes; no credentials.
- `src/features/auth/state/activeRolePersistence.ts`, `src/app/store/store.ts`: persist authenticated role switches, clear on logout.
- `src/features/auth/hooks/useBootstrap.ts`: restore workspace before account resolution, without bypassing server authorization.
- `src/features/cart/cartInteractionPolicy.ts`: one payment label and exact final/displayed bill comparison.
- `src/features/cart/screens/CustomerCartScreen.tsx`: final validation then immediate Razorpay handoff for unchanged bills;
  changed amounts require review; synchronous in-flight lock; address changes blocked during payment preparation.
- `src/features/home/screens/CustomerHomeScreen.tsx`: native stickyHeaderIndices instead of delayed JS-mounted duplicate rail.
- `src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`: remove only the two specified descriptions.
- `package.json`, `package-lock.json`, `jest.setup.js`: compatible haptics dependency and native boundary test mock.
- `android/app/build.gradle`: versionCode 18, versionName 1.15.1.
- `KUSHIRAVI_VERSION.md`: checkpoint and rollback record.

Tests added/updated:

- `src/app/navigation/customerTabs.test.ts`, `chefTabs.test.ts`.
- `src/features/auth/state/activeRolePersistence.test.tsx`.
- `src/features/cart/cartInteractionPolicy.test.ts`.
- `src/features/cart/screens/CustomerCartScreen.test.tsx`.
- `src/shared/components/LiquidBottomTabBar.test.tsx`.
- `src/shared/haptics/customerHaptics.test.ts`.

## Payment Safety

The read-only preview remains the Cart bill. Continue to Payment still performs
the required server catalog, delivery and finance validation before Razorpay.
If every displayed amount and delivery address agree with the final checkout,
there is no duplicate bill-review step. A changed price/fee must be reviewed.
Existing pending-payment reuse, proof verification and recovery are unchanged.
Tests mock payment calls; no real payment is needed to verify the orchestration.

## Manual Checks

1. Open Customer Home, Chefs, Orders and Profile. Check black menu text/icons,
   the same glass finish, no expanding press circle and light haptics.
2. Add an available item, open Cart and review charges. Continue to Payment should
   open Razorpay after validation in one press when the bill is unchanged. Stop
   before payment unless intentionally placing a real order.
3. Change quantity/address before pressing payment. The bill must refresh; absent
   bill data must not allow a new payment. Changed final fees must stop for review.
4. Switch to Chef, close/force-stop and reopen. Chef must reopen; switch back to
   Customer and repeat. Account authorization/onboarding is still checked live.
5. Check all five Chef tabs: black text/icons, glass menu, no hidden bottom actions.
6. Scroll Home slowly/quickly across the category pin point, then reverse direction.
   One category rail must track the scroll continuously without swapping copies.
7. Open Customer Chefs. Confirm the two descriptions are absent and discovery still works.

## Verification and Delivery

- Initial v1.15 TypeScript and 186 suites / 938 tests passed before release build.
- Live v1.15 Chef switching exposed a hook-call crash: navigation invokes its tabBar
  callback as a regular function. The v1.15.1 renderer returns a React component,
  so all menu hooks run under React. Added an explicit callback regression test.
- Final TypeScript and scoped ESLint passed. All 186 suites / 939 tests passed
  in 44.269s. Test log: `C:\mscratch\artifacts\v1151-final-tests.log`.
- Android ARM64 signed release succeeded in 4m 21s: 823 tasks, 41 executed and
  782 up-to-date. Build log: `C:\mscratch\artifacts\v1151-release-build.log`.
- Installed tag: `KUSHIRAVI-app-v1.15.1`.
- Exact APK/source commit: `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
  Documentation-only evidence commits after this SHA do not change the APK/tag.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1.apk`.
  SHA-256: `F881C6A510ACD08BC4669EB586360D69B14B68315EDB0C5360195BCF8DF9BA1D`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-source.zip`.
  SHA-256: `2F38E94A763483FC98EFC919DAAA48051EB97215B795E46F2B86C90003C56A24`.
  Contains the complete tagged mobile source (905 entries); required build files
  were checked, and dependencies/private runtime logs are excluded.
- APK identity: `com.cravesapp`, versionCode 18, versionName 1.15.1,
  minSdk 24, targetSdk 36, native ABI arm64-v8a. APK v2/v3 signatures verified.
- Signing SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
- Signing SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  These match the existing registered Firebase certificate.
- Replace-install succeeded on `RS7PB6VOY9ZLLFYD` / RMX5003 (Android 16).
  Android reports name 1.15.1 / code 18 and `lastUpdateTime=2026-09-30 14:45:23`.
  App data was preserved; no uninstall, logout or storage clearing was performed.
- Use `scripts\build-kushiravi-release-apk.ps1` to rebuild from the branch/source ZIP.
- No Azure/DevOps/GitHub work or paid infrastructure changes are required.
- iOS hardware verification is not possible on this Windows/Android device. On a Mac,
  refresh CocoaPods/autolinking before building with the added Expo haptics package.
- Haptics follow device settings; unsupported/disabled hardware is a silent no-op.

## Phone Evidence and Limits

- Chef Dashboard reopened after force-stop on Chef, without switching to Customer:
  `C:\mscratch\artifacts\v1151-chef-reopen-ready.png`.
- Customer Home reopened after switching back and force-stop:
  `C:\mscratch\artifacts\v1151-customer-reopen.png`.
- All five Chef menus checked: Dashboard, Orders, Menu, Analytics, Profile.
  Glass surface and black labels/icons remained present. Menu's existing bottom
  action stayed above the bar: `C:\mscratch\artifacts\v1151-chef-menu.png`.
- Customer Home, Chefs, Orders and Profile menu visuals checked during the v1.15
  trial; the unchanged Customer implementation was rechecked on v1.15.1 Home/Chefs.
  The two requested descriptions are absent while live discovery still loads:
  `C:\mscratch\artifacts\v1151-chefs-final-ready.png`.
- Transparent ripple configured and tested; held-press screenshot has no expanding
  circle: `C:\mscratch\artifacts\v1151-menu-pressed.png`.
- Native Android haptic log records successful `com.cravesapp` selection ticks,
  `performHapticFeedback(constant=26)`, `Prebaked=TICK`, 16-31ms:
  `C:\mscratch\artifacts\v1151-haptics.log`.
- Slow and fast upward scrolling, then fast/slow reversed scrolling checked:
  `C:\mscratch\artifacts\v1151-sticky-at-top.png`,
  `C:\mscratch\artifacts\v1151-sticky-fast.png`,
  `C:\mscratch\artifacts\v1151-sticky-unpinned.png`.
  One native sticky rail was visible without the old delayed duplicate mount.
  This was a live visual check, not a frame-rate measurement.
- No Craves crash appears in the crash buffer since the final installation:
  `C:\mscratch\artifacts\v1151-crash-check.log`.
  That buffer contains a separate Android `media.swcodec` encoder crash; it is not
  an app crash, and the Craves process remained running.
- Payment first-press handoff, changed fee/catalog price review, checkout reuse,
  duplicate-press protection and missing-preview blocking were verified with
  mocked backend/Razorpay screen tests. No real payment completion is claimed.
  No live cart item, checkout/order, address or pending payment was changed in this task.
- Remaining manual checks: a deliberate real Cart-to-Razorpay attempt, payment
  completion/cancellation and iOS hardware. Stop before payment unless intentionally
  purchasing. Existing legacy unavailable Chef metrics are outside this request.
- Original `KUSHIRAVI-app-v1` and `KUSHIRAVI-app-v1.13` tags remain unchanged.
  Trial `KUSHIRAVI-app-v1.15` is not the accepted delivery; use v1.15.1 instead.

Expo SDK 56 haptics reference: https://docs.expo.dev/versions/v56.0.0/sdk/haptics/.
