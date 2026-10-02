# Independent Web And Mobile OTP Deployment Receipt

## Scope And Checkpoints

User requested simultaneous web/mobile MSG91 sign-in without UI/UX changes.
Work started clean on `KUSHIRAVI-app-build` at
`9de3adfb4b4b12d9fc9c011bba0e64be25075054`. No GitHub push, original branch
change, API gateway edit, database migration, account grant or payment change.

- Initial routing source: `ff7e95e5e6c2c82c1a5e8409c53236e3f4e88a3d`, immutable
  tag `KUSHIRAVI-msg91-dual-platform-v1`.
- Final source/rebuild checkpoint: `01728e3d27220691b8f67cc65b8e8791f790ecc5`,
  immutable tag `KUSHIRAVI-msg91-dual-platform-v1.1`. Adds the unchanged landing
  test fixture and clarifies the latest deployment baseline; runtime patch is
  identical to v1.
- Actual deployed web baseline: `889fea7b13d9b05be86ea482c8abbfb387544750`.
  This exact Git commit was fetched read-only, without a branch switch or push.
  A separate web deployment completed during inspection. Immediately before
  this deployment, the ready baseline was `ca-craves-web-prodlow--0000066`, image
  `sha256:1886687428f003b80c31affb1987e3995055e17be9a16d969ae9df98ecad9f9d`.
  Rechecked its source/image/environment to avoid overwriting concurrent work.

## Provider Configuration

The old shared widget was mobile-only after restoring mobile sign-in. The exact
latest web SDK also rejects a mobile-only widget before sending any SMS; simply
switching that widget back to web would break the installed mobile application.

Kept the existing `CravesOTP` widget `366942756930393636363638` unchanged in Mobile
mode. Created `CravesWebOTP`, widget `366a62307562353731383338`, in web mode in the
same existing MSG91 account. The user explicitly requested completion of the
displayed Free OTP Widget plan after being unable to locate its confirmation.
Both the subscription and final wallet debit displayed zero rupees, with the
monthly spending limit left at zero. No paid plan, wallet top-up, spending-limit
increase, Terms checkbox, new provider credential or permission grant.

Web widget uses the same existing India `CravesWidgetOTP` SMS template and OTP
variable mapping, six-digit codes, 30-second resend, two resends and 15-minute
expiry. Resend is SMS only, invisible OTP off, iframe off, Truecaller off.
Its default web H-CAPTCHA protection remains enabled. The existing web form/SDK
already renders and waits for that provider challenge; it was not removed or
solved by the agent. The existing mobile widget's CAPTCHA policy is unchanged.

Reloaded the dashboard to verify both persistence and the new widget's name.
Provider readback using the existing scoped public widget token succeeded for
both widgets. That token is not the account's server authkey. Azure continues
using its existing `msg91-widget-token` secret reference; no token value was
added to source, build arguments, logs or this receipt.

Visual evidence:
`C:\mscratch\artifacts\msg91-dual-platform-20261002\web-widget-enabled.jpg`.

## Exact Runtime Change

Patch/rebuild helpers remain inside the approved mobile worktree:

- `C:\mscratch\apps\mobile\backend-patches\msg91-dual-platform-v1\web\src\app\api\auth\otp-config\route.ts`
- `C:\mscratch\apps\mobile\backend-patches\msg91-dual-platform-v1\web\src\lib\msg91-browser.ts`
- Their existing extended `msg91-auth.vitest.ts` and `msg91-browser.vitest.ts`.
- `Prepare-Web.ps1`, `Verify-Configuration.ps1`, and `README.md` in that folder.

`Prepare-Web.ps1` reconstructs the exact deployed web source in a fresh artifact
directory and applies only these four files. Existing deployment/landing files
needed by tests are read-only baseline fixtures, not changed pipelines or UI.
Compared all 888 baseline web files after Git line-ending normalization: only
the two runtime files and their two tests differ. Zero UI/style/assets changes.

Configuration URL contracts:

