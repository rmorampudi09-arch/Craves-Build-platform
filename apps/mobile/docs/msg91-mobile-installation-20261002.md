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

## Confirmed OTP Blocker At Initial Installation

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

## Mobile Integration Enabled, 2026-10-02

The user explicitly requested enabling Mobile Integration, then signed into the
existing MSG91 account. From the existing CravesOTP widget, selected Mobile under
Widget Integration and pressed Save & Next. MSG91 displayed "Widget updated
successfully". Reopened settings from the widget list; the saved Mobile radio
option remained selected after the widget finished loading.

Read-only provider policy comparison through the application's actual live
public widget configuration showed exactly one change among checked fields:

```json
{
  "changed": { "mobileIntegration": { "before": 0, "after": 1 } },
  "provider": "msg91",
  "widgetId": "366942756930393636363638",
  "status": "success",
  "widgetStatus": "1",
  "processType": "2",
  "verificationType": "1",
  "captcha": 0,
  "invisible": 0,
  "otpLength": 6,
  "retryTime": 30,
  "retryCount": 2,
  "expiryTime": 15
}
```

No other setting was edited: SMS/channel templates, DLT, credentials,
subscriptions, wallet and spending limits were left alone. No server authkey
was accessed, secret copied, permission granted, code deployed or API changed.

Visual confirmation:
`C:\mscratch\artifacts\msg91-mobile-20261002\mobile-integration-enabled.jpg`.
The screenshot shows CravesOTP settings, six-digit OTP, unchanged resend/expiry
values and the selected Mobile integration option. It contains no OTP or token.

The installed app fetches provider policy for each new Send OTP request, so no
rebuild/reinstall/version increment was needed. Source, installable tag and APK
remain exactly the v1.19 checkpoint recorded above. This configuration receipt
is committed locally under configuration-only tag
`KUSHIRAVI-msg91-mobile-config-v1`; not a new installable version. A Git tag does
not roll back remote MSG91 settings: reversing this specific setting would
require explicitly selecting web again in the existing widget and saving.

User asked to retry Send OTP and enter the genuine OTP directly on the phone.
At configuration readback, fresh SMS delivery and sign-in were still pending;
readback alone was not a claim of end-to-end sign-in success. The subsequent
user-confirmed result is recorded below. No OTP/password or phone input was read
or entered by the agent. The historical OFF blocker above is resolved, not a
current instruction to enable it again.

## User-Confirmed Phone Sign-In, 2026-10-02

After enabling Mobile Integration, the user reported in this chat:

> yes i got otp and logged in

This confirms real OTP receipt and successful phone sign-in as reported by the
user on the installed v1.19 checkpoint. The agent did not independently inspect
the resulting signed-in screen or trace the backend exchange. No OTP was read,
entered or requested in chat. This acceptance required no app-code change,
rebuild, reinstall or version increment; installed source/tag/APK are unchanged.
This later documentation-only local commit leaves all prior tags untouched.

## Remaining Live Acceptance

Wrong-code correction, resend limits, session lifecycle and authorized Chef
restoration remain unchecked live. Passing mocks and an anonymous malformed-body
400 probe are not substituted for these acceptance checks.

Chef switching/restoration also remains NOT verified on v1.19. An attempted
switch reached its confirmation dialog; the subsequently observed screen was
phone entry, not Chef Dashboard. Input stopped to avoid interrupting the user's
authentication. Do not infer a successful switch, root cause or account state
from diagnostic filenames. Earlier v1.18 Chef checks are historical only.

Remaining manual acceptance, with basic OTP receipt/sign-in already user-confirmed:

1. On the phone request OTP for the user's existing account; user enters codes
   directly on the phone, never in chat.
2. Check wrong-code correction; record an independently observed signed-in screen
   if further live authentication evidence is needed.
3. Check resend cooldown and existing retry limits without unnecessary SMS sends.
4. Confirm Customer Home/Profile and authorized Chef switching/restoration.
5. Check sign-out and reopening, plus leaving send/verification mid-request.
6. iOS needs a separate macOS/CocoaPods build and live check; Android results do
   not prove iOS acceptance.

No artificial account, Chef grant, application submission, payment or financial
credit was created to manufacture a passing result. Prior installable tags and
APKs are untouched.

