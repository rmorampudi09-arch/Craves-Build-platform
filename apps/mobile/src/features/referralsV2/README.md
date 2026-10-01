# Referral Screens

Four native screens based on `referral screens.docx`, received 2026-10-01.
Only the referral feature and its profile/navigation entry points change.
The reference CRAVES masthead is intentionally omitted. Native system bars and
the existing Chef bottom navigation are preserved, not imitated from an image.

## Screens And Actions

- Customer Profile -> existing referral entry -> `CustomerSettingsReferral`:
  invitation, two steps, inactive customer benefits.
- Share invitation -> `CustomerShareInvitation`: WhatsApp, Messages, Copy link,
  More, three next steps, inactive customer rewards.
- Chef Profile -> **Refer a chef** -> `ChefReferral`: month usage, invitation
  code, sharing, verified policy rates/conditions, **View referral earnings**.
- `ChefReferralEarnings`: summary, postings, settlement information and
  **Back to referrals**. Its heading remains **Chef earnings**, as in image 4;
  this is the referral ledger, not the general Chef earnings screen.

Customer invitations contain the reference message and `https://craves.in`.
They do not carry attribution or enable discounts/cash rewards. Message-copy
copies the reference message; Copy link copies the real public site URL.
WhatsApp/SMS open a composer, never send a message automatically. When an app
is unavailable, an alert offers the native sharing menu. More and Chef sharing
use the operating system's share sheet. Cancelling is not reported as success.
If a Chef code is unavailable, native sharing still works with a clearly
labelled general invitation without referral tracking.

## Backend Check And Missing Capabilities

Read-only checks on 2026-10-01 against subscription
`721906c9-4a72-4606-830b-d3e7ace093ff` confirmed:

- APIM `apim-craves-prodlow-kmqgfy` has no referral API published.
- `ca-craves-referral-prodlow` has private ingress.
- All seven `CRAVES_REFERRALS_*_ENABLED` switches are false, including the main,
  public access, worker, awards, settlement, withdrawal and spending switches.
- Source contracts exist on local `origin/main` in the Spring Boot
  `services/referral-service` module. No backend or Azure resources were changed.

Read-only bearer endpoints implemented in that source:

| Route | Response | Mobile Owner |
| --- | --- | --- |
| `GET /api/v1/referrals/me/code` | `code`, `link`, `qrPath` | `api/referralRewardsApi.ts`, `getCode`, `parseReferralCode` |
| `GET /api/v1/referrals/me/chef-earnings` | INR money strings in paise, month cap/use/remaining, postings, settlement destination | `../chefReferrals/api/chefReferralEarningsApi.ts` |
| `GET /api/v1/referrals/me` | Existing member overview | Retained existing API; not needed for customer invitation-only screens |

No user ID, role, reward calculation or financial amount is supplied by mobile
to these endpoints. The existing authenticated HTTP client owns bearer/session
handling. Queries are keyed by identity and support request cancellation.
Both code and Chef ledger queries remain disabled until approved publication;
unavailable values are shown as dashes, never invented zeros or sample credits.

The rates (2%, 1.2%, 0.8%), INR 250 threshold, 24-hour hold, 9 AM IST posting
and INR 1,500 cap were checked against `ChefReferralPolicy` on `origin/main`.
These are informational policy labels, not a client-side reward engine or a
claim that the programme is currently enabled.

The current Chef posting JSON has only `id`, `amountPaise`, `postingMonth` and
`postedAt`. It does **not** contain a referral level, so the app cannot truthfully
show the mock image's Level 1/2/3 labels per posting. It uses Referral credit or
Referral reversal. A future backend contract extension would be required to
display actual posting levels. `DEMO1234`, sample figures and sample dates are
never included as live data.

