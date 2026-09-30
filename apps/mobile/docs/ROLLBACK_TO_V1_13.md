# Restore Craves v1.13

## Requested Result

Return the active Craves mobile app on `KUSHIRAVI-app-build` and the connected
phone to v1.13's exact UI/functionality. No new screen design, business logic,
backend deployment or GitHub push. v1.14 remains available in local history/tag;
the user requested rollback, not deletion.

## Source and Installation Strategy

- Original baseline: `KUSHIRAVI-app-v1.13`, commit
  `2e91f049976686ea082babe9b66e3923c65ec994`.
- Revert only the two v1.14 implementation/evidence commits, preserving history.
- All app code/assets/configuration match the original v1.13 tag, except
  `android/app/build.gradle` versionCode and version/evidence documentation.
- Restore blur 22, v1.13 capsule tint/lighting, red active customer tab, muted
  inactive tabs and regular labels. Remove v1.14 inner glow/selected-tab capsule.
- Keep versionName `1.13`; use versionCode `16` only to preserve app data.
- The original code-14 APK was rejected with `INSTALL_FAILED_VERSION_DOWNGRADE`
  while code 15 was installed. A new code-16 build allows replace-install;
  uninstall, data clearing and phone security changes are unnecessary.
- New installable checkpoint: `KUSHIRAVI-app-v1.13-restored`. Original v1.13,
  Version 1 and v1.14 tags/APKs remain untouched.
- Planned APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.13-restored.apk`.
- Planned source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.13-restored-source.zip`.

## Manual Checks

1. Open the app and confirm the existing login/session is retained.
2. On Home, check kitchen and food capsules have v1.13's prior tint and soft edges,
   without v1.14's white inset glow or thin uniform white outlines.
3. Confirm the Home menu active icon/label is red, inactive icons/labels muted,
   labels regular weight, and the v1.14 selected-tab capsule is absent.
4. Scroll and switch between Home/Chefs; confirm layout and navigation remain as
   before. Do not mutate favorites/cart or enter checkout/payment for UI testing.

## Evidence

Build, tests, exact restored source SHA, APK/ZIP hashes, tag and phone installation
details are recorded after verification. Phone remains v1.14 until then.
Runtime source/assets/configuration comparison against the original tag passed,
excluding Android versionCode and documentation. TypeScript, scoped ESLint and
182 suites / 925 tests passed before release.
