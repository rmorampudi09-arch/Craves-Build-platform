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

- Azure/APIM: separately approve public member routes, authentication policies
  and service access. Preserve private/internal finance routes and do not enable
  awards, settlement, withdrawals or spending as a side effect of UI publication.
- Backend: verify enrolment and the approved production policy, plus invite-link
  routing. Extend posting JSON only if actual referral-level labels are required.
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
