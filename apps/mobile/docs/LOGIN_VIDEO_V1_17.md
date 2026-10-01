# Craves Local Video Login Version 1.17

## Scope

Apply the user's five login references from `Change the style of login page.docx`
using the exact `WhatsApp Video 2026-09-29 at 16.47.23.mp4`, stored inside the app.
The written welcome layout is 75% video and 25% white panel. On smaller screens
or enlarged text, the panel scrolls rather than clipping controls. Phone, OTP
and email forms have a larger white panel and remain keyboard-scrollable.

Only login presentation changes. Home, menus, splash, backend/APIM, pricing,
checkout, Razorpay and Chef authorization are not redesigned or rewired.
No GitHub push. Base branch: `KUSHIRAVI-app-build`.

## Changed Paths

Paths below are relative to `C:\mscratch\apps\mobile`.

- `src/assets/auth/craves-login-background.mp4`: exact supplied 720x1280 H.264
  video, approximately 10 seconds. SHA-256:
  `49BF276910E0E956815E3EF6A4394CDC442DC722EF6DE9025DFD21A95A8942D7`.
- `src/assets/auth/craves-login-poster.jpg`: first frame for immediate display,
  reduced-motion and playback failure fallback.
- `src/features/auth/components/AuthVideoBackground.tsx`: single managed local
  player, muted loop, app-state pause, decoder error fallback, no network source.
- `src/features/auth/components/VideoAuthLayout.tsx`: full-screen video window,
  curved full-width white sheet, approved logo, safe areas and keyboard scrolling.
- `src/features/auth/components/AuthRoleCards.tsx`: Customer/Chef choices with
  selected check; read-only role indication during pending OTP.
- `src/features/auth/components/AuthActionButton.tsx`: red glossy and outline
  login actions with disabled/loading/accessibility states.
- `src/features/auth/components/AuthTextField.tsx`: login-specific labeled
  fields, fixed +91 prefix, password visibility and error states.
- `src/features/auth/components/AuthOtpInput.tsx`: six visible cells using one
  native input for paste, SMS autofill and accessibility.
- `src/features/auth/components/loginStyles.ts`: scoped login visual styles.
- `src/features/auth/components/loginPresentation.ts`: masked destination and
  mm:ss countdown, presentation only.
- `src/features/auth/screens/RoleSelectionScreen.tsx`: welcome and chosen role.
- `src/features/auth/screens/PhoneSignInScreen.tsx`: Customer/Chef phone designs;
  New chef sign up link focuses the existing OTP phone form.
- `src/features/auth/screens/EmailSignInScreen.tsx`: email/password reference.
- `src/features/auth/screens/OtpVerificationScreen.tsx`: OTP reference, edit
  destination, resend and verification with existing request/cooldown policies.
- `src/features/auth/screens/ChefRegistrationScreen.tsx`: only the missing-Chef
  explanatory sentence after authenticated NOT_SUBMITTED account resolution.
- `src/app/navigation/AppNavigator.tsx`: one video behind transparent login
  scenes; existing routes remain unchanged; password recovery visuals unchanged.
- `package.json`, `package-lock.json`: SDK-compatible `expo-video ~56.1.4`.
- `android/app/build.gradle`: versionCode 24 / versionName 1.17.
- `jest.setup.js`: native video boundary mock for deterministic tests.
- `src/features/auth/screens/LoginScreens.test.tsx`,
  `src/features/auth/components/AuthVideoBackground.test.tsx`,
  `src/features/auth/components/loginPresentation.test.ts`: UI and lifecycle
  regression coverage.
- `KUSHIRAVI_VERSION.md`, `docs/LOGIN_VIDEO_V1_17.md`: checkpoint and evidence.

## Existing Flow Boundaries

The PhoneSignIn beginPhone handler, EmailSignIn emailLogin handler and
OtpVerification confirm/resend handlers still use the same auth services and
validation policies. No new account lookup before phone verification. Chef
approval remains server-authoritative. A new/unsubmitted Chef still enters the
existing Chef application flow after OTP, not an invented onboarding screen.

The screenshot mentions phone/password, but Firebase's existing password path
accepts email only. The new labels accurately say email and password. No new
password login method was added. The app currently has no approved Terms or
Privacy destination; those links are omitted pending the user's real URLs.

## Manual Checks

1. On a signed-out test installation, launch the app. Existing splash remains;
   the welcome page shows the approved logo over the local muted looping video.
   Welcome uses the written 75/25 split and has no Already have an account link.
2. Select Customer, continue, enter a valid Indian mobile number. Send OTP should
   send once even on repeated taps, retaining +91 validation and error feedback.
3. Go back, select Chef. New chef sign up focuses phone entry with signup copy;
   it does not bypass verification. Verify a permitted test number to see the
   existing Chef account/application resolution. Do not submit a real application
   merely to test styling.
4. Verify that OTP has six cells, accepts a pasted/autofilled six-digit code,
   shows only the destination's last four digits, and allows Edit to go back.
   Resend countdown and retry/rate-limit recovery must still work.
5. Open email/password. Toggle password visibility, verify invalid-field errors,
   Forgot password and Use phone OTP instead. Use an existing test account for
   successful sign-in; backend requests/roles must be unchanged.
6. Confirm keyboard access on a small display and enlarged text; scroll the
   white panel to reach each control. No control should sit behind the system
   navigation area. Rotate and return to portrait without losing form values.
7. Background/foreground the app: video pauses and resumes without audio.
   Reduced-motion preference shows the local still instead of motion.
