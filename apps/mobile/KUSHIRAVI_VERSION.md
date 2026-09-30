# KUSHIRAVI App Build - Version 1.10

This branch contains the local KUSHIRAVI Android app build line. Version 1 remains the known-good rollback point installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Current Android versionCode: `11`
- Current Android versionName: `1.10`
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

## Version Checkpoints

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
