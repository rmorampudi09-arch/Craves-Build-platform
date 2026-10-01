# Native MSG91 v1.19 Installation Receipt

## Installed Checkpoint

- Repository: `C:\mscratch`, branch `KUSHIRAVI-app-build`.
- Immutable source: `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`.
- Annotated tag: `KUSHIRAVI-app-v1.19`; resolves to that source commit.
- Android package: `com.cravesapp`, versionCode `30`, versionName `1.19`.
- Device: `RS7PB6VOY9ZLLFYD`, RMX5003, arm64-v8a.
- Replace-install: Success, no uninstall or app-data clear.
- Phone package lastUpdateTime: `2026-10-02 00:31:40` Asia/Calcutta.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.19.apk`, 49,007,736 bytes.
- APK SHA-256:
  `C153E6E83274203C94CC38AC4BBA7DFDE8C3B8C4019A4B3B8787D2974583F64B`.
- Exact tagged-source ZIP:
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.19-source.zip`.
- ZIP SHA-256:
  `4A20C200980E9CB9939AADB5CAED1D1BC4B1CBDEC907D1AEC629AC36767F4F9D`.
- APK v2/v3 signature verified. Existing certificate SHA-256 unchanged:
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.

This receipt is a documentation-only continuation after the source/build/tag.
It does not move the installable tag or change the built application. No GitHub
push, original source-branch change, backend deployment or new paid resource.

## Scope And Contracts

Firebase SMS was replaced with the official MSG91 native SDK, pinned at 3.1.0.
Existing layouts, video backgrounds, payment/order flows and server-owned role
authorization remain unchanged. Firebase custom-token compatibility, email
sign-in and recovery remain because they are still used by the verified live
backend and web. This is not a claim that every Firebase dependency is removed.

The actual deployed web source was
`0472d7e58f9c205c60b55ca7d7475a3953f056c1`, not GitHub main. Read-only comparisons
confirmed the exact public configuration, SDK and backend bridge:

1. GET `https://craves.in/api/auth/otp-config`: provider/widget configuration.
2. Official SDK widget initialization and process-policy read.
3. SDK send/retry/verify with an in-memory request ID and provider-defined limits.
4. POST `/api/v1/auth/msg91/verify`, `{accessToken}` -> `{firebaseCustomToken}`.
5. Firebase custom-token sign-in, then POST `/api/v1/auth/firebase/exchange`,
   `{firebaseIdToken}` -> existing Craves access/refresh session.

No server MSG91 authkey is embedded in the application. Scoped public widget
configuration is fetched at runtime; OTPs, phone/provider tokens and credentials
are not written to logs or committed. Lifecycle cancellation, duplicate guards,
timeouts, replay protection and partial-session cleanup are covered by tests.

Key runtime paths:

- `C:\mscratch\apps\mobile\src\features\auth\msg91\msg91Auth.ts`
- `C:\mscratch\apps\mobile\src\features\auth\api\authApi.ts`
- `C:\mscratch\apps\mobile\src\features\auth\state\authService.ts`
- `C:\mscratch\apps\mobile\src\features\auth\firebase\firebaseAuth.ts`
- `C:\mscratch\apps\mobile\src\features\auth\screens\PhoneSignInScreen.tsx`
- `C:\mscratch\apps\mobile\src\features\auth\screens\OtpVerificationScreen.tsx`
- `C:\mscratch\apps\mobile\src\types\msg91-sendotp.d.ts`

Full setup/contract notes:
`C:\mscratch\apps\mobile\src\features\auth\msg91\README.md`.

## Automated And Native Evidence

- TypeScript passed.
- Changed-source ESLint passed, zero errors/warnings.
- Final Jest run: 197 suites / 1,054 tests passed.
- Focused auth checks: 25 suites / 162 tests passed.
- Release build: successful in 6m 7s, 864 tasks, 94 executed / 770 up-to-date.
- Existing build script used with `-SkipNpmCi -PhoneOnly`; targetSdk 36,
  minSdk 24, arm64-v8a. Official native MSG91 module autolinked.
- Vendor module required SDK 34, installed by Gradle using previously accepted
  local licenses. No vendor source patch or application SDK downgrade.
- Build log:
  `C:\mscratch\artifacts\msg91-mobile-20261002\build-v1.19.log`.
- Customer Home and Profile loaded following replace-install.
- Native cold activity launch: Status ok, total 603ms / wait 639ms. These are
  activity timings, not full React/auth-ready startup measurements.
- Checked process logs: zero matching fatal exceptions, JS TypeError,
  ReferenceError, InvariantViolation or missing BiometricAuth module errors.
  This is scoped evidence, not proof of every feature or future crash absence.

## Confirmed OTP Blocker

The user reported an error while attempting OTP. The actual phone was on the
phone-number/Send OTP form and showed:

> Mobile verification is not enabled yet. Please try again shortly.

This is `OTP_MOBILE_DISABLED`, raised before calling the SMS send method.
Read-only MSG91 configuration recheck confirmed:

```json
{
  "provider": "msg91",
  "mobileIntegration": 0,
  "captcha": 0,
  "invisible": 0,
  "otpLength": 6,
  "retryTime": 30,
  "retryCount": 2,
  "expiryTime": 15
}
```

Official native integration requires Mobile Integration enabled on the existing
CravesOTP widget. The MSG91 browser tab was signed out when checked. User action
requested: sign into the existing MSG91 account, enable only Mobile Integration,
save and confirm. Do not change CAPTCHA/invisible OTP, SMS templates, DLT,
subscriptions, wallet or spending limits. Do not bypass this provider gate or
fall back to Firebase SMS. Runtime policy is fetched for each new OTP request,
so enabling the setting does not require another APK.

Official reference:
https://msg91.com/help/sendotp/integrate-otp-widget-into-mobile-application

The error inspection excluded editable input text and did not save raw OTP UI
XML locally. No OTP/password was read, entered or requested in chat.

## Remaining Live Acceptance

Fresh SMS delivery, provider OTP verification and subsequent real-account
identity/session exchange remain NOT verified. Neither test mocks nor an
anonymous malformed-body 400 response constitute successful authentication.

Chef switching/restoration also remains NOT verified on v1.19. An attempted
switch reached its confirmation dialog; the subsequently observed screen was
phone entry, not Chef Dashboard. Input stopped to avoid interrupting the user's
authentication. Do not infer a successful switch, root cause or account state
from diagnostic filenames. Earlier v1.18 Chef checks are historical only.

Manual acceptance after enabling the existing setting:

1. On the phone request OTP for the user's existing account; user enters codes
   directly on the phone, never in chat.
2. Confirm genuine SMS delivery, wrong-code correction and successful sign-in.
3. Check resend cooldown and existing retry limits without unnecessary SMS sends.
4. Confirm Customer Home/Profile and authorized Chef switching/restoration.
5. Check sign-out and reopening, plus leaving send/verification mid-request.
6. iOS needs a separate macOS/CocoaPods build and live check; Android results do
   not prove iOS acceptance.

No artificial account, Chef grant, application submission, payment or financial
credit was created to manufacture a passing result. Prior installable tags and
APKs are untouched.

## Rebuild

Use the immutable source ZIP or tag with the existing README/build script and
production API configuration. The archive intentionally excludes local `.env`,
dependency directories and generated build output. Install dependencies from
the lockfile, then run:

```powershell
C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1 -PhoneOnly
```

Do not overwrite the archived checkpoint APK/tag. The ZIP contains the exact
source commit, not this later documentation receipt. For rollback choose an
existing approved tag in a detached checkout and follow Android's versionCode
constraints without deleting user data.