There is also an existing posting-month contract mismatch. `MemberQueries`
serializes each recent posting's database `month DATE` using `toString()`
(`YYYY-MM-01`); `parseChefReferralEarnings` currently accepts `YYYY-MM` only.
The top-level month already uses `YYYY-MM`. Before enabling the ledger,
normalize recent-posting months on the backend or separately update and test
the mobile parser against the approved contract. Disabled queries keep this
unpublished mismatch out of the current UI. This update does not claim that
live referral earnings are operational.

## Local Setup And Verification

Use the existing app's documented Firebase/runtime configuration. No new
secret, environment variable or permission is required. `expo-clipboard`
`~56.0.4` matches this project's Expo 56 bundled native-module compatibility
list and is pinned in `package-lock.json`. A fresh native rebuild is needed;
Metro reload alone cannot add its native clipboard module.

```powershell
cd C:\mscratch\apps\mobile
npm ci
npx tsc --noEmit
npm test -- --runInBand
npm run check:p119
.\scripts\build-kushiravi-release-apk.ps1 -PhoneOnly
```

Scoped tests cover all four screen structures, navigation, real copy/share
actions, error/cancel fallbacks, unavailable data, identity cache isolation,
exact API responses, monthly-vs-lifetime values and restoration routes.
`contracts/referral-invitation-source-only.v1.json` maps the new unpublished
code route without changing platform/backend contract manifests.

## Version 1.18 Build Evidence

- Source: `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a` on
  `KUSHIRAVI-app-build`; immutable tag `KUSHIRAVI-app-v1.18`.
- Android: `com.cravesapp`, code 29, name 1.18, ARM64, SDK 24 minimum / 36
  target. Signed release passed in 32m 42s (823 tasks). Existing v2/v3 signing
  certificate retained; package/version and nonempty JS bundle verified.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18.apk`.
  SHA-256: `B5E202ACC268B83E8189293F0C05DA2ED70B3B67DEC948DBD22F4713E7DCE2EC`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18-source.zip`.
  SHA-256: `507D36F07509609EF362F6D93C39FC9AD4B1D046F576285BA1A05FB1B480A111`.
  It contains 954 tracked mobile files from the exact source commit, without
  local .env, node_modules or build outputs. Receipt-only documentation
  commits made afterward do not modify these artifacts or the source tag.
- TypeScript passed. Scoped lint: zero errors, one intentional invalid-link
  fixture warning. Full Jest: 195 suites / 1,019 tests passed (273.386s).
- API coverage audit passed: 121 published and 45 source-only fail-closed
  actions, six manifests, 50 HTTP-bearing files.
- Eight component-layout previews (four screens at 320px and 390px) have no
  horizontal overflow or clipped text. These are component-render previews,
  not proof of native device fidelity or live Chef financial data.
- Phone remains on code 28 / name 1.17.4, tag `KUSHIRAVI-app-v1.17.4`, source
  `12d3fda012069d16ecd1df2642c19c949b25649d`. No new APK was installed, and no
  sign-in, OTP, invitation send or data clearing was performed. Native
  signed-in four-screen checks and iOS checks remain manual.

Logs/results are under `C:\mscratch\artifacts`:
`referral-v1.18-release-build.log`, `referral-v1.18-tests.json`,
`referral-v1.18-tests.log` and `referral-v1.18-preview\layout-report.json`.

## Manual Checks

1. Sign in as a customer. Profile -> referral. Check the first reference's
   layout, no CRAVES masthead, copy, inactive benefits and Back.
2. Open Share invitation. Verify WhatsApp/Messages open a populated composer;
   cancel without sending. Copy link and paste into a test text field. More
   opens native sharing. Test with WhatsApp unavailable as well.
3. Sign in as an approved Chef. Profile contains Refer a chef. Open it, check
   policy copy and View referral earnings. Share chef invite opens native
   sharing, currently with the general invite and no fake referral code.
4. Open referral earnings. Verify unavailable state, correct settlement copy,
   Back to referrals, Android Back and role-preserving app reopen.