1. `/api/auth/otp-config`: unchanged mobile configuration for installed v1.21.
2. `/api/auth/otp-config?platform=mobile`: explicit alias for that widget.
3. `/api/auth/otp-config?platform=web`: dedicated web widget. Both existing web
   authentication entry points use the shared SDK, now requesting this URL.
4. Unknown/empty/case-mismatched platforms return 400. Missing or shared web
   configuration returns 503; no silent fallback to a mobile-only widget.

Responses remain `{provider, widgetId, tokenAuth}`, private/no-store. They do not
contain an account authkey or session/identity. Provider mode/CAPTCHA gates,
request IDs, timeouts, verified identity, token replay protection, Firebase
custom-token compatibility and Craves session exchange remain intact. Existing
account-level backend verification accepts provider-verified phones from the
same MSG91 account; no backend auth deployment or invented identity is needed.

## Build And Deployment

- Node 24.19.0 used for local checks, compatible with the baseline dependencies.
  Local system Node 22.15 was below the test dependencies' declared requirement;
  used the bundled runtime without changing the system installation or lockfile.
- Dependency installation: 708 packages, audit reported zero vulnerabilities.
- TypeScript: passed. Changed-source ESLint: passed, zero warnings/errors.
- Focused OTP tests: 2 files / 20 tests passed.
- Full web tests: 42 Vitest files / 423 tests plus 340 Node contract tests passed.
  The first wider run lacked an isolated read-only landing reference file; after
  restoring that exact baseline fixture, the complete rerun passed. No test was
  skipped, weakened or edited to hide a functional failure.
- Test log: `C:\mscratch\artifacts\msg91-dual-platform-20261002\web-tests.log`.
- Existing ACR build `cu4x`, succeeded after 3m14s. Baseline Dockerfile and
  existing public Firebase/Razorpay/catalog build values retained. Approved logo,
  images and original video were restored and verified by its unchanged build.
- Source image tag: `craves/customer-web-next:kushiravi-msg91-dual-v1-01728e3d`.
- Deployed immutable image:
  `cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:8a5a8d7c5781bdecfbdf8d2a6419a38e4c80c2bb159f653d51ecea96c266c77c`.
- Existing app `ca-craves-web-prodlow`, resource group
  `rg-craves-prodlow-centralindia`, subscription
  `721906c9-4a72-4606-830b-d3e7ace093ff`.
- Healthy, provisioned revision `ca-craves-web-prodlow--msg91-dual-1002`, one
  ready replica, Single revision mode, 100% latest traffic.
- Added only `MSG91_WEB_WIDGET_ID` and `MSG91_WEB_WIDGET_TOKEN` (existing secret
  reference); updated `CRAVES_BUILD_SHA` to the exact patch checkpoint. Existing
  mobile widget/configuration and all other runtime settings remain unchanged.
- Before/after template SHA-256, neutralizing only image, revision suffix and
  those approved environment fields:
  `D8CFBA42E2CD1DFA346DCCC2D45C289F1F0BAF205527890B4BA3639942210075`.
  Fingerprints match. Secret names/references remain unchanged; no new secret.
- Safe receipts: `safe-before.json`, `safe-after.json` in the artifact directory.
- Build log: `acr-cu4x-raw.log`. Azure CLI's Windows log renderer hit a Unicode
  encoding error; this was not a build failure. Retrieved the same successful
  build log read-only from its Azure log artifact, without printing its SAS URL.
- `/api/version` reports `01728e3d27220691b8f67cc65b8e8791f790ecc5`.

Normal existing registry build/container usage may incur charges; no new Azure
resource, scaling increase, GitHub push, DevOps pipeline or remote change.

## Live Configuration Evidence

Public/provider readback at `2026-10-02T00:34:28.4328716Z`
(06:04:28 Asia/Calcutta) passed for all three contracts:

| Client | Widget | Mobile Integration | CAPTCHA | Length | Resend | Count | Expiry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Legacy mobile | 366942756930393636363638 | 1 | 0 | 6 | 30s | 2 | 15min |
| Explicit mobile | 366942756930393636363638 | 1 | 0 | 6 | 30s | 2 | 15min |
| Web | 366a62307562353731383338 | 0 | 1 | 6 | 30s | 2 | 15min |

