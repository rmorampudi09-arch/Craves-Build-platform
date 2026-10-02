# Chef Registration Routing - 2026-10-02

## Scope And Baseline

Source: `C:\mscratch`, branch `KUSHIRAVI-app-build`, clean starting commit
`859afe8b0b7a6e71433a0e5d9e4458fe8cc1df4a`.
Installed starting release: `KUSHIRAVI-app-v1.23`, Android `1.23` / code `34`.
Initial routing release: Android `1.24` / code `35`, package `com.cravesapp`.
Installed follow-up recovery release: Android `1.24.1` / code `36`.

The user requested the phone's new-Chef account verification error to be fixed,
and the application journey verified through submission and Admin receipt.
Do not redesign screens, change other customer/Chef journeys, push to GitHub,
invent an applicant, approve an application, or bypass email/KYC checks.

## Observed Failure And Fix

The connected RMX5003 phone displays AccountRouter's
"We could not verify your account", with the Chef-access mismatch message,
after successful phone authentication. This is not an SMS-delivery error.
Original screenshot: `C:\mscratch\artifacts\chef-registration-live-20261002\phone-error-before.png`.

The old resolver rejects a non-approved application whenever `/auth/me` already
contains CHEF. A read-only check of the existing live services reproduces that
state: an ACTIVE identity has CUSTOMER/CHEF, but no Chef application exists.
The exact owner of the connected phone was not yet confirmed from those database
results. Live phone retesting is required before attributing the account record.

Non-approved owners now enter existing onboarding: NOT_SUBMITTED opens the form;
PENDING opens review status; REJECTED permits correcting and resubmitting.
Full Chef mode still requires ACTIVE identity, CUSTOMER and CHEF roles, a matching
application identity ID, and an APPROVED application. The change grants or revokes
no backend roles. A malformed application response is not accepted as approval
or successful submission.

## Changed Files

- `src/features/auth/state/accountResolutionService.ts`: application ownership
  check and non-approved owner routing; approved/role checks remain intact.
- `src/features/auth/api/profileApi.ts`: validate exact application state before
  routing or confirming submission; preserve the original response fields.
- `src/features/auth/state/accountResolutionService.test.ts`: owner/role/status
  regression matrix, inactive-account and foreign-application checks.
- `src/features/auth/api/profileApi.test.ts`: correct no-application response and
  malformed GET/POST response tests.
- `src/features/auth/screens/ChefOnboardingScreens.test.tsx`: email-specific
  verification gate, normalized address submission, retry/validation errors,
  pending confirmation, rejected resubmission, restored review status, proof
  controls, and fresh approved-account resolution.
- `android/app/build.gradle`: version `1.24` / code `35` only.
- `KUSHIRAVI_VERSION.md` and this file: version and verification record.

No screen styles, navigation layout, OTP-provider configuration, bank/payment
logic, backend service code, APIM policy, or Admin approval decision changes.

### Live Restart Follow-Up

The 1.24 build succeeds in 38m 7s (859 tasks), verifies the previous signer and
replace-installs at 12:40:28 IST. Cold launch succeeds, but the old failed Chef
login never persisted its selected role. Restoring that session therefore opens
the existing Customer profile form, which had no sign-out control.

The 1.24.1 follow-up changes `state/activeRolePersistence.ts` to save per-identity
workspace intent on authenticated login, before resolution. Unauthenticated
attempts remain unpersisted, and this never grants Chef authority. Existing
bootstrap restores the intent before the backend account router runs.

`screens/CustomerRegistrationScreen.tsx` and `screens/ChefRegistrationScreen.tsx`
gain the existing outline Sign out control, using `logoutCoordinator.ts`. It is
disabled during submission/loading, and the primary submission is disabled while
logging out. This is a functional exit from a wrong-role form, not a redesign.
No applicant field, email gate, submission contract, approval requirement or
styling is changed. Three role-persistence tests and two registration-exit tests
are added; focused recovery/logout verification passes 21 tests in three suites.
The original routing release and tag are not replaced or deleted.

1.24 source/tag checkpoint: `a4d6e390b6aaa5d90bf4f3291c640c8a37659827`,
`KUSHIRAVI-app-v1.24`.
APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.apk`, SHA256
`08C3057B032E71ABFF5E5E85EC2BDF50B72E343358A231812983D25F1CD7633E`.
Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24-source.zip`, SHA256
`A3BEAB0B67B9A06FCDD38DC617F0607F24EC689C4AE39D2948FD6B595BDA7BB2`.
This archive is the immutable 1.24 checkpoint, with 1,123 entries and no private
`.env`; the build script, lockfile, Gradle wrapper and signing file are present.
The 1.24.1 APK/archive are distinct files with a distinct immutable tag.
The follow-up's full suite passes: 204 suites / 1,113 tests, 76.702 seconds.
TypeScript and targeted ESLint also pass. No new library or native dependency is
added. React review retains existing components, event-handler-driven logout,
per-identity intent storage, submission/loading guards and accessible buttons.

