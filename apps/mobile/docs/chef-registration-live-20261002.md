# Chef Registration Routing - 2026-10-02

## Scope And Baseline

Source: `C:\mscratch`, branch `KUSHIRAVI-app-build`, clean starting commit
`859afe8b0b7a6e71433a0e5d9e4458fe8cc1df4a`.
Installed starting release: `KUSHIRAVI-app-v1.23`, Android `1.23` / code `34`.
Initial routing release: Android `1.24` / code `35`, package `com.cravesapp`.
Follow-up recovery candidate: Android `1.24.1` / code `36`.

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
The later 1.24.1 APK/archive will be distinct files and a distinct immutable tag.
The follow-up's full suite passes: 204 suites / 1,113 tests, 76.702 seconds.
TypeScript and targeted ESLint also pass. No new library or native dependency is
added. React review retains existing components, event-handler-driven logout,
per-identity intent storage, submission/loading guards and accessible buttons.

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
pass. There are 25 new regression tests overall. APK/install evidence remains
pending until the release build and phone retest complete.

## Build And Rollback

```powershell
& 'C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1'
```

This run skips dependency reinstallation because dependency files are unchanged.
It builds all configured Android architectures and uses the existing signer.
Replace-install only; do not uninstall or clear app data.

Intended outputs:
`C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.apk` and
`C:\mscratch\artifacts\KUSHIRAVI-app-v1.24-source.zip`.
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

Live registration, applicant submission and matching Admin receipt remain
unverified at the time this initial record was written. Real applicant details
and owner-controlled email verification cannot be fabricated by an automated test.
