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

Source checkpoint, tag, build logs, hashes and actual verification results are
recorded after tests and the signed release build. The user's phone remains
v1.16 / code 23 unless a later install is explicitly performed and recorded.

Rebuild from the tagged source ZIP using the existing
`scripts\build-kushiravi-release-apk.ps1`. The video and poster are included in
source control and the ZIP; no external video URL or manual media placement is
needed. Keep existing Firebase/signing configuration; no key rotation.
