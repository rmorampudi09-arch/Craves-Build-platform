# KUSHIRAVI App Build - Version 1

This branch is the local baseline for the APK installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Android versionCode: `1`
- Android versionName: `1.0`
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

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
