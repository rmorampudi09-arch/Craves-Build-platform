# Chef Order Rejection v1.21

## Request and baseline

Install the APK, inspect the missing Reject action on the connected phone,
and fix only this flow. Keep the existing Craves UI and backend rules.

- Repository: `C:\mscratch`, branch `KUSHIRAVI-app-build`.
- Clean starting HEAD: `ffae3e945fee8030093806809af56e3a3980e080`.
- Previously installed source: `0e892a5b3517ddcf4725dce8e7552e12809d1b79`,
  immutable tag `KUSHIRAVI-app-v1.20`, code 31 / name 1.20.
- Connected device: `RS7PB6VOY9ZLLFYD`, RMX5003, 1080 x 2400.
- New package version: `com.cravesapp`, code 32 / name 1.21.
- No remote push. No synced ChatGPT project reference file edits.

## Observed cause

The New orders Reject button was enabled and successfully opened its modal.
The reason TextInput inherited `flex: 1` inside a content-sized bottom sheet.
It filled the remaining screen and pushed Cancel and Reject Order off-screen.
The native UI tree showed the title, explanation and reason field, but no
visible action buttons. This was reproduced without sending a rejection.

Order detail already showed both buttons. Both entry points now constrain
the reason field and body so longer text or keyboard resizing cannot grow
the body indefinitely and push the action row out of the sheet.

Before screenshot:
`C:\mscratch\artifacts\chef-rejection-v1.21-phone-20261002\new-orders-reject-before.png`.

## Exact changes

- `src/features/chefOrders/screens/ChefNewOrdersScreen.tsx`: removed unbounded
  input flex; kept its 112-point height; separated backdrop from sheet; made
  body scrollable/shrinkable within available height and footer non-shrinking;
  applied bottom safe area; displayed rejection errors inside the sheet;
  cleared stale feedback on open.
- `src/features/chefOrders/screens/ChefOrderDetailScreen.tsx`: same bounded
  body/footer/safe-area pattern; fresh draft on open; explicit accessible
  cancel/confirm labels; trim/blank/busy guard before rejection.
- `src/features/chefOrders/screens/ChefAcceptanceScreens.test.tsx`: added ten
  rendered rejection tests covering both entry points. Acceptance tests retained.
- `android/app/build.gradle`: versionCode 32 / versionName 1.21.
- `KUSHIRAVI_VERSION.md` and this receipt: version checkpoint/evidence.

No API contract, haptics, navigation layout, auth, finance, payment, delivery
routing, rejection reason policy or order state machine was changed.
Existing `/api/v1/chef/orders/{id}/reject` request is still `{reason}` with
UUID correlation and stable idempotency key. Server revalidation, account/
kitchen ownership checks and returned status reconciliation remain unchanged.

## Automated verification

- TypeScript: passes.
- Changed TS/TSX files: ESLint passes, zero warnings.
- Full Jest: 202 suites / 1,088 tests pass.
- Targeted API/domain/hook/screen checks: 5 suites / 38 tests pass.
- Final rendered screen rerun: 14 tests pass.

Both sheets were checked for fixed reason height/no input flex, a footer
outside the scrollable body, safe-area padding, disabled blank confirmation,
cancellation without mutation, trimmed reason, waiting for server success,
visible server failure, and in-flight close/duplicate submission guards.

## Build and installation receipt

- Immutable source: `5fac235a421f9541dfac40f3d82beee7fe6fad93`.
- Tag: `KUSHIRAVI-app-v1.21`; app commit:
  `fix(mobile): keep chef rejection controls visible above keyboard (v1.21)`.
- Built using the existing script with `-SkipNpmCi -PhoneOnly`; no new
  dependencies. Build passed in 4m 26s, 864 tasks (41 executed / 823 cached).
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`, 49,015,928 bytes.
- APK SHA-256:
  `0FDD5E1AF580FC645E63D557158960B541B8433A2FFB3B299DE11F4362663918`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21-source.zip`,
  13,337,908 bytes, made with `git archive KUSHIRAVI-app-v1.21`.
