# Chef Order Acceptance - Version 1.20

## Request and Scope

Remove the manual preparation-time entry when accepting a Chef order. Use the
ordered menu items' saved preparation time, with 15 minutes only for missing
times. Investigate the reported "This action is not available for your account"
error and verify the related acceptance flow without an unrelated UI redesign.

- Workspace: `C:\mscratch`.
- Branch: `KUSHIRAVI-app-build`.
- Clean starting commit: `68abc6244358666a49a019f3840af7116ad559e6`.
- Previous installed version: `KUSHIRAVI-app-v1.19`, code 30 / name 1.19,
  source `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`.
- New package: `com.cravesapp`, code 31 / name 1.20.
- New immutable tag: `KUSHIRAVI-app-v1.20`.
- No GitHub push, backend deployment, account/role grants or database changes.

## Confirmed Failure

On the connected phone, New orders displayed the reported account error, but
the same Chef order detail loaded successfully. The live Order Service logs
at 2026-10-01 21:05:08 UTC and 21:01 UTC showed:

`MethodArgumentTypeMismatchException: Method parameter 'X-Correlation-ID':
Failed to convert value of type 'java.lang.String' to required type
'java.util.UUID'; Invalid UUID string: mobile-...`

The mobile transport generated `mobile-<timestamp>-<random>` for every request.
Chef acceptance/rejection/ready controllers declare this header as `UUID`.
The deployed web acceptance wrapper already forwards a canonical UUID. This
contract mismatch prevents the mobile action reaching normal acceptance and
appears as the generic permission error on the phone.

APIM's Chef Orders API points at the existing Order Service with the expected
accept/reject/ready routes. Subscription enforcement is false; no API or
operation policy was present at the checked scopes. No access policy was
removed. A genuine role or ownership denial must still be respected.

## Changes

1. Mobile correlation IDs now use the existing Expo Modules Core native UUID
   generator. No new library, secret or authentication mechanism was added.
2. New orders cards accept directly; the preparation-time sheet is removed.
3. Order detail accepts directly; its numeric preparation-time input is removed.
4. The shared decision coordinator first revalidates the owned server order,
   then reads the Chef's existing menu if the order has no preparation time.
5. Use the longest preparation time among ordered items, matching the existing
   cart serviceability calculation. Item quantity does not multiply preparation
   time; unrelated dishes and other kitchens do not contribute.
6. Missing item preparation metadata uses the requested 15-minute fallback.
   A saved 5-minute item remains 5 minutes, not 15. Existing server order times
   remain authoritative. A failed menu request does not become a 15-minute
   guess and no acceptance is sent in that case.
7. Preserve duplicate-tap guards, stable idempotency keys, server status checks,
   rejection reasons, persisted preparation time and server delivery events.
8. A failed follow-up list refresh no longer changes a completed acceptance
   into an apparent failure. The returned authoritative status is reconciled.
9. An expired-order rejection retains the server's actual error even if the
   stored status is still pending; it is not replaced with a vague status message.

No acceptance-window override, manual paid order creation, refund/payment edit,
delivery replay, provider booking, Pidge/Borzo setting change or fabricated
success was performed for this task. Backend status/timer/event logic remains
unchanged. Only the specified time-entry UI and its now-obsolete copy changed.

## Exact Changed Paths