## Recurrent Send OTP Failure Resolved, Configuration v2

On 2026-10-02 the user reported that mobile sign-in was failing again and
confirmed the failure occurred on Send OTP, before entering a code. The worktree
was clean on `KUSHIRAVI-app-build`, starting at
`ad0ef851e4551dc498583741f69eefc89a75944d`.

The connected phone remained on `com.cravesapp` v1.21, versionCode 32, installed
at `2026-10-02 03:38:39` Asia/Calcutta. Immutable installed source/tag:
`5fac235a421f9541dfac40f3d82beee7fe6fad93` / `KUSHIRAVI-app-v1.21`.
APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`, SHA-256
`0FDD5E1AF580FC645E63D557158960B541B8433A2FFB3B299DE11F4362663918`.

### Cause And Exact Repair

- Non-editable phone UI showed the same `OTP_MOBILE_DISABLED` message:
  "Mobile verification is not enabled yet. Please try again shortly."
- The application's public `/api/auth/otp-config` still pointed to the existing
  MSG91 widget `366942756930393636363638`. Read-only provider process policy
  returned `mobileIntegration: 0`, with all other checked policy fields matching
  the previously verified values. No SMS request was sent by the agent.
- The existing MSG91 settings tab initially showed a stale Mobile selection.
  Reloading it showed the actual saved integration selection was web. Do not
  treat an old browser tab as proof of persisted provider configuration.
- Selected Mobile and pressed Save & Next. MSG91 displayed "Widget updated
  successfully". Returned to Widget Settings to verify the saved selection.
- Independent provider readback at `2026-10-02T00:11:40.3117381Z`
  (05:41:40 Asia/Calcutta) showed:

```json
{
  "provider": "msg91",
  "widgetId": "366942756930393636363638",
  "status": "success",
  "hasError": false,
  "widgetStatus": "1",
  "processType": "2",
  "verificationType": "1",
  "mobileIntegration": 1,
  "captchaValidations": 0,
  "invisible": 0,
  "otpLength": 6,
  "retryTime": 30,
  "retryCount": 2,
  "expiryTime": 15
}
```

Only Widget Integration was edited. SMS templates/DLT, channel configuration,
credentials, CAPTCHA/invisible OTP, authorization, web/backend code, APIM,
payments and delivery configuration were not changed. No provider gate was
bypassed, no Firebase SMS fallback added and no server authkey accessed.

Saved visual evidence:
`C:\mscratch\artifacts\msg91-mobile-20261002\mobile-integration-restored.jpg`.
It shows CravesOTP with Mobile selected and invisible OTP off; no code or token.

### Live Acceptance And Checkpoint

The user retried on the connected phone and confirmed:

> OTP arrived and sign-in works

This is user-confirmed real SMS delivery and successful phone sign-in, not an
agent-created session. No OTP/password or editable phone input was read or
entered by the agent. An additional non-editable UI inspection showed no Send
OTP control or mobile-disabled message, but returned no recognized home/menu
labels; it is not independent proof of a particular signed-in screen.

The app reads provider policy for each new sign-in request, so the repair needed
no APK rebuild, installation or version increment. The installed v1.21 source,
APK and installable tag remain untouched. This documentation-only local repair
checkpoint is tagged `KUSHIRAVI-msg91-mobile-config-v2`; resolve its exact commit
with `git rev-parse KUSHIRAVI-msg91-mobile-config-v2^{commit}`. A Git checkout
does not change remote MSG91 configuration.

### Recurrence Precautions

The observed cause is a saved provider setting changing back to web. There is
no audit evidence identifying who or what changed it, so this receipt does not
attribute the change to a user, deployment, MSG91 reset or automated process.
The dashboard exposes web and Mobile as mutually exclusive selections. Avoid
saving this widget with web selected when editing the shared widget; after any
settings save, reload and confirm Mobile remains selected, then compare the
live provider policy. Do not relax authentication checks to hide a disabled
provider setting. No scheduled monitoring or automatic configuration rewrite
was created without a separate request.

Web OTP delivery was not separately tested in this repair. Basic mobile sign-in
is now user-confirmed; wrong-code correction, resend/lifecycle, authorized Chef
restoration and iOS live acceptance remain distinct checks.

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