- ZIP SHA-256:
  `1B67F26F6CB0A788C37A054E8574E11F86CC3137719BC3C10356AFF55631EE1D`.
- ZIP inspection confirms the locked dependencies, environment example,
  existing keystore, build script, rejection screen and Android code 32 /
  name 1.21. The ZIP was not separately extracted and rebuilt in this task.
- APK metadata: `com.cravesapp`, code 32 / name 1.21, arm64-v8a.
- v2/v3 APK signature verification passes. Certificate unchanged:
  SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`;
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Replace-install returned Success. Device confirms code 32 / name 1.21;
  `lastUpdateTime=2026-10-02 03:38:39` Asia/Calcutta. Original
  `firstInstallTime=2026-09-30 03:39:04` is unchanged; no app data cleared.
- The phone's installed base APK SHA-256 matches the versioned APK exactly.
- Cold launch: Status OK, MainActivity, total time 487 ms / wait time 498 ms.
  Authenticated Chef side and the previous order detail were restored.

## Physical verification

Inspected fresh Android UI trees and screenshots on the connected phone.
No production Confirm reject or Accept/Ready action was pressed.

- Order detail: empty reason disables confirmation. Typed
  `Visibility check only`; with keyboard open, Cancel is at
  `[51,1350][527,1493]` and Confirm reject at `[558,1350][1029,1493]`.
  Both are visible/enabled above the keyboard. Cancel closes with one tap.
  The same order remains NEW.
- New orders: both buttons now visible without the keyboard (previously
  absent from the native UI tree). With keyboard open and the test reason,
  Cancel is at `[51,1371][527,1494]` and Reject Order at
  `[558,1371][1029,1494]`, visible/enabled above the keyboard. Cancel closes
  with one tap; order remains in New. Reopening shows an empty draft and
  disabled confirmation. Android Back closes the sheet.
- Current process ID 24477: zero matching fatal/ReactNativeJS error entries.
- Left the phone on Chef Orders -> New, with the rejection sheet dismissed.
- Physical iOS and actual production rejection/refund were not tested.
  Automated tests exercise successful/failed submission and status handling.

Screenshots inspected:

- `C:\mscratch\artifacts\chef-rejection-v1.21-phone-20261002\new-orders-reject-after.png`.
- `C:\mscratch\artifacts\chef-rejection-v1.21-phone-20261002\new-orders-reject-keyboard-after.png`.
- `C:\mscratch\artifacts\chef-rejection-v1.21-phone-20261002\order-detail-reject-keyboard-after.png`.
- Build log: `C:\mscratch\artifacts\chef-rejection-v1.21-phone-20261002\build.log`.

Existing SDK metadata/Gradle deprecation warnings were non-blocking; no
toolchain, dependency or CI/CD changes were made for this fix.

## Manual retest

1. Open Chef mode -> Orders -> New.
2. Tap Reject on a pending order. Confirm the reason field and both buttons
   are visible before and after the keyboard opens.
3. Enter a reason; confirm the rejection button enables. Cancel and verify
   the order remains unchanged. Reopen and verify a fresh empty draft.
4. Open order detail and repeat the form/keyboard/cancel check.
5. On a genuine fresh order that should be rejected, enter the reason and
   confirm once. Verify only server success removes it from New and updates
   the customer status. A server failure must stay visible, not show success.

Opening/cancelling the form does not reject an order. No production refund
or rejection will be triggered just to demonstrate button visibility.
The existing order on this device has a prior acceptance-expiry error;
expired-order acceptance is not bypassed by this UI fix.

## Rollback

Keep all previous tags untouched. `git switch --detach KUSHIRAVI-app-v1.20`
restores the preceding source; `KUSHIRAVI-app-v1` remains the original known-
good source checkpoint. Returning to the build branch preserves future work.
Android normally requires a higher versionCode for a replace-install, so a
source rollback should be rebuilt as a distinct higher-code checkpoint rather
than clearing phone data to downgrade.