8. Inspect login with network disabled: the background must still load from the
   APK. Authentication itself still needs internet; do not mistake that expected
   network requirement for a video download.
9. Sign in as existing Customer/Chef and confirm existing destination selection,
   menus and Home are unchanged. Do not clear phone data to test login.

## Build And Evidence

- Source commit: `1da74b8373df238c46409ae34f83a88bb6238f69`.
- Immutable tag: `KUSHIRAVI-app-v1.17`.
- Android package: `com.cravesapp`, versionCode `24`, versionName `1.17`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.apk`.
- APK SHA-256: `65487BF5880E737B56AB47AADBE5E422CF9CFABEDC704A716B9079792292A128`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17-source.zip`.
- ZIP SHA-256: `63444204C837D4E52DC1F5330363A2E121FAD8B587761327270BA1510859123A`.
- ZIP verification: 926 entries, required wrapper/script/lockfile/local video
  and poster present; no local .env, node_modules or generated build outputs.
- TypeScript: passed, `C:\mscratch\artifacts\v1.17-typescript-complete.log`.
- Scoped ESLint: passed, `C:\mscratch\artifacts\v1.17-lint-final-source.log`.
- Full Jest: 191 suites / 970 tests passed in 655.806 seconds,
  `C:\mscratch\artifacts\v1.17-final-source-tests.log`.
- Native signed release: BUILD SUCCESSFUL in 1h 26m 56s; 835 actionable tasks,
  123 executed, 712 up-to-date. ARM64 and x86_64 are included for phone/emulator.
  Build log: `C:\mscratch\artifacts\v1.17-release-build.log`.
- Signing: v2/v3 verified; existing certificate unchanged. SHA-1
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`;
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- APK media verification: bundled `res/rl.mp4` is 2,388,876 bytes; SHA-256
  matches the supplied MP4 and committed video exactly. Resource names are
  shortened by Android packaging, not a video conversion or remote reference.
- Source-map verification: the built background/layout/role cards and four
  login screens match their final committed source, not a pre-edit bundle.

Evidence-only documentation commits follow the immutable implementation tag.
The source ZIP preserves the tagged implementation and its prepared release
notes; this document and the branch version notes contain the completed build
evidence. No earlier tag or release artifact was replaced.

### Live Verification Limitations

The `Craves_Design_API_36` x86_64 test emulator did not finish startup despite a
restart without loading/saving a snapshot. ADB eventually connected but Android's
package service remained unavailable (`Can't find service: package`), preventing
installation. The task-owned emulator was stopped without clearing its data.
No native screenshots, live playback/framing or keyboard checks are claimed.
Run the manual checks above on a signed-out test device before release approval.
Real SMS/OTP, successful account sign-in and Chef onboarding require an approved
test number/account and remain unverified live; mocked regression tests are not
a substitute for those checks.

At build completion the connected phone `RS7PB6VOY9ZLLFYD` still had v1.16 /
code 23. The later user-requested v1.17 installation is recorded below. No
sign-out, application data reset or intentional backend/auth mutation was used
to inspect the new login screen.

### Phone Installation

Installed on the user's subsequent explicit request, without rebuilding or
changing the immutable APK/tag:

- Device: `RS7PB6VOY9ZLLFYD`, RMX5003.
- Replace-install: `adb -s RS7PB6VOY9ZLLFYD install --no-incremental -r
  C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.apk`, returned `Success`.
- Pre-install: versionCode 23 / versionName 1.16.
- Verified post-install: package `com.cravesapp`, versionCode 24 / versionName
  1.17; phone-reported lastUpdateTime `2026-10-01 05:36:26` (Asia/Calcutta).
- Installed tag: `KUSHIRAVI-app-v1.17`, source commit
  `1da74b8373df238c46409ae34f83a88bb6238f69`.
- APK SHA-256 checked again before installation:
  `65487BF5880E737B56AB47AADBE5E422CF9CFABEDC704A716B9079792292A128`.
- Launch: `com.cravesapp/.MainActivity`, Status `ok`, LaunchState `COLD`,
  TotalTime 614ms, WaitTime 646ms. Process 21937 remained running on the
  subsequent check; its AndroidRuntime/ReactNativeJS error query was empty.
- Existing application data was preserved; no logout or storage clearing.
  No real OTP/sign-in or complete video/keyboard visual check is claimed from
  these launch results. The manual checks above remain the release QA checklist.
- Prior version tags, APKs and source ZIPs remain untouched. No GitHub push.

### Manual Setup

No new Azure, APIM, Firebase, payment, signing-key, DNS or CI setup is required
for the background video. It is local to the APK. Approved Terms of Service and
Privacy Policy URLs are still needed before adding working legal links; none
were fabricated. The user subsequently requested phone installation, which
completed as recorded above. No extra infrastructure setup was needed.

Rebuild from the tagged source ZIP using the existing
`scripts\build-kushiravi-release-apk.ps1`. The video and poster are included in
source control and the ZIP; no external video URL or manual media placement is
needed. Keep existing Firebase/signing configuration; no key rotation. The
verified build used `-SkipNpmCi` after installing the locked dependency and
`JAVA_TOOL_OPTIONS=-Dorg.gradle.project.reactNativeArchitectures=arm64-v8a,x86_64`
for both targets. A source ZIP rebuild should allow the script's normal `npm ci`;
use `-PhoneOnly` for an ARM64-only phone build when no emulator is needed.
