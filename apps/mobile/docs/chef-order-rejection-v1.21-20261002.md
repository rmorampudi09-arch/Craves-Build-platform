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

Build, exact immutable source SHA/tag, APK/ZIP hashes, signature and actual
phone verification will be recorded after they have completed. This section
does not claim a new installation until the physical device confirms it.

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