### Installed 1.24.1 Evidence

Source/tag checkpoint: `7cb18d405033e978475798336226d9832f794f28`,
`KUSHIRAVI-app-v1.24.1`. This installation receipt is a subsequent documentation
commit; it does not replace the tagged source or its immutable source archive.

APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1.apk`, SHA256
`7BE828C7F7B0BF44166ADDC8A53EA5E19308734AF500A3EEBD8225246B35118A`.
Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1-source.zip`, SHA256
`6DCA641691566CB7A1C313C8AAF3D11C5F5873D443716AEE8FDAA7C36612DFA0`.
The ZIP contains 1,123 entries, required rebuild files and no private `.env`.

All-architecture release build succeeds in 3m 14s: 859 tasks, 77 executed and
782 up-to-date. APK v2/v3 signatures verify with the previous release's signer.
Replace-install succeeds at 2026-10-02 12:48:21 Asia/Calcutta on
`RS7PB6VOY9ZLLFYD` / RMX5003. The phone reports name 1.24.1 / code 36; cold launch
of MainActivity succeeds. No uninstall or app-data clear was performed.

The restored old session opens an empty Customer registration form. The new
coordinated Sign out action returns to the existing role picker; choosing Chef
opens the existing phone sign-in screen. This recovery creates no profile or
application. The owner subsequently completes sign-in and asks for another
screen check. At 12:54 IST the phone shows Become a Chef with the existing
registration form and empty applicant fields, not the original account error.

Screenshots:
- `C:\mscratch\artifacts\chef-registration-live-20261002\phone-chef-sign-in-v1.24.1.png`
- `C:\mscratch\artifacts\chef-registration-live-20261002\phone-chef-registration-v1.24.1.png`

Actual applicant details, owner-controlled email verification, submission and
the matching Admin pending request remain outstanding. Neither unit tests nor
unrelated existing Admin applications are evidence of this applicant's receipt.
No backend/APIM changes or Admin approval/rejection were made in this task.

### Requested Current-Location Follow-Up

After successful Chef sign-in, the user reports that the registration address
has no current-location control. The precise 1.24.2 follow-up adds the existing
outline/icon button above the address fields, without restyling the screen.

Changed files:
- `src/features/auth/screens/ChefRegistrationScreen.tsx`: explicit foreground
  location action, existing backend reverse lookup, address fill, status/errors
  and submission/loading/logout guards. Preserve rejected application pins;
  city/state/pincode edits invalidate detected coordinates.
- `src/features/auth/domain/chefApplicationOnboarding.ts`: available-address
  mapping and finite/range-validated coordinates in the existing POST payload.
- `src/features/auth/screens/ChefOnboardingScreens.test.tsx` and
  `src/features/auth/domain/chefApplicationOnboarding.test.ts`: 19 new tests.
- `android/app/build.gradle`: 1.24.2 / code 37.
- `KUSHIRAVI_VERSION.md` and this record: separate release checkpoint/evidence.

APIM `craves-customer-v1` publishes `reverse-geocode-customer-address`, POST
`/addresses/reverse-geocode` under `/api/v1/customer`, pointing at the existing
live User-Chef service. Existing GPS native modules/Metro alias and API client
are reused; no library, backend deployment, resource, auth policy or key changes.
No Customer address is created. Email verification and review gates are unchanged.
The exact house/flat/building must be reviewed by the applicant, not invented.

All 204 Jest suites / 1,132 tests pass (32.514 seconds), with TypeScript and
targeted ESLint passing. The release builds in 2m 54s, all four Android ABIs,
859 tasks (77 executed / 782 up-to-date). Existing APK v2/v3 signer verifies.

