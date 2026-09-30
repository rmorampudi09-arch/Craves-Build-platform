# KUSHIRAVI App Build - Version 1.12 Prepared

This branch contains the local KUSHIRAVI Android app build line. Version 1 remains the known-good rollback point installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Prepared Android versionCode: `13`
- Prepared Android versionName: `1.12`
- Last verified installed version: `1.11` / versionCode `12`, commit `97adc82ffd582476d41b1d78070c36e84fb65687`, tag `KUSHIRAVI-app-v1.11`
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

## Version Checkpoints

### Version 1.12 Prepared - Read-only cart bill and precise capsule adjustments

- Status: local source checkpoint; not yet published, built, tagged or installed.
- Commit: the local commit containing this entry; resolve with `git log -1 -- apps/mobile/KUSHIRAVI_VERSION.md`.
- Installable tag: pending verified backend/APIM publication and APK build. No existing tag is changed.
- Android versionCode: `13` (prepared)
- Android versionName: `1.12` (prepared)
- APK path: none for this checkpoint. The phone remains on `KUSHIRAVI-app-v1.11`.
- Changes:
  - Prepare an authenticated read-only cart bill preview using the existing backend finance policy for platform fee, delivery fee, GST and total.
  - Refresh the bill after confirmed cart/address changes, without creating checkout orders, payments or clearing the cart. Checkout retains its authoritative final bill and existing Razorpay behavior.
  - Change only the Popular Near You unselected favorite outline to white; selected hearts remain red.
  - Reduce image-capsule blur from 48 to 38 and strengthen its rounded reflective rim. Bottom menu blur and all other screen layouts remain unchanged.
- Safety: `CART_BILL_PREVIEW_AVAILABLE` remains false until the production route is verified. Do not describe the prepared cart work as a live fix.
- Approved deployment target: subscription `721906c9-4a72-4606-830b-d3e7ace093ff`; directory `1e7e43ac-c7f5-4d47-a74f-289a7cc21508`. The open Azure portal confirms both; deployment-tool authentication is still required.
- Verification: TypeScript and scoped ESLint passed; 62 mobile tests across ten suites passed; Order Service 55 tests and Integration Service 76 tests passed. The eleven focused preview backend tests also pass when applied to newer main source `13710384`, with both modules' complete sources and test sources compiling.
- Changed files, contract, security checks, deployment precautions and manual test steps: `C:\mscratch\apps\mobile\docs\CART_BILL_PREVIEW.md`.
- No Azure resources were modified, no live payments were made, and nothing was pushed to GitHub.

### Version 1.11 - Changes document card surfaces and order visibility

- Requested changes: `C:\Users\saive\Downloads\Changes.docx` (2026-09-30)
- Tag: `KUSHIRAVI-app-v1.11`
- Commit: resolve with `git rev-parse KUSHIRAVI-app-v1.11`; the APK build evidence records the full SHA.
- Android versionCode: `12`
- Android versionName: `1.11`
- APK path: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.11.apk`
- Buildable source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.11-source.zip`
- Change summary:
  - Use a shared liquid-style surface for the existing home dish capsules, nearby kitchen capsules, and bottom menu, with connected Android blur targets and rounded reflective rims.
  - Center the existing bottom menu icons and labels vertically while retaining Home, Chefs, Orders, Profile and the conditional Cart action.
  - Fix kitchen photo paging; derive the dots from the actual photo offset and show a compact moving dot window for larger galleries.
  - Remove the reserved second biography line and reduce the gap before the kitchen starting price.
  - Hide PAYMENT_PENDING orders in All/Upcoming when the last server update is over ten minutes old, with automatic expiry while Orders is open. Use createdAt if updatedAt is invalid; never remove or cancel server orders.
  - Keep every paid, delivered, cancelled, and refund order visible under its existing lifecycle tab.
  - Retain the existing Razorpay integration and all other screen layouts and backend contracts.
