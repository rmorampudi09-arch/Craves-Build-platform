# Craves Login Reference Appearance Version 1.17.1

## Keyboard Follow-up Version 1.17.3

Live v1.17.2 checks confirmed the visual correction and top wordmark on welcome
and both phone role layouts. Chef footer scrolling worked. Its signup link
focused the phone input, but the Android IME covered the field: the login layout
previously used no KeyboardAvoidingView behavior on Android. Enable the standard
`height` behavior there, keep iOS `padding`, and retain normal keyboard-closed
styling. No auth handler, validation, role authorization or OTP request changes.
Regression assertions cover the platform behavior. Code 27 / name 1.17.3.

Version 1.17.2 remains immutable: `33eab68d83085e770dd9a095effd1ba7396ed14e` /
`KUSHIRAVI-app-v1.17.2`, APK SHA-256
`89186C9864B15031CFC501562B1CA56D5C98424EED123DD23AF264D281404ADD`, source ZIP
SHA-256 `D194B3E21859329B846D97AC1AF0D03BEF9C37BD9538DAC29D4C3C866E1C9BEE`.
TypeScript/lint and 20 targeted tests passed (145.86s); release passed in 22m 54s
(823 tasks, 41 executed). Fourteen packaged source entries matched source.
Replace-installed at 07:34:54 Asia/Calcutta, 2026-10-01; cold launch passed
(681ms total, 714ms wait). No phone number entered, OTP sent or user data cleared.

## Native Follow-up Version 1.17.2

The first actual v1.17.1 phone screenshot verified the bold bundled faces,
tall role tiles and local video, but exposed a clipped wordmark. React Native
Image's intrinsic height remained because the prior style set width/aspect
ratio without explicitly overriding height. `VideoAuthLayout.tsx` now supplies
both responsive dimensions (maximum width 310, height width/3) and the unchanged
safe-area top inset. Form-layout regression assertions cover these dimensions.
No other UI, asset or auth behavior changes in this follow-up. Android code 26 /
name 1.17.2; final evidence will be recorded after rebuild and phone verification.

The v1.17.1 verification build remains immutable: source/tag
`ca4d92ed10bf764029e09fc0d6d5748b712b981b` / `KUSHIRAVI-app-v1.17.1`;
APK SHA-256 `409E95F60FCF55D004FE02A886263D124F3B152E9AEAABE2EBE41BBEA659A541`;
source ZIP SHA-256 `D64B9ABBA411E8B0613B329945F81F4C8C1AC4AA3D4CA6172CA1F70FA6AF11E3`.
Full Jest 192/981 passed (457.107s), TypeScript and lint passed, signed ARM64 build
passed in 31m (823 tasks, 110 executed). MP4 and all three fonts match their APK
bytes; fourteen release source-map entries match source. Installed at 07:05:27
Asia/Calcutta on 2026-10-01 without clearing data. Cold launch passed (748ms total /
772ms wait), current-process error buffers empty. The clipped wordmark means this
trial is not the final accepted visual correction.

## Request And Scope

The user reported that installed v1.17 did not look like the Word references
and asked for the exact appearance. The connected phone's signed-out welcome
and Customer phone form were captured before edits. Differences were visible:
square logo, thin OEM typography, compact horizontal role cards, hard shine
stripe, incorrect video crop and different panel proportions.

Only login presentation is corrected. No Home/menu/splash redesign, backend,
APIM, auth-service/validation/OTP request policy, Chef approval, order/cart,
finance, Razorpay, remote or CI changes. No GitHub push.

The five screenshot states are the visual authority for this correction.
Welcome uses a 46.5% video / 53.5% white panel split, instead of v1.17's older
75/25 written interpretation. Clarifying questions about that discrepancy and
the screenshot wordmark were offered; pending a reply, the latest request to
match the screenshot appearance was used as the working interpretation.

The MP4 still replaces the screenshot's food photo, exactly as requested.
Retain the written omissions: no Already have an account footer; Chef footer
is New chef sign up and follows the existing phone OTP path. Successful
authentication and Chef onboarding still use the same services. No fake
country dropdown, phone/password capability or unapproved legal destinations.

## Changed Paths

Relative to `C:\mscratch\apps\mobile`:

- `src/assets/auth/craves-login-wordmark.png`: reference-derived transparent
  glossy red CRAVES wordmark, only for login. Generated cutout 2172x724, alpha
  verified. This is an imagegen extraction, not a claim of bit-identical source
  screenshot pixels. Original approved app/splash logo files are untouched.