Both widget IDs and platform modes were checked in the same run, without toggling
anything between requests. Configuration response HTTP 200 has only the three
allowed public fields and `no-store, max-age=0, private`. Unknown platform live
probe returns 400 / `OTP_PLATFORM_INVALID` and no widget credentials.

The live `/landing-auth/manifest.json` points to `auth-CNJ029K8.js`; that exact
script returns 200 and includes the independent web configuration URL plus the
preserved mobile-mode gate and CAPTCHA timeout. This checks the static landing
auth bundle as well as the server route, not only a mocked API response.

## Phone And User-Only Acceptance

Phone remains `RS7PB6VOY9ZLLFYD` / RMX5003, `com.cravesapp`, versionCode 32 /
versionName 1.21, last update `2026-10-02 03:38:39` Asia/Calcutta. Installed tag
`KUSHIRAVI-app-v1.21`, source `5fac235a421f9541dfac40f3d82beee7fe6fad93`.
APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`, SHA-256
`0FDD5E1AF580FC645E63D557158960B541B8433A2FFB3B299DE11F4362663918`.
No Android runtime/UI/version change, rebuild/reinstall or app-data clear.

Mobile OTP receipt/sign-in was user-confirmed immediately before the split.
After deployment the user was asked to perform fresh web and mobile sign-in,
with any genuine OTP/CAPTCHA entered only by the user. A separate web sign-in
tab was opened without altering the three user-owned tabs. No editable input,
SMS OTP, password, request body, provider/session token, cookie or browser
storage is read for verification. Optional tracing records response paths/status
only. Configuration/build success alone is not proof of two fresh live sign-ins.

After being asked to test the deployed split on web and mobile, the user replied:

> it is working

This records the user's acceptance of the requested fix. No OTP was read or
entered by the agent and no artificial session was created. The agent did not
independently trace two completed OTP verification/session exchanges; do not
present that as additional evidence. Wrong-code/resend/lifecycle and authorized
Chef restoration remain separate optional live checks, not implied by this
brief confirmation.

Manual checks:

1. Refresh an old web tab once; sign in through the existing Craves form.
2. Complete any genuine provider CAPTCHA yourself; enter the received OTP only
   into the site, never chat. Confirm the existing account/customer or Chef mode.
3. Sign in on mobile; enter its genuine OTP only on the phone. Confirm both can
   remain signed in without changing either MSG91 widget's integration mode.
4. Optionally check a wrong code, resend cooldown and session restoration; those
   are separate live acceptance checks, not claims based on mocked tests.

## Rebuildable Source And Rollback

Complete overlaid web source and unchanged test fixtures:
`C:\mscratch\artifacts\KUSHIRAVI-msg91-dual-platform-v1.1-source.zip`,
114,676,479 bytes, SHA-256
`CE3AE40200B2E87CD3492D7E2665529386EAE847592F6849395609B5EB12B46D`.
Its `checkpoint.json` records both exact commits, the tag and rebuild steps.
The source is already assembled under `repo/apps/customer-web-next`: install
locked dependencies, run checks and build its included Dockerfile using the
existing public build configuration. No `.env`, server keys, dependencies,
locally generated build output, browser state or real OTP is included. The Git reconstruction
helper is for the original local repository, not necessary for this complete ZIP.
Use the existing v1.21 source ZIP separately to reproduce the unchanged APK.

The v1.1 tag remains immutable. Roll back only the Web image and approved fields
to the exact baseline above and source `889fea7b13d9b05be86ea482c8abbfb387544750`.
This restores the old shared-widget limitation, not simultaneous login. Do not
toggle the existing mobile widget to fix web. Git tags do not roll back remote
MSG91/Azure settings. Keep prior APK tags/checkpoints untouched.

Official limitation:
https://msg91.com/help/sendotp/how-to-integrate-the-new-login-with-otp-widget
