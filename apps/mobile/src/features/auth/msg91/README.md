# MSG91 Mobile Phone Verification

## Current Adapter: Version 1.23

The adapter now uses only Craves `/api/v1/auth/otp/send` and `/otp/verify`.
No MSG91 SDK, authkey, widget ID, widget token or provider network call remains
in the APK. An opaque challenge stays in memory and verification returns the
existing Firebase custom-token compatibility response. Customer/Chef roles,
secure Craves sessions and login screens are unchanged. The backend owns resend,
expiry, attempt limits and one-use verification. A later pending challenge for
the same phone supersedes an earlier one without signing out either platform.

See `C:/mscratch/apps/mobile/backend-patches/msg91-centralized-v1/README.md`
for the current contract, build and testing instructions. The material below is
historical evidence for the pre-1.23 widget migration, not current setup guidance.

This adapter replaces Firebase SMS OTP, not the existing Craves account/session
authority. No login layout, role authorization, payment or backend logic changes.

## Verified Live Contract (2026-10-02)

- `https://craves.in/api/version` reported web source
  `0472d7e58f9c205c60b55ca7d7475a3953f056c1`, Azure DevOps branch
  `codex/customer-chef-web-wiring-20260927`.
- GitHub `origin/main` at `33f796e087f0260d2e72d96a2f9f67fe8c4c51ea` still
  uses Firebase OTP. It is not the live MSG91 implementation.
- GET `https://craves.in/api/auth/otp-config`: `{provider, widgetId, tokenAuth}`.
  The scoped widget token is public client configuration, fetched in memory.
  No MSG91 server authkey, credential, phone, OTP or provider token is committed.
- Official SDK pinned to `@msg91comm/sendotp-react-native@3.1.0`:
  `initializeWidget(widgetId, tokenAuth)`, `getWidgetProcess()`,
  `sendOTP({identifier})`, `retryOTP({reqId})`, `verifyOTP({reqId, otp})`.
  Identifier includes country code without `+`. Retry uses the existing challenge
  and adopts a returned replacement request ID.
- Provider verification yields `access-token` or `message`. The app posts only
  `{accessToken}` to `/api/v1/auth/msg91/verify`, which returns
  `{firebaseCustomToken}`. The verified backend still preserves Firebase UID
  compatibility; the app signs in with this custom token, then posts
  `{firebaseIdToken}` to `/api/v1/auth/firebase/exchange` for Craves tokens.
- Existing `/refresh`, `/me`, `/logout`, secure refresh-token storage, customer
  and Chef role resolution, email/password and password recovery remain intact.
- Live provider selected MSG91; Auth revision was `--0000018`, enabled true.
  The public gateway rejected an empty verification body with HTTP 400
  `AUTH_REQUEST_INVALID`; no SMS or account creation was performed by that probe.
- Widget readback: six digits, retry delay 30 seconds, two retries, expiry
  15 minutes, SMS, invisible OTP and CAPTCHA off. Limits are read from MSG91,
  not copied into mobile policy. Mobile Integration was OFF at preflight.

## Setup And Testing

1. Run `npm ci` from `C:\mscratch\apps\mobile`. The SDK has native Android/iOS
   modules, so a rebuilt binary is required; this is not a web-only update.
2. Existing `CRAVES_API_BASE_URL=https://api.craves.in` and
   `CRAVES_ENVIRONMENT=production` remain sufficient. No new `.env` credential.
3. In MSG91, enable **Mobile Integration** on existing **CravesOTP**, save and
   read back. Do not change invisible OTP, CAPTCHA, template, DLT, subscription,
   wallet or spending cap. Until enabled, native SMS requests fail closed with
   `OTP_MOBILE_DISABLED`; there is no Firebase SMS fallback.
4. `npx tsc --noEmit`; run Jest and ESLint. Build with existing
   `scripts\build-kushiravi-release-apk.ps1`. `-PhoneOnly` builds arm64.
5. Replace-install, do not uninstall or clear app data. Confirm existing signed-in
   account and Customer/Chef restoration before testing a fresh sign-in.
6. With the user's existing account, request OTP, try a wrong code, enter the real
   code on the phone, check resend cooldown and maximum retries, sign out/reopen,
   then verify both authorized workspaces. Never use a bypass or share OTPs.
7. Verify network failures, leaving the form during send/verify, process death,
   and used-token rejection. Late/cancelled responses cannot create a session.
8. On macOS, run the project's CocoaPods setup after `npm ci`, then build/test
   iOS separately. Android verification is not proof of an iOS build.

The vendor exports TypeScript sources containing unrelated default-widget type
errors. `src/types/msg91-sendotp.d.ts` defines only the custom-UI SDK boundary via
the app's TypeScript paths. All provider JSON is `unknown` and runtime-validated;
application strict checking is not disabled and vendor files are not patched.

Official integration reference:
https://msg91.com/help/sendotp/integrate-otp-widget-into-mobile-application
and https://github.com/Walkover-Web-Solution/OTPSDK_ReactNative .

See `KUSHIRAVI_VERSION.md` and the installation receipt for the exact immutable
source/tag/APK and actual live acceptance results. Unit tests do not prove SMS
delivery or a successful real-account OTP sign-in.
