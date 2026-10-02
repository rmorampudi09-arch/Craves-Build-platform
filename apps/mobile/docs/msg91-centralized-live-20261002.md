# Centralized MSG91 Live Rollout And Send Failure

## Current Status

The user authorized centralizing web and Android phone OTP through the existing
Spring Boot auth service. The backend and web transport are deployed, but real
SMS delivery has not passed acceptance. The candidate Android APK is built, not
installed or tagged. Do not describe this rollout as complete.

No UI, account IDs, Customer/Chef roles, email login, checkout, orders, payments,
delivery or banners are modified by this change. No GitHub push or new Azure
resource. The phone remains `com.cravesapp` 1.22 / code 33, installed from
`b9be7ea33ab8a3fcd615beac491a32f708a01bef`, tag `KUSHIRAVI-app-v1.22`.

## Source Checkpoints

- Clean start: `ccffe5c0136e050390e851dad2186d433102f325`, branch
  `KUSHIRAVI-app-build`, workspace `C:\mscratch`.
- Initial backend/web/mobile transport: `ed955bdcb3d0ba42a5c28cc3319892c4a32632c4`.
- APIM Consumption-compatible policies: `f0ceb7f33ae0f89d366bbb03d2c77d245bc8debc`.
- Real-time provider responses, safe diagnostics and redirect rejection:
  `8f956490f5cdf8b8036c29098967f34eb8f1fa91`.
- Candidate Android target: 1.23 / code 34. No `KUSHIRAVI-app-v1.23` tag yet.

## Exact Live Baselines

Auth service original immutable image:
`cravesrm09prodlow6bf632.azurecr.io/craves/auth-service@sha256:01b6783cf1f946b178721aa416feb47f8de98996555879f4ff3d82de2184b88b`.
Original revision `ca-craves-auth-service-prodlow--0000018`.
Original JAR SHA256
`5CA977C512A6C7C638878DFEC07E4413790A7D2B2E13A709B4C4692D365C01D2`.
The overlay preserves every original JAR entry and adds only central OTP classes
and additive database migration V19.

Web original immutable image:
`cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:dcbac3bb820d99620881d135d836b330fab841c79245c7cc25c0f10599584120`.
Original revision `ca-craves-web-prodlow--0000068`.
Exact original web source `e828209dc127085b8c1ffff84387a974b9eeef56`.
The web overlay preserves the existing shared login UI and session handling.

## Deployments

Subscription `721906c9-4a72-4606-830b-d3e7ace093ff`, resource group
`rg-craves-prodlow-centralindia`, existing registry `cravesrm09prodlow6bf632`.

Auth initial ACR build `cu51`, image
`sha256:50cdcab873222215713049ff533885c40b08e4ba3c9a8a0f85772e0c03d470a7`,
revision `ca-craves-auth-service-prodlow--central-otp-1002`. V19 applied
successfully at `2026-10-02T03:25:09Z`. Its replacement is ACR build `cu53`,
image `sha256:48afbfd54cecc65873df4faf7ecbc0f421e316752a2fd58524960f5da0effc66`,
revision `ca-craves-auth-service-prodlow--central-otp-rt-1002`.
Both builds succeeded. Replacement is healthy/provisioned with one replica.
Replacement JAR SHA256
`6A08A0BB7D069721D8059EB93E83D8E378AC122F37CD2B56132152A7EBE4299E`.
Existing environment values and Key Vault references were compared and retained.

Web ACR build `cu52`, image
`sha256:08496b6ec9868162ce289be75198dffc486a4100096689332ac8a2f9576599e0`,
revision `ca-craves-web-prodlow--central-otp-1002`.
Public `/api/version` confirmed source
`ed955bdcb3d0ba42a5c28cc3319892c4a32632c4`.

APIM `apim-craves-prodlow-kmqgfy`, existing API `craves-auth-v1`, added only
`central-otp-send` and `central-otp-verify` POST operations. Exact Craves CORS,
1024-byte request bound and no-store responses; inherited existing policies
preserved. Consumption does not support `rate-limit-by-key`; per-phone and shared
send budgets are enforced in PostgreSQL. No per-IP bot protection is claimed.

## Credential And Template Boundaries

Existing `MSG91_AUTHKEY` references existing secret `msg91-authkey` in
`kvcravesprodlowkmqgfy` through managed identity. No key is fetched to either
frontend, printed, stored in the APK, committed, or put into a source archive.
Backend flag `CRAVES_CENTRAL_OTP_ENABLED=true` and OTP template
`6abe727541deb95f6d0b7192` reused. Existing legacy widget verification is intact.

