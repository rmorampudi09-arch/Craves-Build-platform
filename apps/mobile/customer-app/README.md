# Craves Customer Mobile

React Native 0.86 customer application foundation with native Firebase Phone Authentication and device-secure Craves sessions.

## Current scope

```text
native Firebase phone OTP
  -> Firebase ID token in memory
  -> Craves Auth /firebase/exchange through APIM
  -> short-lived Craves session
  -> iOS Keychain / Android Keystore-backed secure storage
  -> authenticated application navigation
```

## Source tree

```text
App.tsx
src/auth/contracts.ts
src/auth/craves-auth.ts
src/auth/session-store.ts
src/auth/AuthProvider.tsx
src/navigation/RootNavigator.tsx
src/screens/PhoneOtpScreen.tsx
src/screens/HomeScreen.tsx
src/theme.ts
```

## Why native shells are not committed yet

The repository did not contain an approved Android/iOS native project. The included bootstrap script creates React Native 0.86 native shells exactly once and refuses to overwrite existing native projects:

```bash
CONFIRM_NATIVE_BOOTSTRAP=true bash scripts/mobile/bootstrap-customer-mobile-native.sh
```

Review the generated Gradle, Xcode and bundle identifiers before committing them in a later native-shell amendment.

## Firebase manual setup

### Android

- Register Android package `in.craves.customer` in the existing Firebase project.
- Add the required SHA-1/SHA-256 fingerprints for debug and release signing identities.
- Download `google-services.json` to `android/app/google-services.json`.
- Apply the React Native Firebase Google Services Gradle configuration.

### iOS

- Register the final iOS bundle ID in the existing Firebase project.
- Download `GoogleService-Info.plist` and add it to the Xcode application target.
- Enable Push Notifications/Background Modes only in the later notification module when required.
- Run CocoaPods on macOS.

These Firebase files are intentionally gitignored. Do not paste them into chat.

## Secure session behavior

- `react-native-keychain` stores the session using `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- AsyncStorage is not used for tokens.
- The exchange response is validated and refresh tokens are discarded.
- Sessions expire locally before the backend access token becomes unusable.
- A disabled identity is rejected.
- Sign-out clears secure storage and Firebase Auth state.

## Local commands after native bootstrap

```bash
cd apps/mobile/customer-app
npm install
npm run verify
npm start
npm run android
```

On macOS for iOS:

```bash
cd apps/mobile/customer-app/ios
pod install
cd ..
npm run ios
```

## CI

```text
azure-pipelines-customer-mobile-auth-ci.yml
```

The current CI validates TypeScript, domain tests, secure-storage controls, native-bootstrap syntax and absence of committed Firebase/signing files. Android/iOS native compilation begins only after the reviewed native-shell amendment and signing-independent Firebase test configuration are committed.

## Manual steps required

- Firebase Console registrations and phone provider configuration.
- Android SDK/JDK/Gradle environment for local Android build.
- macOS/Xcode/CocoaPods for iOS build.
- Apple Developer and Google Play setup only when preparing store releases.
- Android release keystore and iOS signing/provisioning must remain outside Git.

## Deferred

- order history and delivery tracking screens;
- address, catalog, cart and checkout;
- Cashfree native checkout;
- push notifications and deep links;
- chef mode;
- app-store deployment and signing pipelines.