1.24.2 source/tag: `983a24898a5f7ff3535ce64b8162e70b2d081f7c`, immutable
`KUSHIRAVI-app-v1.24.2`. APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.2.apk`,
SHA256 `A2C90E321F76BC2A1CAC4EB2FBFDFFAE25472ACF8E6934D1DFAFD05C713BAE30`.
ZIP `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.2-source.zip`, SHA256
`94C26E4C7988851CD7D97DE006BBFFCDC6B6149551BFF648676CD236575C8CA4`;
1,123 entries, required rebuild files, no private `.env`.
Replace-install at 13:06:00 IST succeeds without clearing data, and cold launch
opens Chef registration. Phone reports code 37 / name 1.24.2. Verified email
status survives. After the owner enables phone location, lookup succeeds and
fills the address; the owner submits actual applicant details.

The phone shows Chef application under review. Admin has a new matching PENDING
request `16e204db-6160-484c-a339-5113b9791941`, account ending 4345, submitted
`2026-10-02T07:37:37.228468Z` / 13:07:37 IST. Refresh application returns HTTP
200 from the Admin BFF for this exact ID; saved address and finite/in-range
latitude/longitude are present. No credentials, precise coordinates or identity
document contents are included in this committed record.
Screenshot: `C:\mscratch\artifacts\chef-registration-live-20261002\admin-chef-application-v1.24.2.png`.

The user subsequently reports Document upload failed after selecting an Applicant
photo. The phone confirms the error, and Admin still has zero uploaded proofs.
This separate storage/upload failure is under investigation. Application receipt
is verified; KYC upload, post-upload restoration and final approval are not yet
claimed. No application/document approval or rejection has been performed.

## Backend And Admin Checks

Read-only inspection confirms APIM `craves-chef-application-v1` publishes:

- GET `/api/v1/chef/application`
- POST `/api/v1/chef/application`
- POST `/api/v1/chef/application/proof-files`
- GET `/api/v1/chef/application/readiness`

The POST operation targets the existing live User-Chef Container App,
`ca-craves-user-chef-service-prod`, not an old staging backend.
Admin review/list/document routes are published in
`craves-backoffice-chef-reviews-v1`. The authenticated Admin page
`https://admin.craves.in/admin/chef-reviews` loads four pending applications,
including two submitted earlier on this date. This confirms the existing queue
can display pending applications; it is not proof that this phone's new applicant
has submitted successfully. No Admin decision or database write was performed.

Temporary JDBC diagnostics used the server's existing environment internally,
SELECT-only queries, read-only transactions and rollback. No credential,
full phone number, OTP, applicant address or proof file was copied into this
release. Diagnostic helper files remain ignored local artifacts, not app code
or a deployed endpoint.

## Local Verification

Use the existing Node toolchain in `C:\mscratch\apps\mobile`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand
node node_modules/eslint/bin/eslint.js src/features/auth/api/profileApi.ts src/features/auth/api/profileApi.test.ts src/features/auth/state/accountResolutionService.ts src/features/auth/state/accountResolutionService.test.ts src/features/auth/screens/ChefOnboardingScreens.test.tsx
```

The first focused run passes 39 tests in four suites. The original 203 suites
pass with 1,098 tests after the service/API changes. Ten new onboarding screen
tests also pass separately. One combined run hit a five-second test timeout
while the Android native build was running; the screen tests now use reduced
motion and a bounded fifteen-second timeout. TypeScript and targeted ESLint pass.
The final combined run passes all 204 suites / 1,108 tests (571.346 seconds).
The final onboarding-screen fixture is also rechecked separately: all ten tests
pass. There are 25 initial regression tests plus five recovery tests, 30 total.
The 1.24.1 full run passes 204 suites / 1,113 tests; installed release evidence
is recorded above. Real application submission/Admin receipt remains pending.

## Build And Rollback

```powershell
& 'C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1'
```

This run skips dependency reinstallation because dependency files are unchanged.
It builds all configured Android architectures and uses the existing signer.
Replace-install only; do not uninstall or clear app data.

Current installed outputs:
`C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1.apk` and
`C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1-source.zip`.
The source archive includes the complete tracked mobile tree, lockfile,
`.env.example`, Gradle wrapper and existing build/signing files, not a private
runtime `.env` or any MSG91 credential.

Previous tags, including Version 1 and `KUSHIRAVI-app-v1.23`, remain unchanged.
For source rollback, use `git switch --detach KUSHIRAVI-app-v1.23` in a clean
worktree. Android normally refuses a lower versionCode; do not clear user data
to force an APK downgrade without explicit approval.

## Live Acceptance And Owner Steps

1. Replace-install the candidate and reopen Craves with the existing phone session.
2. Verify the account error is gone and the intended Chef onboarding screen opens.
3. The applicant enters/reviews real name, email and address on the phone.
4. The applicant completes email verification; never send its OTP in chat.
5. Submit once. Confirm the server returns PENDING with an application ID.
6. Refresh/reopen: the same application remains pending, with its saved address.
7. Select actual required proof images on the phone where applicable. Do not
   upload generated identity evidence or bypass the server's review requirements.
8. Refresh the Admin pending list. Match the application's ID and applicant;
   inspect saved fields and document presence without approving/rejecting it.
9. Record the source checkpoint/tag, APK SHA256, installed phone version, exact
   application ID and Admin receipt. Do not mark end-to-end submission complete
   before observing both phone success and that matching Admin request.

Live Chef sign-in and entry to registration are verified on the installed phone.
Applicant submission and matching Admin receipt remain unverified. Real
applicant details and owner-controlled email verification cannot be fabricated
by an automated test.
