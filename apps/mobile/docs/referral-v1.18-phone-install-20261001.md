# Craves v1.18 Phone Installation And Native Check Receipt

Recorded 2026-10-01, Asia/Calcutta. Scope: install the already built referral
release and check it on the user's connected phone. No app runtime or layout
changes, rebuild, backend deployment, financial activation or GitHub push.

## Installed Checkpoint

| Item | Verified value |
| --- | --- |
| Repository / branch | `C:\mscratch` / `KUSHIRAVI-app-build` |
| App folder | `C:\mscratch\apps\mobile` |
| Immutable installed tag | `KUSHIRAVI-app-v1.18` |
| Exact app source | `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a` |
| Package | `com.cravesapp` |
| Android version | versionCode `29`, versionName `1.18` |
| Device | `RS7PB6VOY9ZLLFYD`, RMX5003, 1080 x 2400 |
| Install result | Streamed replace-install: Success |
| Phone lastUpdateTime | `2026-10-01 21:44:04` Asia/Calcutta |
| APK | `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18.apk` |
| Source ZIP | `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18-source.zip` |

APK SHA-256:
`B5E202ACC268B83E8189293F0C05DA2ED70B3B67DEC948DBD22F4713E7DCE2EC`.

Source ZIP SHA-256:
`507D36F07509609EF362F6D93C39FC9AD4B1D046F576285BA1A05FB1B480A111`.

Existing signing certificate SHA-256:
`FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
APK signature verification succeeded with v2/v3 signatures. Package metadata
also confirmed minSdk 24, targetSdk 36, ARM64 and `com.cravesapp.MainActivity`.
This uses the existing Android Debug signing identity, not a new store-release key.

Before installation the phone reported versionCode 28 / versionName 1.17.4,
last update `2026-10-01 08:44:38`. Previous source/tag:
`12d3fda012069d16ecd1df2642c19c949b25649d` / `KUSHIRAVI-app-v1.17.4`.
Existing tags and artifacts, including the Version 1 rollback point, were not
overwritten. Documentation commits after v1.18 do not change its installed source.

## Operations And Data Safety

The mobile branch was clean before phone operations. ADB reported the authorized
device as connected. Installation used `install -r` against the exact APK above;
package metadata was read back afterward. No uninstall, app-data clearing,
log-buffer clearing, account creation, OTP request or credential extraction.
The existing signed-in phone account had Customer and Chef workspace access.
It was not assumed to be the same account used in earlier browser/backend tests.

Native interactions were performed through the Android SDK tooling. This receipt
does not claim Android Studio desktop UI control. No payment, order placement,
withdrawal, referral enrolment or consent acceptance was performed.

## Native Results

| Check | Observed result | Evidence filename |
| --- | --- | --- |
| Initial signed-in launch | Customer Home loaded; Home, Chefs, Orders and Profile tabs present | `initial.xml` |
| Customer Profile -> referral | Refer a friend screen loaded with invitation-only copy | `customer-referral.xml`, `customer-referral.png` |
| Share invitation | Four existing share choices loaded | `customer-share.xml`, `customer-share.png` |
| Copy link | Visible Link copied confirmation | `copy-link.xml` |
| More | Android native share chooser opened; cancelled without a recipient | `native-share.xml` |
| Customer -> Chef | Confirmed existing workspace switch; Dashboard loaded, no signup | `chef-switch-confirm.xml`, `chef-home.xml` |
| Chef Profile -> Refer a chef | Refer & earn overview loaded; code disabled and unavailable balances shown honestly | `chef-referral.xml`, `chef-referral.png` |
| View referral earnings | Chef earnings loaded; no invented balances or postings | `chef-earnings.xml`, `chef-earnings.png` |
| Chef cold reopen | Restored Chef workspace and earnings detail, not Customer Home | `chef-reopen-ready.xml` |
| Back to referrals after reopen | Returned to the overview without an earnings-screen loop | `chef-back-to-referrals.xml` |
| Restored overview -> Android Back | Remaining edge case: returned to Dashboard, not Profile Home | `chef-profile-return.xml` |
| Profile tab after that Back | Retained referral overview rather than Profile Home | `return-profile.xml` |
| Recovery from Dashboard | Cold reopen from Dashboard produced a fresh Profile stack | `dashboard-reopen.xml`, `profile-for-switch.xml` |
| Chef -> Customer | Existing Switch to Customer confirmation worked; Customer Home loaded | `customer-switch-confirm2.xml`, `customer-final-before-reopen.xml` |
| Final Customer cold reopen | Remained on Customer Home with its four tabs | `customer-final-reopen-ready.xml` |

Evidence directory:
`C:\mscratch\artifacts\referral-v1.18-phone-install-20261001`.
The four referral screenshots were visually inspected on the native phone.
Visible actions checked were above the bottom menu. This is not an exhaustive
small-device, accessibility, iOS or pixel-identical design certification.

Copy confirmation was checked, not an independent read of clipboard contents.
WhatsApp and Messages composers, and Chef sharing, were not exercised during
this phone pass. No message was sent to another person.

Initial native activity cold launch: Status ok, total 582ms, wait 602ms.
Chef earnings cold reopen: Status ok, total 481ms, wait 510ms.
Dashboard recovery cold reopen: Status ok, total 503ms, wait 523ms.
Final Customer cold reopen: Status ok, total 378ms, wait 386ms.
These measure activity launching, not fully rendered React/auth-ready startup.

Scoped `AndroidRuntime:E`, `ReactNativeJS:E` and `ReactNative:E` queries produced
no errors for the checked app processes (6409, 13644 and final 28075).
Logs were not cleared; these process-specific checks do not prove every possible
crash or background behaviour is absent. Phone left on Customer Home.

## Remaining Restored Back-Stack Issue

Reproduction on the unchanged v1.18 APK:

1. Use existing Chef Mode and open Profile -> Refer a chef -> View referral earnings.
2. Force-stop and reopen the app. Chef earnings restores correctly.
3. Tap Back to referrals. The overview opens correctly.
4. Press Android Back. Dashboard appears instead of Chef Profile Home.
5. Tap the Profile tab. The existing overview stack is retained rather than
   exposing the Profile Home workspace-switch footer.

Observed recovery, without clearing app data: return to Dashboard, close/reopen
from there, then tap Profile. Profile Home and its normal Switch to Customer
action become available again. Both workspace switches worked through their
existing confirmation dialogs. This is a workaround, not a runtime fix.

Read-only source inspection identifies these relevant paths:

- `C:\mscratch\apps\mobile\src\app\navigation\processRestoration.ts`:
  `toRestorationNavigatePayload` forwards the saved nested screen to ChefTabs.
- `C:\mscratch\apps\mobile\src\app\navigation\ChefRootNavigator.tsx`:
  Chef Profile normally starts at `ChefProfileHome`.
- `C:\mscratch\apps\mobile\src\features\chefReferrals\screens\ChefReferralScreen.tsx`:
  Back uses `canGoBack()` / `goBack()`, with a Profile Home fallback only if
  no back history exists.
- `C:\mscratch\apps\mobile\src\app\navigation\processRestoration.test.ts`:
  payload/allowlist tests do not establish the native restored nested Back stack.

Inference, not a completed fix: restoring a detail as the nested initial screen
can omit Profile Home history, and the Back check can see parent tab history.
No source changes were made to these files in this install/check continuation.
A separately requested focused navigation fix needs its own tests, version,
commit, immutable tag, APK and installation evidence. No UI redesign is needed.

## Live Backend Status And Limits

Prior approved deployment, not a new change in this phone turn, published:

- `GET https://api.craves.in/api/v1/referrals/me/code`
- `GET https://api.craves.in/api/v1/referrals/me/chef-earnings`

