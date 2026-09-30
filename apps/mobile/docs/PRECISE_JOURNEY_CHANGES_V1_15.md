# Precise Menu and Journey Changes - Version 1.15

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
- `android/app/build.gradle`: versionCode 17, versionName 1.15.
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

- TypeScript and 186 suites / 938 tests passed before release build.
- Build/install SHA, APK hash, signing and live checks will be recorded below after verification.
- Use `scripts\build-kushiravi-release-apk.ps1` to rebuild from the branch/source ZIP.
- No Azure/DevOps/GitHub work or paid infrastructure changes are required.
- iOS hardware verification is not possible on this Windows/Android device. On a Mac,
  refresh CocoaPods/autolinking before building with the added Expo haptics package.
- Haptics follow device settings; unsupported/disabled hardware is a silent no-op.

Expo SDK 56 haptics reference: https://docs.expo.dev/versions/v56.0.0/sdk/haptics/.