All paths below are relative to `C:\mscratch\apps\mobile\`:

- `src\core\http\correlation.ts`
- `src\core\http\correlation.test.ts`
- `src\features\chefOrders\domain\chefOrderPreparation.ts`
- `src\features\chefOrders\domain\chefOrderPreparation.test.ts`
- `src\features\chefOrders\domain\chefOrderDecision.ts`
- `src\features\chefOrders\domain\chefOrderDecision.test.ts`
- `src\features\chefOrders\state\useChefNewOrderActions.ts`
- `src\features\chefOrders\state\useChefNewOrderActions.test.tsx`
- `src\features\chefOrders\state\useChefOrderDecision.ts`
- `src\features\chefOrders\state\useChefOrderDecision.test.tsx`
- `src\features\chefOrders\screens\ChefNewOrdersScreen.tsx`
- `src\features\chefOrders\screens\ChefOrderDetailScreen.tsx`
- `src\features\chefOrders\screens\ChefAcceptanceScreens.test.tsx`
- `__tests__\integration\P122CrossFeatureFlows.test.ts`
- `__tests__\e2e\P123CriticalE2EJourneys.test.ts`
- `jest.setup.js`
- `android\app\build.gradle`
- `KUSHIRAVI_VERSION.md`
- `docs\chef-order-acceptance-v1.20-20261002.md`

## Automated Verification

- TypeScript: passed, `tsc --noEmit`.
- ESLint: all changed JS/TS/TSX files passed with zero warnings.
- Entire Jest suite: 202 suites, 1,078 tests passed on the final source.
- Coverage includes automatic item preparation, longest-item calculation,
  missing metadata, valid times below 15 minutes, kitchen isolation, preserved
  order time, unavailable menu retry, real permission rejection, unchanged
  rejection path, accept/reject races, stable idempotency and operational states.
- Rendered-screen tests confirm both entry points have no preparation-time
  form, directly call acceptance, disable decisions while busy, and do not
  navigate as if accepted on an actual failure.
- Hook tests confirm refresh failure cannot disguise acceptance success or
  overwrite the authoritative order conflict.
- UUID tests cover format/uniqueness and unchanged authentication/idempotency.

## Build and Install Receipt

- Final release build: SUCCESSFUL in 3m 9s, 864 tasks (24 executed, 840 up to date).
  A prior successful build was superseded locally by this final build after
  the expired-order feedback fix. Neither intermediate build was installed.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.20.apk`, 49,003,640 bytes.
- APK SHA-256: `AF4D9511673B198BB81631E804AB90BBC2B6F83BBE0B5806E4A448FD81D138E2`.
- APK metadata: `com.cravesapp`, versionCode 31 / versionName 1.20, arm64-v8a.
- Signature: v2/v3 verified, one signer, unchanged SHA-256 certificate
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Existing Gradle deprecation, SDK XML and manifest-merge warnings were
  non-blocking. No unrelated build-tool/native dependency upgrades were made.
- On the original installed version, confirmed the Chef menu API loads 16
  items. Read-only detail for the ordered test dish showed Preparation:
  "Not provided". This is precisely the requested 15-minute fallback case.
- Exact tagged source/archive and replace-install evidence are recorded in
  the subsequent installation receipt. No prior tag or APK is overwritten.

## Manual Acceptance Checks

1. Open the installed app and confirm the authenticated Chef side restores.
2. Open Orders -> New. For a fresh paid order, tap Accept Order once. No time
   entry should appear. Verify it moves to Preparing with the saved item time.
3. For another fresh order, open its detail and tap Accept order. Verify the
   same behavior and automatic return to Orders.
4. With multiple ordered dishes, verify the longest saved preparation time.
   When a dish has no saved time, verify its 15-minute fallback is considered.
5. Repeated taps must not produce a second decision/event or delivery booking.
6. Verify rejection still requests a reason; do not reject a real customer
   order merely for testing. Check an expired/already-decided order cannot
   bypass its existing server deadline/state.
7. On a genuine accepted order, verify Ready for pickup and subsequent customer
   status updates and Pidge handoff. These are production actions, not fake
   successful states. Keep the order ID for a focused live-log check.

No Azure Portal, APIM, DNS, signing-key, new resource or account-permission
manual step is required for this mobile fix. Real paid acceptance and delivery
completion require a genuine customer order and Chef action; automated tests
are not evidence of a completed production delivery.

## Rebuild and Rollback

Use the existing script:

`C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`

The verification build uses `-SkipNpmCi -PhoneOnly` with the existing locked
dependencies and arm64 phone. For a fresh source archive use the normal script
with Node, JDK 21 and the Android SDK installed; it performs `npm ci`.

Known-good Version 1 remains `KUSHIRAVI-app-v1` and all earlier tags are left
untouched. For the immediately previous app source:

`git switch --detach KUSHIRAVI-app-v1.19`

Do not continue app development from detached HEAD. Return to
`KUSHIRAVI-app-build` (or a branch explicitly created from it). Android will
normally refuse installing an older versionCode as an update; do not uninstall
or clear user data as an automatic rollback step.