Portal template `CravesCustomerChefOTP`, sender `CRAVSX`, DLT template
`1777179087070185024`, status Verified by DLT. Its content and mapping were
inspected but not edited. Wallet visible balance was INR 41.50, enough for 166
SendOTP SMS at the displayed INR 0.25 rate. No wallet top-up or plan change.

## Actual Failure Evidence

The user reported no SMS and the generic Send OTP error. A controlled browser
retry received HTTP 200 with an opaque challenge and moved to the unchanged OTP
entry screen; the user confirmed no SMS arrived. HTTP acceptance is not proof
of delivery.

The visible SendOTP log had an earlier failed record at `2026-10-02 05:15:15`
Asia/Calcutta, request `366a62656f6f776e6c777076`, reason Template not matched on
DLT. This predates the new rollout and is not correlated with the user's current
request. It must not be asserted as the confirmed cause of the current failure.

After the real-time-response patch, one controlled resend received HTTP 200.
Auth logs at `2026-10-02T03:46:12.607Z` report provider acceptance, request
`366a6269706c52556457796c`. The OTP delivery report initially returned no matching
record. The SMS API Failed Logs subsequently showed this exact request at
09:16 Asia/Calcutta with error 204, `Authkey has no permission to send an sms.`
The three earlier attempts at 09:09, 09:03 and 09:02 had the same rejection.
This exact correlation confirms missing SMS-send permission as the current
failure, not the older DLT mismatch. No delivery or debit is claimed for these
failed requests.

The account dashboard's one alert reads:
`SMS - 4 Authkey has no permission to send an sms. Error 204`.
The unlocked existing `CravesOTPServer` key uses rule 3752 and retains IP
security. Its original checked permissions were Send OTP Allowed and OTPWidget
View only. Send SMS Allowed was unchecked. The agent requested specific
action-time confirmation and did not toggle or save permissions. The user
enabled Send SMS Allowed and reported saving Update. A fresh navigation to
rule 3752 at approximately `2026-10-02T04:20Z` confirms only those three
permissions checked; all other scopes, including every Select All, remain off.
The key was not revealed, rotated or replaced. No IP whitelist change was made.
Proof: `C:\mscratch\artifacts\msg91-centralized-live-20261002\msg91-send-sms-permission-saved.jpg`.
Real post-change SMS delivery and sign-in are still pending a controlled user
attempt; saved permissions alone are not delivery evidence.

## Verification

- Backend: 13 focused tests pass against isolated local PostgreSQL, not production.
- Mobile: TypeScript and lint pass; all 203 suites / 1083 tests pass.
- Web: TypeScript/lint pass, 423 broad Vitest tests and 340 Node tests pass;
  the final helper regression suite has 10 focused tests. Production build passes.
- Live invalid phone: 400; invalid challenge: 400 OTP_RESTART; oversized request:
  413; rejected foreign origin: 403; existing anonymous `/auth/me`: 401.
- Real valid send: accepted, SMS/sign-in not verified. These probes do not replace
  real user acceptance or prove shared-wallet billing.
- Android release build and signing verification succeed; existing certificate
  retained. Built APK SHA256
  `04E3FC546152AEB8538DEB9A150AA0819CF8BFBE180AD3AA1CDFDC6D7C4E857A`.
  Output `C:\mscratch\apps\mobile\android\app\build\outputs\apk\release\app-release-signed.apk`.
  Not installed, not tagged, not declared launch-ready.

## Required Completion

1. Completed: user-only MSG91 owner verification and inspection of the existing
   server key's rule without revealing its value.
2. Completed: user enabled and saved only Send SMS Allowed; persisted scopes
   verified. No other security permission or IP restriction changed.
3. Correlate one real send with its exact request ID, delivery status and debit.
4. User enters the OTP on the web. Verify the existing identity and Chef access.
5. Only after delivery/sign-in pass, replace-install candidate Android without
   clearing data, and verify a real mobile sign-in through the same backend.
6. Record full final source SHA, immutable version tag, installed version,
   APK/source ZIP hashes and final live image evidence. Refresh provisional source
   ZIPs after final local commits; preserve all previous version tags.

Do not repeatedly resend, remove send budgets, bypass verification or manufacture
account proof. Keep all OTPs and passwords on the user's device/site.