- `src/assets/auth/fonts/Inter-Regular.ttf`, `Inter-SemiBold.ttf`,
  `Inter-Bold.ttf`, `LICENSE.txt`: local static faces scoped to login.
  Source: [Inter 4.1 official release](https://github.com/rsms/inter/releases/tag/v4.1).
- `src/features/auth/components/loginVisuals.ts`: login-only colors, explicit
  font families and per-state hero fractions; not global design tokens.
- `src/features/auth/components/AuthSurfaceFinish.tsx`: reusable SVG gradient
  highlights for controls using the existing react-native-svg dependency.
- `AuthRoleCards.tsx`: reference vertical/compact layouts, filled Customer icon,
  glass-like circular icon wells, red selected check and soft tile highlights.
- `AuthActionButton.tsx`: gradual glossy lighting, rounded edges, trailing arrow,
  red/neutral outline variants; existing disabled/loading/action behavior.
- `AuthTextField.tsx`: labeled reference field layout, local regular/semibold
  text, Customer label inside field, no extra email/password leading icons.
- `AuthOtpInput.tsx`: rounded softly lit cells and bold digits; still one native
  input for autofill, paste and accessibility.
- `AuthVideoBackground.tsx`: video/poster viewport matches visible hero; one
  decoder remains managed by the existing lifecycle and fallback implementation.
- `VideoAuthLayout.tsx`, `loginStyles.ts`: reference spacing, rounded full-width
  panel and responsive logo; safe-area/scroll/keyboard access retained.
- `src/features/auth/screens/RoleSelectionScreen.tsx`, `PhoneSignInScreen.tsx`,
  `EmailSignInScreen.tsx`, `OtpVerificationScreen.tsx`: presentation only.
- `src/app/navigation/AppNavigator.tsx`: preload bundled login fonts before
  displaying the auth stack; font errors do not block entry. Shared player
  framing follows the visible auth route; route/auth contracts unchanged.
- `package.json`, `package-lock.json`: make already SDK-bundled `expo-font
  ~56.0.7` an explicit dependency; same version deduplicated from Expo's nested
  dependency. See [Expo SDK 56 font documentation](https://docs.expo.dev/versions/v56.0.0/sdk/font/).
  Add SDK-compatible `expo-asset ~56.0.22`, required by the font loader and
  discovered missing during the first release bundle.
- `metro.config.js`: cap packaging workers at two for workstation memory.
  This build-only limit does not change runtime scrolling or glass settings.
- `android/app/build.gradle`: code 25 / name 1.17.1.
- `jest.config.js`, `jest.setup.js`, `AuthVisuals.test.tsx`, `AuthVideoBackground.test.tsx`,
  `src/features/auth/screens/LoginScreens.test.tsx`: native-boundary mocks and
  focused presentation/lifecycle/auth-contract regression checks.
- `KUSHIRAVI_VERSION.md`, this document: checkpoint and verification evidence.

Component paths without a full prefix above are under
`src/features/auth/components`.

## Asset Preparation

Original supplied MP4 remains byte-for-byte unchanged:
`49BF276910E0E956815E3EF6A4394CDC442DC722EF6DE9025DFD21A95A8942D7`.

Wordmark preparation used the built-in imagegen tool with the Word welcome
screenshot as the edit target, requesting only the existing red uppercase
CRAVES letters, preserved bevels/perspective/highlights, transparent background,
no food/status/interface and a wide crop. Saved to the app asset path above.
This does not imply source-pixel-perfect extraction or an exact Apple font.
The provided video necessarily differs from the screenshot background.

## Verification And Manual Checks

Final source/tag, APK/source ZIP hashes, tests, native build and actual visual
checks are recorded after verification. Installed phone identity stays in
`KUSHIRAVI_VERSION.md`; do not infer installation from a prepared source entry.

1. Open signed-out Craves. Compare the wordmark, bold title, vertically arranged
   role tiles, red selected check, smooth glossy button and white-panel spacing
   with the reference. No unwanted login footer. Video stays local and silent.
2. Select Customer and continue. Customer cards precede the heading. Food remains
   visible behind the logo. Mobile label is inside the fixed +91 field; Send OTP
   remains disabled until validation passes, with no accidental SMS during QA.
3. Change to Chef. Heading precedes the tall cards; neutral secondary action and
   New chef sign up link remain. Link focuses the existing phone field without
   requesting OTP or bypassing account verification.
4. Open email/password. Compact reference choices, bold heading, labeled inputs,
   password eye, underlined recovery and red outline phone action. Use an approved
   test account for real sign-in; do not fabricate phone/password support.
5. With an approved test number, verify six bold OTP cells, masked destination,
   Edit, gray cooldown with emphasized timer and existing resend/retry behavior.
   Do not claim real OTP checks from component tests alone.
6. Check keyboard access, small screen and enlarged text: scroll white panel to
   all controls, keep safe-area padding, and avoid truncation or overlaps.
7. Background/foreground; video pauses/resumes. Reduced motion and decoder failure
   show the still. Switching forms must not create additional video players.
8. Confirm no unrelated UI/business change and previous tags/APKs remain intact.

No new Azure/APIM/Firebase/payment/signing/DNS/CI setup is required. Approved
Terms/Privacy URLs are still needed to add working legal links. Rebuild from
the tagged source ZIP with the existing release script and locked dependencies.