Backend source/tag:
`4e98febeeab94e87fcb70ef853cb3654d97d2631` /
`KUSHIRAVI-referral-backend-v1.1`.
Deployment receipt:
`C:\mscratch-referral-backend\docs\referrals\LIVE_RELEASE_RECEIPT_20261001.md`.

Earlier authenticated web checks returned a genuine not-enrolled 403 response.
Approved terms URL/version, real member enrolment, source integration and
financial acceptance remain pending. The immutable mobile v1.18 availability
flags for code, Chef referral earnings and rewards remain false, so these phone
screens correctly do not fetch/display live referral codes or financial totals.
No memberships, fake consent, fabricated credits or sample postings were added.
Protected read routes being live does not mean the financial programme is active.

## Verification Provenance And Manual Follow-Up

The previous v1.18 build passed TypeScript and 195 suites / 1,019 tests.
These are retained build-time results, not tests rerun in this install-only pass.
No rebuild was required; both installed APK and source ZIP hashes match the
existing immutable release. This continuation changes only this receipt and
`C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`, committed locally without
retagging the runtime or pushing to GitHub. Backend repository remained unchanged.

Manual repeat steps for this installed version:

1. Open Customer Profile -> Referral to friend -> Share invitation. Check Copy
   link and cancel More's native chooser without sending an invitation.
2. With explicit recipient approval, check WhatsApp/Messages composers; do not
   mistake opening a composer for successful delivery.
3. Switch to existing Chef Mode -> Profile -> Refer a chef -> View referral
   earnings. Expect unavailable values until genuine programme activation.
4. Close/reopen on that detail and repeat the Back-stack case above. A fix has
   not been installed; use the Dashboard restart workaround if necessary.
5. After approved terms and legitimate enrolment, independently verify real
   member 200 responses, cross-account isolation and actual ledger/refund cases
   before enabling availability/financial processing in a distinct release.

This pass checks the referral installation and listed native paths, not all
customer checkout, payment, order, Chef, or million-user capacity scenarios.