- Files changed (relative to `C:\mscratch`):
  - `apps/mobile/src/shared/components/LiquidGlassSurface.tsx`
  - `apps/mobile/src/features/home/components/KitchenImageCarousel.tsx`
  - `apps/mobile/src/features/home/components/KitchenImageCarousel.test.tsx`
  - `apps/mobile/src/features/home/components/HomePromoAndKitchens.tsx`
  - `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
  - `apps/mobile/src/features/favorites/components/CustomerFavoriteHeartButton.tsx`
  - `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
  - `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
  - `apps/mobile/src/features/customerOrders/presentation/customerOrdersPresentation.ts`
  - `apps/mobile/src/features/customerOrders/screens/CustomerOrdersScreen.tsx`
  - `apps/mobile/src/features/customerOrders/query/customerOrdersQueries.ts`
  - `apps/mobile/src/features/customerOrders/customerOrdersPresentation.test.ts`
  - `apps/mobile/jest.setup.js`
  - `apps/mobile/android/app/build.gradle`
  - `apps/mobile/KUSHIRAVI_VERSION.md`
- Verification: TypeScript, scoped ESLint, and 51 tests across nine suites passed. Build evidence and phone observations are recorded beside the versioned APK.
- Manual verification:
  1. Open Home and inspect the availability, food type, favorite, preparation-time, and rating capsules over food photos.
  2. Watch and swipe a kitchen with multiple photos; verify the visible photo and selected dot move together. A single photo has no cycling dots.
  3. Check the reduced biography/price gap and the centered four bottom tabs, including the Cart action when the cart has items.
  4. Open All Orders and Upcoming: pending payments older than ten minutes are absent; recent pending payments remain visible and still offer Continue Payment.
  5. Leave Orders open across a pending order's ten-minute boundary, then background/reopen the app and refresh. Verify paid and completed orders remain visible.

### Version 1.10 - Resume pending Razorpay orders from Order Details

- Tag: `KUSHIRAVI-app-v1.10`
- Commit: resolve from the local `KUSHIRAVI-app-v1.10` tag
- Android versionCode: `11`
- Android versionName: `1.10`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Reuse the existing primary action on payment-pending order details to continue its backend-issued Razorpay payment after leaving Cart or reopening the app.
  - Recheck checkout ownership and any persisted payment state before reopening the provider; retain unresolved attempts for backend verification.
  - Do not alter backend, pricing, orders, auth, or the completed-order UI.

### Version 1.9 - Preserve checkout review through cart clearing

- Tag: `KUSHIRAVI-app-v1.9`
- Commit: resolve from the local `KUSHIRAVI-app-v1.9` tag
- Android versionCode: `10`
- Android versionName: `1.9`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Keep the server-confirmed checkout and final bill on screen when the server clears the cart after order creation.
  - Do not discard a prepared checkout during automatic payment recovery when no provider attempt has started.
  - Keep the existing cart UI and Razorpay-only customer payment integration unchanged.
  - Pin Android Studio's Gradle daemon to Java 21 and stop the signing script on build failure.
  - Allow an ARM64-only phone verification build without changing the default full release build.

### Version 1.8 - Customer flow backend wiring fixes

- Tag: `KUSHIRAVI-app-v1.8`
- Commit: recorded in the final handoff for tag `KUSHIRAVI-app-v1.8`
- Android versionCode: `9`
- Android versionName: `1.8`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Cleared stale locally stored pending-payment attempts after 30 minutes so an old interrupted payment no longer blocks a new checkout forever.
  - Wired dish detail, kitchen profile, and all-dishes add-to-cart flows to the existing conditional switch-kitchen backend route when the cart already contains another kitchen.
  - Kept published APIM route coverage intact and preserved the existing UI layout and navigation.

### Version 1.7 - Checkout bill details and stale payment recovery

- Tag: `KUSHIRAVI-app-v1.7`
- Commit: `036a4677`
- Android versionCode: `8`
- Android versionName: `1.7`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Separated checkout bill preparation from payment order creation so delivery fee, platform fee, taxes, and final total appear before opening payment.
  - Prevented the app from creating a new pending payment order just to show Bill Details.
  - Cleared stale locally persisted pending-payment attempts when they belong to an older cart or delivery address, so users can start a fresh checkout.
  - Preserved existing backend APIs, payment provider logic, cart calculations, and order flows.

### Version 1.5 - Match CRAVES logo size across launch handoff

- Tag: `KUSHIRAVI-app-v1.5`
- Commit: `d54b03f14dccf34ef7bbc40eadd999790eabf0eb`
- Android versionCode: `6`
- Android versionName: `1.5`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Removed the React splash logo's initial scale-down so the CRAVES word stays the same apparent size when Android hands off to React.
  - Reduced the final fade-out scale change so the splash does not visibly shrink before navigation continues.
  - Preserved the existing native splash asset and post-splash navigation behavior.

### Version 1.4 - Keep CRAVES visible during native-to-React handoff

- Tag: `KUSHIRAVI-app-v1.4`
- Commit: `807692c31d79b7edaaf5b77f247b4d16b7590f90`
- Android versionCode: `5`
- Android versionName: `1.4`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Made the React splash render the CRAVES logo from its first frame instead of starting with logo opacity hidden.
  - Removed the delayed logo fade-in that caused a brief red-only gap between the native Android launch splash and the animated React splash.
  - Preserved the existing native splash logo, React splash animation, and post-splash navigation behavior.

### Version 1.3 - Matched native and React splash logo sizing

- Tag: `KUSHIRAVI-app-v1.3`
- Commit: `a09be19549fd23f3ab0c9d2018bb98190f902861`
- Android versionCode: `4`
- Android versionName: `1.3`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Added a padded Craves splash logo asset for Android's native launch screen to prevent the CRAVES letters from being cropped or oversized on first open.
  - Reused the same padded logo visual in the React splash animation so the first native frame and animated splash frame keep the same apparent logo size.
  - Preserved the existing post-splash navigation behavior.

### Version 1.2 - Streamlined Android startup handoff

- Tag: `KUSHIRAVI-app-v1.2`
- Commit: `de7bb67a5d39b808ffd939ce2aca46c168ef06f2`
- Android versionCode: `3`
- Android versionName: `1.2`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Changed the native Android launch splash from the default Android launcher icon to the Craves launcher icon.
  - Aligned the native launch background, status bar, navigation bar, and React splash background to Craves red to remove the visible white transition before the animated splash.
  - Preserved the existing post-splash navigation behavior: unauthenticated users continue to signin/signup and authenticated users continue to home.

### Version 1.1 - Splash screen integration

- Tag: `KUSHIRAVI-app-v1.1`
- Commit: `6778ffb2ccdb877f2a4b3d9d595b9be92b41c54b`
- Android versionCode: `2`
- Android versionName: `1.1`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Wired the approved Craves splash animation from the supplied ZIP into the existing React Native startup flow.
  - Reused only the ZIP splash animation and logo asset; did not import the ZIP sample login/home placeholder screens.
  - Preserved the existing app navigation decision after startup: unauthenticated users continue to the signin/signup flow, authenticated users continue to their home flow.

### Version 1 - Phone-installed baseline

- Tag: `KUSHIRAVI-app-v1`
- Commit: `679dd039f8ab1d6791083d39fdf43ae983ee5f5d`
- Android versionCode: `1`
- Android versionName: `1.0`
- APK source branch: `KUSHIRAVI-app-build`

## Installed APK

The Version 1 APK installed on the phone was built from this branch and signed locally with:

- Keystore: `apps/mobile/android/app/debug.keystore`
- SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

Those fingerprints are registered in Firebase project `cravesapp-dev` for Android app `com.cravesapp`.

## Local Build Rule

Every future app change should be committed on this branch or a branch made from it. For every meaningful change:

1. Update the Android version when producing a new installable build.
2. Commit the change locally.
3. Rebuild the APK with `apps/mobile/scripts/build-kushiravi-release-apk.ps1`.
4. Keep the generated APK path in the handover notes.

Do not modify `origin/mobile-ui-rebuild-from-scratch` directly for KUSHIRAVI app work.