5. Verify small screens/enlarged text and Android/iOS safe areas. The bottom
   action must scroll into view above the existing Chef menu.
6. After a separately approved backend publication, use an enrolled test Chef
   to verify the real code, cap usage, credits, reversals and empty ledger.
   Do not enable either mobile availability flag merely to hide an error.

## Manual Steps Required Later

Backend-only follow-up on 2026-10-01: the month contract, current Chef-role
guard, active membership guard and consistent read snapshot are implemented
and locally verified in `C:\mscratch-referral-backend`, branch
`codex/referral-mobile-backend-20261001`. Immutable source/tag:
`36293a10eb0daed77cf9f3d5a2c7069a2931a634` /
`KUSHIRAVI-referral-backend-v1`. Final runtime: 109 tests passed; actual HTTP
responses pass seven schema checks and four current mobile-parser tests.
The default ledger is backward-compatible. `includeLevels=true` is available
only as an opt-in backend contract; the strict current parser intentionally
does not accept it, and no mobile level metadata is fabricated or requested.

These are local fixes, not published live APIs. Network/public-entry approval,
real Auth/current-role verification, source enrolment/current terms and a
source-pinned deployment remain required. Every financial/mobile activation
flag stays off. No Azure write, push, app runtime edit or installation occurred.
See `C:\mscratch-referral-backend\docs\referrals\MOBILE_MEMBER_READ_20261001.md`
for exact source, artifact hashes, local setup and publication acceptance.

- Azure/APIM: separately approve public member routes, authentication policies
  and service access. Preserve private/internal finance routes and do not enable
  awards, settlement, withdrawals or spending as a side effect of UI publication.
- Backend: deploy the locally verified month/read fixes after the above gates;
  verify real enrolment, approved production policy and invite-link routing.
  Request optional level metadata only with a separately tested mobile change.
- Mobile: after those checks, enable `REFERRAL_CODE_AVAILABLE` and/or
  `CHEF_REFERRAL_EARNINGS_AVAILABLE`, retest, create a new version checkpoint.
- Device: iOS sharing/clipboard/composer behavior and native reference fidelity
  still require iOS hardware verification. No new credentials or store actions.

No GitHub push, backend deployment, auth/payment/checkout change or CI/CD change
is part of this update.

## Changed Paths

All paths below are relative to `C:\mscratch\apps\mobile`:

```text
KUSHIRAVI_VERSION.md
android/app/build.gradle
package.json
package-lock.json
contracts/referral-invitation-source-only.v1.json
scripts/p119-apim-contract-coverage-check.mjs
src/app/navigation/ChefRootNavigator.tsx
src/app/navigation/CustomerRootNavigator.tsx
src/app/navigation/types.ts
src/app/navigation/navigationPolicy.ts
src/app/navigation/processRestoration.ts
src/app/navigation/processRestoration.test.ts
src/features/chefProfile/screens/ChefProfileScreen.tsx
src/features/customerSettings/screens/CustomerSettingsLegacyScreens.tsx
src/features/referralsV2/api/referralRewardsApi.ts
src/features/referralsV2/api/referralRewardsApi.test.ts
src/features/referralsV2/components/referralVisuals.ts
src/features/referralsV2/components/ReferralScaffold.tsx
src/features/referralsV2/components/ReferralElements.tsx
src/features/referralsV2/screens/CustomerReferralScreens.tsx
src/features/referralsV2/screens/ReferralScreens.test.tsx
src/features/referralsV2/sharing/referralSharing.ts
src/features/referralsV2/sharing/referralSharing.test.ts
src/features/referralsV2/README.md
src/features/chefReferrals/components/ChefReferralDetails.tsx
src/features/chefReferrals/query/useChefReferralData.ts
src/features/chefReferrals/query/useChefReferralData.test.ts
src/features/chefReferrals/screens/ChefReferralScreen.tsx
src/features/chefReferrals/screens/ChefReferralEarningsScreen.tsx
```
