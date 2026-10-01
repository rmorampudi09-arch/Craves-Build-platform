# KUSHIRAVI App Build - Version 1.18 Referral Reference Screens

This branch contains the local KUSHIRAVI Android app build line. Version 1 remains the known-good rollback point installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Installed Android versionCode: `28`
- Installed Android versionName: `1.17.4`
- Approved rollback origin: `KUSHIRAVI-app-v1.15.1`, source `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
- Installed source: `12d3fda012069d16ecd1df2642c19c949b25649d`, tag `KUSHIRAVI-app-v1.17.4`. Reference-style login, full wordmark and keyboard opening/dismissal verified on the phone.
- Last installation: `2026-10-01 08:44:38`, device `RS7PB6VOY9ZLLFYD` / RMX5003; replace-install succeeded without clearing app data.
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

## Version Checkpoints

### Backend-only follow-up, 2026-10-01 - Referral member read contract

- Requested backend continuation for the four v1.18 referral screens. No
  Android runtime/UI change, APK build, installation or version increment.
- Backend workspace/branch: `C:\mscratch-referral-backend` /
  `codex/referral-mobile-backend-20261001`, based on verified local
  `origin/main` source `13710384b90d09c76ea5bed64fdfe6342975e697`.
- Backend source/tag: `36293a10eb0daed77cf9f3d5a2c7069a2931a634` /
  `KUSHIRAVI-referral-backend-v1`. Runtime candidate
  `e597a46bdbfb5f1033fdfde8d5dc321e8bcec553` is identical in Java/resources,
  tests, dependency manifest and Dockerfile; later changes are docs/review assets.
- Fixes recent posting months to `YYYY-MM`; opt-in `includeLevels=true` reads
  actual original reward levels, including refunds. Default response retains
  the strict current mobile contract. Adds current Chef-role and active-member
  guards, and read-only consistent ledger snapshots; no reward rules changed.
- Final candidate: 109 backend tests passed, zero failures/errors/skips.
  Earlier full module run: 110 passed including unchanged backlog coverage,
  before final refinements; not represented as exact final-source evidence.
  Seven schema checks and four tests parsing actual backend responses through
  current mobile code passed. Full four-service CI was not run or bypassed.
- Backend JAR: `C:\mscratch\artifacts\KUSHIRAVI-referral-backend-v1.jar`;
  SHA-256 `0C6986D03FCA8EE4AAF1C3877634C8B59CB26C8C7E67C5D179202BEB741848A0`.
- Backend source ZIP:
  `C:\mscratch\artifacts\KUSHIRAVI-referral-backend-v1-source.zip`;
  SHA-256 `3A3057663BB6C25D1B78DBADD89C57C3C1F9B2C803B8CD6C9F1DB49449BE4C7E`.
- Local contract gaps are fixed, but live routes remain unavailable. No Azure
  write, APIM import, source enrolment, financial activation or GitHub push.
  Private network/public-entry choice, real Auth/enrolment/current terms and
  source-pinned deployment remain prerequisites. Both mobile availability flags
  remain false; level metadata is not requested by the existing parser.
- Android source/tag remains `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a` /
  `KUSHIRAVI-app-v1.18` (code 29/name 1.18), built but not installed.
  Phone remains `KUSHIRAVI-app-v1.17.4`, source
  `12d3fda012069d16ecd1df2642c19c949b25649d` (code 28/name 1.17.4).
  This documentation-only continuation does not move either app tag/artifact.
- Full evidence, changed paths, setup and manual deployment gates:
  `C:\mscratch-referral-backend\docs\referrals\MOBILE_MEMBER_READ_20261001.md`
  and `services\referral-service\deploy\member-read\README.md`.
  Detailed 82-page handoff:
  `C:\mscratch\artifacts\output\pdf\KUSHIRAVI-referral-backend-v1-handoff.pdf`.

### Version 1.18 Built, Not Installed - Four referral reference screens

- Requested from `C:\Users\saive\Downloads\referral screens.docx` on
  2026-10-01. Customer invitation and share-options screens; Chef referral
  overview and referral earnings screen. No CRAVES masthead on these screens.
- Existing Chef Profile entry is now **Refer a chef**. The overview action is
  **View referral earnings**, leading to the referral-only ledger. Back returns
  to the existing overview without adding duplicate stack history.
- Customer WhatsApp/Messages open a composer; Copy link and message copy use
  the real clipboard; More and Chef sharing use native share options. No
  automatic message send. Unavailable handlers offer native sharing instead.
- Customer invitation-only screens do not enable cash bonuses or discounts.
  Chef sharing works as a clearly labelled general invite until a real referral
  code is available. No mock code, sample earnings or fabricated posting level.
- Read-only inspection of local `origin/main` at
  `13710384b90d09c76ea5bed64fdfe6342975e697` verified the existing member code and
  Chef earnings endpoints and policy. Live Azure inspection confirmed no
  referral APIM API, private service ingress and all seven referral flags OFF.
  No backend/APIM configuration, auth, payments, cart, checkout, orders, Home,
  splash, login, remote or CI/CD changes. No GitHub push.
- New code client: `GET /api/v1/referrals/me/code`; existing ledger:
  `GET /api/v1/referrals/me/chef-earnings`. Both queries remain disabled pending
  separately approved publication. Monthly usage is not lifetime earnings;
  missing financial data is represented by dashes, never invented zero totals.
  A final source check found an existing ledger contract mismatch: recent
  posting months serialize as `YYYY-MM-01`, but the mobile parser requires
  `YYYY-MM`. This must be reconciled and tested before enabling the ledger.
  Posting JSON also lacks the reference's per-credit referral level. Both are
  documented follow-ups, not claims of a currently working live referral ledger.
- Scoped Inter faces reuse the existing licensed font assets without changing
  global typography. `expo-clipboard ~56.0.4` matches Expo 56 compatibility;
  dependency and lockfile updated. No new credentials or permissions.
- Android code `29` / name `1.18`; immutable tag `KUSHIRAVI-app-v1.18`.
  Exact source commit: `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a`.
  Subsequent documentation-only receipts do not change this APK/source tag.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18.apk`; SHA-256
  `B5E202ACC268B83E8189293F0C05DA2ED70B3B67DEC948DBD22F4713E7DCE2EC`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18-source.zip`; SHA-256
  `507D36F07509609EF362F6D93C39FC9AD4B1D046F576285BA1A05FB1B480A111`.
  Archived from the exact source commit, 954 entries. Build script, lockfile,
  native baseline, bundled fonts/video and new referral sources are present.
  No local .env, node_modules or build outputs included.
- Signed ARM64 release passed in 32m 42s: 823 tasks / 65 executed / 758
  up-to-date. APK package/version, v2/v3 signatures and nonempty JS bundle
  checked. Existing signing certificate SHA-256
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  Build log: `C:\mscratch\artifacts\referral-v1.18-release-build.log`.
- TypeScript passed; scoped lint: zero errors, one intentional invalid-link
  test-fixture warning. Full regression: 195 suites / 1,019 tests passed,
  273.386s. Results: `C:\mscratch\artifacts\referral-v1.18-tests.json`.
  API coverage: 121 published + 45 source-only fail-closed actions, six
  manifests, 50 HTTP-bearing files; passed. Four-screen/query checks:
  2 suites / 20 tests passed; sharing checks: 10 tests passed.
- Component-layout previews at 320px and 390px: all four screens captured,
  eight previews without horizontal overflow or clipped text. These are
  rendered component previews, not native Android/iOS fidelity verification.
- Phone remains code `28` / name `1.17.4`, source/tag
  `12d3fda012069d16ecd1df2642c19c949b25649d` / `KUSHIRAVI-app-v1.17.4`.
  No installation, data clearing, sign-in, OTP request or invitation sent
  during this update. Native signed-in four-screen and iOS checks remain
  manual. Previous checkpoints are untouched.
- Full file list, API gaps, local setup and manual checks:
  `src/features/referralsV2/README.md`.

### Version 1.17.4 Built and Installed - Final login reference and keyboard correction

- Native v1.17.3 showed the focused field above the keyboard, but dismissing the
  keyboard left a bottom gap. Android's keyboard-hide frame excludes system bars;
  the framework height avoidance treated that as residual keyboard space.
- Login-only Android padding uses the measured layout and keyboard-show top,
  explicitly resets to zero on hide and removes its listeners on unmount.
  iOS keeps standard padding avoidance. No form/auth/business changes.
- Code `28` / name `1.17.4`; immutable tag `KUSHIRAVI-app-v1.17.4`.
  Source commit `12d3fda012069d16ecd1df2642c19c949b25649d`. Subsequent
  evidence-only commits do not change this APK or source tag.
- Regression covers show, resize, hide with a non-fullscreen frame and cleanup.
- Includes the v1.17.1 reference-style wordmark, bundled bold login faces, tall
  role tiles, glossy actions, field layouts and per-screen local-video framing,
  plus the explicit wordmark dimensions from v1.17.2. Other app UI unchanged.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.4.apk`; SHA-256
  `251F140C27782A3323C30F7520609E6C7BD5E62C59F2B3DB492D302B1DD9C828`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.4-source.zip`; SHA-256
  `230E81E29532F09A4857EF1364A608F60B0B1AAC3F21388AA99D2E63EEE892AC`.
  Archived from the tag, 936 entries; required build script, Gradle wrapper,
  dependency lockfile, local video, wordmark and licensed fonts present. No
  local .env, node_modules or build outputs.
- Final TypeScript and scoped lint passed. Targeted startup/login: 3 suites /
  23 tests passed (267.564s). Final keyboard/visual suite: 13 tests passed
  (16.645s). Full 192 suites / 981 tests passed on the reference-style correction
  before the subsequent image-dimension/keyboard-only follow-ups; not claimed
  as a new full-suite run on this checkpoint. Dependencies unchanged since then.
- Signed ARM64 release passed in 22m 35s: 823 tasks / 41 executed / 782 up-to-date.
  Package/version/architecture checked. Existing v2/v3 signing certificate
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  Exact MP4 and all three font hashes match APK bytes; fourteen packaged source
  entries match committed source.
- Replace-installed at `2026-10-01 08:44:38` Asia/Calcutta; phone reports code 28 /
  name 1.17.4. First cold launch: Status ok / 608ms total / 624ms wait. Hot
  foreground check: Status ok / 132ms total / 147ms wait. Final cold reopen:
  Status ok / 580ms total / 608ms wait; process 5226 running, current-process
  AndroidRuntime/ReactNativeJS error query empty. Data and accounts not cleared.
- Native screenshots inspected: welcome, Customer phone, Chef phone, Chef signup
  field focus, email/password, and both form footers. Full top wordmark and bold
  text visible. Customer/Chef input stays above keyboard; after dismissal the
  white panel fills the screen without the residual bottom gap. Local video
  plays, app returns from background, and phone is left on signed-out welcome.
- No number/password entered, OTP sent, real sign-in or account creation during
  QA. OTP styling/request contracts are covered by tests, not a real SMS claim.
  iOS, enlarged-text/small-device native checks and actual decoder failure remain
  manual checks. No backend/auth/payment/Home/splash/remote/CI change or push.
- Changed paths, interpretation limits and manual checks:
  `docs\LOGIN_REFERENCE_FIDELITY_V1_17_1.md`. This is reference-style native UI,
  not a claim of pixel-identical generated artwork or Apple typography. The
  requested MP4 replaces the reference photo; Android system bars stay native.

### Version 1.17.3 Verification Build - Login keyboard avoidance

- Live v1.17.2 checks confirmed the reference-style welcome, Customer/Chef
  choices and correctly sized top wordmark. The keyboard exposed the existing
  Android form-avoidance gap: the focused phone field was hidden under the IME.
- Use KeyboardAvoidingView's Android `height` behavior in the login layout,
  retaining iOS `padding`. Normal keyboard-closed appearance and auth handlers
  are unchanged. Regression assertions cover the platform behavior.
- Code `27` / name `1.17.3`; source/tag
  `e8392aaa5d3ef15e20da2910cdf6a827b32facd6` / `KUSHIRAVI-app-v1.17.3`.
- APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.3.apk`, SHA-256
  `A05E7979DFE54CB09C09E0A528C4FC8541CC64D601A74C0018192D84EA27F995`.
  Source ZIP `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.3-source.zip`, SHA-256
  `2809A6B85564089FFBC00940CE01BD6C132339DC19466A6DB4B1101FDBADE489`.
- TypeScript/lint and 22 targeted tests passed (289.526s). Signed ARM64 build
  passed in 24m 41s, 823 tasks / 41 executed; existing v2/v3 certificate verified.
  Fourteen packaged source entries match source. Replace-install succeeded at
  `2026-10-01 08:11:53`, code 27 / name 1.17.3, without clearing data.
  Cold launch Status ok / TotalTime 761ms / WaitTime 785ms.
- Welcome and Customer phone inspected. Empty phone input is visible above IME;
  dismissal exposed a residual bottom gap. This is a trial, fixed in v1.17.4.
  No phone number entered, OTP sent or authentication submitted.

### Version 1.17.2 Verification Build - Native wordmark sizing correction

- Follow up on the live v1.17.1 verification: fonts, role tiles and local video
  render, but React Native retained the PNG's intrinsic height, centering the
  wordmark too low and clipping it behind the panel.
- Explicit responsive width and height override both intrinsic image dimensions;
  preserve the reference top inset, all other styling and auth behavior.
- Android code `26` / name `1.17.2`; tag `KUSHIRAVI-app-v1.17.2`.
- Add regression assertions for the image's real width/height in all form layouts.
- Earlier checkpoints remain immutable. Details: `docs\LOGIN_REFERENCE_FIDELITY_V1_17_1.md`.
- Built source/tag: `33eab68d83085e770dd9a095effd1ba7396ed14e` /
  `KUSHIRAVI-app-v1.17.2`. APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.2.apk`,
  SHA-256 `89186C9864B15031CFC501562B1CA56D5C98424EED123DD23AF264D281404ADD`.
- Source ZIP `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.2-source.zip`, SHA-256
  `D194B3E21859329B846D97AC1AF0D03BEF9C37BD9538DAC29D4C3C866E1C9BEE`.
- TypeScript/lint and 20 targeted startup/login tests passed (145.86s). Full
  192/981 passed before this two-dimension correction; dependencies unchanged.
  Signed ARM64 build passed in 22m 54s: 823 tasks / 41 executed. Existing cert
  verified; fourteen source-map entries match source.
- Replace-install succeeded at `2026-10-01 07:34:54`; code 26 / name 1.17.2.
  Cold launch Status ok / TotalTime 681ms / WaitTime 714ms. Welcome and both
  phone role layouts inspected; wordmark fully visible at the top. Chef footer
  reachable by scrolling. Keyboard overlay was found and is fixed in v1.17.3.

### Version 1.17.1 Verification Build - Match the login reference appearance

- Starts from clean branch HEAD `bde6914c4793de82b49246c266f028e7c78ded69` and
  installed v1.17, code 24. Preserve the v1.17 tag and all previous artifacts.
- Android versionCode `25`, versionName `1.17.1`; immutable verification tag
  `KUSHIRAVI-app-v1.17.1`.
- Correct the observed v1.17/reference visual differences: wide glossy red
  CRAVES wordmark, bold reference-style login typography, tall frosted welcome
  and phone role tiles, compact email/OTP choices, smooth rounded glossy red
  actions, neutral fields and correct outline/link colors.
- For this exact-look correction, screenshot proportions are the working visual
  interpretation: welcome video 46.5% / white panel 53.5%, not the older 75/25
  text interpretation. Keep the requested video, omitted login footer and Chef
  signup link. Scope questions about the ratio/wordmark were offered; no reply
  was available when implementing this interpretation of the latest request.
- `craves-login-wordmark.png` is a transparent cutout derived with imagegen from
  the user's Word reference, not a new unrelated brand. Original approved logo
  assets and splash remain untouched. Local Inter 4.1 Regular/SemiBold/Bold
  faces, with their OFL license, are scoped to login to avoid the phone's thin
  system-font rendering; no global typography change.
- Resize the existing shared local video viewport to the visible hero, so the
  form does not crop off most of the food. Exact MP4 bytes, muted looping,
  lifecycle/reduced-motion fallback and single-player structure preserved.
- Existing auth handlers, validation, OTP gates/cooldown, password recovery,
  Chef authorization, backend/APIM, payments and other app UI are unchanged.
  Email/password remains email-only; fixed +91 and no fabricated legal URLs.
- Verification evidence follows below. Details:
  `docs\LOGIN_REFERENCE_FIDELITY_V1_17_1.md`.
- The first release bundle exposed missing `expo-asset`; add the installed
  Expo SDK 56-compatible `~56.0.22` asset support required by the font loader.
  Metro uses two packaging workers to stay within workstation memory; no
  runtime feed/scroll performance settings changed.
- Built source/tag: `ca4d92ed10bf764029e09fc0d6d5748b712b981b` /
  `KUSHIRAVI-app-v1.17.1`. APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.1.apk`,
  SHA-256 `409E95F60FCF55D004FE02A886263D124F3B152E9AEAABE2EBE41BBEA659A541`.
- Source ZIP `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.1-source.zip`, SHA-256
  `D64B9ABBA411E8B0613B329945F81F4C8C1AC4AA3D4CA6172CA1F70FA6AF11E3`.
- TypeScript/lint passed; full final Jest 192 suites / 981 tests passed in
  457.107s. Signed ARM64 release passed in 31m, 823 tasks / 110 executed.
  Existing certificate and package verified; MP4 and all three font hashes
  match the bundled assets. Fourteen packaged source entries match source.
- Replace-install succeeded at `2026-10-01 07:05:27`, code 25 / name 1.17.1.
  Cold launch Status ok / TotalTime 748ms / WaitTime 772ms. No process errors.
  Live screenshot exposed clipped wordmark; this is a trial, not final delivery.

### Version 1.17 Built and Installed - Local video login reference

- Starts from installed v1.16 / `a035229b22d4399e8eb23ee1a46bc6770a9c0092`
  and clean branch HEAD `d3f193204243f733b409bd0aa8a6bf573bc54382`.
- Android versionCode `24`, versionName `1.17`; immutable installable tag
  `KUSHIRAVI-app-v1.17`. Previous checkpoints untouched.
- Source commit: `1da74b8373df238c46409ae34f83a88bb6238f69`.
  Later evidence-only commits do not change this APK or tag.
- Implements the five login states in `Change the style of login page.docx`:
  welcome, Customer phone, Chef phone, OTP and email/password. Written 75% video /
  25% white-panel split takes priority over the welcome screenshot's ratio.
  White curved panels, role cards and glossy Craves-red actions; no login footer.
- Original MP4 copied unchanged to
  `src/assets/auth/craves-login-background.mp4`; bundled local first-frame poster.
  Video SHA-256 `49BF276910E0E956815E3EF6A4394CDC442DC722EF6DE9025DFD21A95A8942D7`.
  No CDN/download request, one shared muted/looping Expo SDK 56 player, foreground
  playback only, still-image fallback for reduced motion or decoder failure.
- Existing approved Craves logo only. No Home/menu/glass/splash redesign.
- Keep Firebase/API auth handlers, India-only +91 validation, request gates,
  cooldowns, autofill, password recovery and backend Chef approval unchanged.
  Chef sign-up uses the existing phone-OTP path; the authenticated missing-Chef
  message uses the existing NOT_SUBMITTED onboarding state. Later onboarding
  screen redesigns are outside this request.
- Email/password remains email-only; no unsupported phone/password promise.
  Terms/Privacy links omitted pending real approved destinations, not fake links.
- No backend, API, finance, cart/order, Razorpay, remote or CI changes; no push.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17.apk`.
- APK SHA-256: `65487BF5880E737B56AB47AADBE5E422CF9CFABEDC704A716B9079792292A128`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.17-source.zip`.
- ZIP SHA-256: `63444204C837D4E52DC1F5330363A2E121FAD8B587761327270BA1510859123A`.
  Archived from the tag; 926 entries including video, poster, dependency lockfile,
  build script and Gradle wrapper. No local .env, node_modules or build outputs.
- TypeScript and scoped ESLint passed; full Jest: 191 suites / 970 tests passed
  in 655.806 seconds. Existing tests remain green.
- Signed ARM64/x86_64 release passed in 1h 26m 56s; 835 tasks, 123 executed.
  Package/code/name and v2/v3 signatures verified with the existing certificate.
  APK video hash matches the supplied file exactly. Seven login source entries
  in the release source map match the committed source.
- Native visual QA remains pending: the API 36 test emulator did not complete
  boot (package service unavailable), so emulator installation could not finish.
  The task's emulator was stopped; no device data was cleared. No real SMS,
  account creation or successful sign-in is claimed tested in this checkpoint.
- Subsequent user-requested phone installation: replace-install returned Success
  on `RS7PB6VOY9ZLLFYD` / RMX5003, preserving application data. Phone reports
  code 24 / name 1.17, last update `2026-10-01 05:36:26` (Asia/Calcutta).
  Installed the immutable APK whose SHA-256 is recorded above; no rebuild.
- Launch: `com.cravesapp/.MainActivity`, Status ok, COLD, TotalTime 614ms,
  WaitTime 646ms. Process 21937 remained running on the post-launch check;
  current-process AndroidRuntime/ReactNativeJS error query returned no errors.
  No sign-out, data reset, real SMS or auth-flow mutation was performed.
  Successful launch is not a claim of full login/video visual verification.
- Change paths and manual checks: `docs\LOGIN_VIDEO_V1_17.md`.

### Version 1.16 Built and Installed - Precise menu and Home scrolling changes

- Starts from the approved v1.15.1 restoration, not withdrawn v1.15.2+ changes.
- Android versionCode `23`, versionName `1.16`; fresh tag `KUSHIRAVI-app-v1.16`.
- Menu-only outline Home, Chef hat, clipboard and Profile icons matching the
  supplied reference. Softer gray inactive icons/labels and Craves red active tab.
  The same foreground styling applies to Chef menus without changing destinations.
- Home category rail uses the existing native gesture-handler ScrollView so
  horizontal swipes remain usable deep in the pinned feed. One rail, unchanged
  native vertical pinning, no duplicate overlay or feed-window tuning.
- Nearby kitchen photos advance automatically only. Preserve card taps, dots,
  background/reduced-motion pauses and the existing two-second timing.
- Existing glass optics, layout, haptics, splash and all business flows untouched.
  No backend/API, auth, finance, cart/order, payment, remote or CI changes; no push.
- Source: `a035229b22d4399e8eb23ee1a46bc6770a9c0092`. Implementation commit
  `efc38f501f27dec04c310e9e91093559082de1bf`; final source adds only isolation
  of the current AppState listener in the new carousel regression test.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.16.apk`.
- APK SHA-256: `B3C953B7C4F8A1AD3DF39E658FD68463399D20D539C9F8111363004D4F45FD3D`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.16-source.zip`, archived
  from the immutable tag; 911 entries, wrapper/build script/lockfile included.
  No local environment files, node_modules or generated build directories.
- ZIP SHA-256: `9EEBBD2D36F252792D7AE87B98D48D5FA5BCD798014B6B54593D12EECCC765BD`.
- Verification: TypeScript and scoped ESLint passed; 188 suites / 950 tests
  passed. Signed ARM64 release passed in 26m 5s; 823 tasks, 41 executed.
  Package, versionCode 23 / versionName 1.16, v2/v3 signatures and existing
  Firebase-registered certificate verified. No signing-key change.
- Replace-install succeeded; phone reports code 23 / name 1.16 at
  `2026-09-30 22:24:55`. Live touch/visual checks currently waiting for the user
  to unlock the phone; not claimed verified from unit-test props alone.
- Changed file paths, manual steps and exact evidence:
  `C:\mscratch\apps\mobile\docs\PRECISE_HOME_MENU_V1_16.md`.

### Version 1.15.1 Restored and Installed - Return to the approved baseline

- User requested the exact v1.15.1 UI and behavior, withdrawing every app change
  after that checkpoint. Restore tracked mobile source from the original tag;
  no later glass renderer or feed-window tuning remains in the active source.
- Approved baseline: `KUSHIRAVI-app-v1.15.1`, original source
  `5dece0e8cae9208aeccdcf12f231e336ad830bec`, original code `18` / name `1.15.1`.
- Phone-safe restoration: versionCode `22`, versionName `1.15.1`. The only
  difference in app implementation from the original is the internal build
  number required by Android to replace-install without clearing app data.
- Restoration source: `cc551b94a96f3f8d033bc685a085cee1e83ff964`.
- Restoration tag: `KUSHIRAVI-app-v1.15.1-restored`; original tag untouched.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored.apk`.
- APK SHA-256: `E94A60B65326DD332901EBDA15A604CBD67098CB982680990C8DE1E37FC081E5`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored-source.zip`.
- ZIP SHA-256: `685C8A04E48DE3EFBF41A78F4380B4730A5418B5D1F1FE7DAC6F3D88EA4042E4`.
- Durable baseline instructions: `C:\mscratch\apps\mobile\AGENTS.md`.
  Later app changes are withdrawn, not guidance for future work. This does not
  claim deletion of historical chat messages or Git rollback checkpoints.
- No backend/API, auth, cart, Razorpay, order, chef flow, splash, remote or CI
  changes beyond restoring the exact approved source. No GitHub push.
- Verification: source comparison confirms only build number and documentation
  differ from the original v1.15.1 tag. TypeScript, scoped ESLint and 186 suites /
  939 tests passed. Signed ARM64 release passed in 10m 36s, 823 tasks (41 executed).
  APK code 22 / name 1.15.1, v2/v3 signatures and registered certificate verified.
- Phone reports code 22 / name 1.15.1 at `2026-09-30 19:49:46`. Cold Customer
  launch passed. Three downward swipes, a pause and a small reverse swipe retained
  the food-list position without a jump to top in that check. Crash/JS error
  buffers empty. Phone left on Customer Home; no real order/payment mutation.
- Checks and exact build/install evidence: `C:\mscratch\apps\mobile\docs\RESTORE_V1_15_1.md`.

### Original Version 1.15.1 - Chef menu lifecycle correction

- Original source commit: `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
- Original tag: `KUSHIRAVI-app-v1.15.1`; earlier tags remain untouched.
- Android versionCode `18`, versionName `1.15.1`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1.apk`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-source.zip`.
- Retains the seven precise changes above the exact v1.13 baseline. Fixes only
  Chef tabBar's callback: return a React component instead of directly invoking a
  hook-bearing component. Regression test invokes that callback outside React.
- v1.15 test APK was installed preserving data, with black customer menu and a
  recorded successful native haptic tick. Live Chef switch then exposed an invalid
  hook-call crash; that trial is not the accepted delivery. No payment submitted.
- Final build/live verification and exact evidence: `docs\PRECISE_JOURNEY_CHANGES_V1_15.md`.

### Version 1.15 Trial - Seven precise menu and journey changes

- Source baseline: exact `KUSHIRAVI-app-v1.13`, `2e91f049976686ea082babe9b66e3923c65ec994`.
- Source commit: `4f5c545c08f7d690d77f4b2a631d25748d8e042c`.
- Tag: `KUSHIRAVI-app-v1.15`. Version 1.14 and the restored 1.13 tag already exist and remain untouched.
- Android versionCode: `17`; versionName: `1.15`. Build 17 can update the phone's build 16 without clearing app data.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.apk`.
- Buildable source: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15-source.zip`.
- Changes: black Customer/Chef menu labels and icons; remove the Android press ripple;
  silent-failure selection haptics; existing v1.13 menu glass on all menu-bearing
  Customer/Chef screens; remember authenticated Customer/Chef workspace by identity;
  one Cart Continue to Payment action for unchanged bills; native sticky category
  scrolling with one rail; remove only the two requested Chefs discovery descriptions.
- Safety: preserve backend role authorization, final catalog/finance validation,
  Razorpay proof verification and interrupted-payment recovery. A changed bill still
  requires review; rapid taps cannot create concurrent checkout attempts. No backend,
  API route, splash, card-glass profile, remote or CI changes. No GitHub push.
- Dependency: Expo SDK 56-compatible `expo-haptics ~56.0.3`; Android native ticks and
  iOS selection feedback, with optional native loading and silent fallback.
- Verification: TypeScript and 186 suites / 938 tests passed; final lint/build/live
  verification recorded in `docs\PRECISE_JOURNEY_CHANGES_V1_15.md`.

### Verified rollback checkpoint - Version 1.13

- Original tag: `KUSHIRAVI-app-v1.13`; source `2e91f049976686ea082babe9b66e3923c65ec994`.
- Original Android version: name `1.13`, code `14`; existing APK and source ZIP preserved.
- Phone-safe restoration: `KUSHIRAVI-app-v1.13-restored`, source
  `28c67965c044a78ac305a66a4349fb12a2cb24e5`, name `1.13`, code `16`.
- The restore changes only internal Android versionCode and documentation; the
  v1.15 update starts from the exact original source, not the reverted v1.14 styling.

### Version 1.13 Prepared - Home glass without drawn capsule outlines

- Status: local UI-only checkpoint; build, tag and installation pending verification.
- Source commit: the commit containing this entry; later evidence records the exact SHA.
- Planned tag: `KUSHIRAVI-app-v1.13`; previous tags remain untouched.
- Android versionCode: `14`; versionName: `1.13`.
- Planned APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.13.apk`.
- Changes: remove the uniform white SVG stroke on every Home food/kitchen capsule;
  use one shared blur intensity 22 (previously capsules 38, menu 66), with soft
  directional edge highlights/shading instead of a drawn outline. Native supported
  iOS uses clear system glass; Android approximates the edge optics, not Apple's
  proprietary shader or undocumented numeric refraction settings.
- Scope: Home root menu and existing Home food/kitchen capsules only. Other tabs,
  screen layouts, branding, splash, backend, finance, cart, auth and payment logic
  are unchanged. White unselected favorite icons and red selected icons retained.
- Verification and exact files: `C:\mscratch\apps\mobile\docs\HOME_LIQUID_GLASS_V1_13.md`.
- Verification: TypeScript, scoped ESLint and 182 suites / 925 tests passed;
  release build and visual phone inspection pending. No new dependencies.
- Phone remains on v1.12 until a new installation is verified. The prior unpaid
  test checkout is not modified by this UI update.

### Version 1.12 - Read-only cart bill and precise capsule adjustments

- Status: existing backend/APIM published and healthy; mobile integration enabled, built, tagged and installed. Actual pre-checkout bill verified on the phone.
- APK source commit: `5f424b7cd22cf5e71684a3a28f5c01187bda1311`. Prepared implementation: `3f8265d2329d38fed6462725986cfa18455159e2`. Subsequent evidence-only commits do not change the APK source/tag.
- Installable tag: `KUSHIRAVI-app-v1.12`. No existing tag is changed.
- Android versionCode: `13`
- Android versionName: `1.12`
- APK path: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.12.apk`
- APK SHA-256: `80FECF73E6E05EA04006AB87528452A1E045524D2BC24BB77B2662190EEFDB91`
- Buildable mobile source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.12-source.zip`; SHA-256 `39BA6980146103F9F4ADB025A7CFDE2F6FF04A18D690338960FE8A90FD16573A`.
- Installed device: `RS7PB6VOY9ZLLFYD` / RMX5003. Replace-install succeeded; Android reports code 13 / name 1.12 and last update `2026-09-30 10:34:03`. Cold launch succeeded without clearing app data.
- Changes:
  - Prepare an authenticated read-only cart bill preview using the existing backend finance policy for platform fee, delivery fee, GST and total.
  - Refresh the bill after confirmed cart/address changes, without creating checkout orders, payments or clearing the cart. Checkout retains its authoritative final bill and existing Razorpay behavior.
  - Change only the Popular Near You unselected favorite outline to white; selected hearts remain red.
  - Reduce image-capsule blur from 48 to 38 and strengthen its rounded reflective rim. Bottom menu blur and all other screen layouts remain unchanged.
- Safety: `CART_BILL_PREVIEW_AVAILABLE` enabled only after healthy service deployment and authenticated APIM publication. Final checkout still uses the existing authoritative finance/Razorpay flow.
- Approved deployment target: subscription `721906c9-4a72-4606-830b-d3e7ace093ff`; directory `1e7e43ac-c7f5-4d47-a74f-289a7cc21508`. Browser sign-in completed with the Azure Portal account; Security Defaults were not changed.
- Production baseline: `92320c9f1d20ffd291b14d5ed6a5c04e7febd445`, from the existing activation pipeline's source branch. Only the eight-file preview overlay from `3f8265d2329d38fed6462725986cfa18455159e2` was applied; current Razorpay fixes retained.
- Backend build runs: Integration `cu4k`, Order `cu4m`, both succeeded. Both service revisions are `--cart-preview-v112` and healthy. Environment and configuration hashes match the pre-deployment snapshot.
- APIM: added only `POST /bill-preview`, operation `cart-bill-preview`, to `craves-cart-v1` in `apim-craves-prodlow-kmqgfy`; existing operations untouched. Private finance route was not published.
- Verification: enabled mobile integration full suite passed (182 suites / 921 tests), TypeScript and scoped ESLint passed. Published-route contract audit passed (121 published / 44 source-only routes). Production-baseline backend suites executed 146 Order and 384 Integration tests with no failures; 104 and 284 database-dependent tests were skipped without an isolated test database. Signed read-only live finance preview returned 200 and reconciled amounts; unsigned private preview returned 403; public no-token/invalid-token checks returned 401/403.
- Buildable backend source: `C:\mscratch\artifacts\cart-preview-production-source-v1.12.zip`. Deployment evidence: `C:\mscratch\artifacts\cart-preview-production-evidence`.
- Android release: successful in 11m 8s, 823 tasks, arm64-v8a. Signing SHA-1 and SHA-256 match the registered Firebase certificate; v2/v3 signature verification passed.
- Phone bill before checkout: one Chicken curry, food 80.00 + platform 0.00 + delivery 40.00 + tax 11.20 = total 131.20 INR; existing Cart shortcut and Proceed to Checkout button visible. White unselected dish heart verified visually.
- Verification caveat: the phone rotated during the next test tap, which opened checkout instead of increasing quantity. No payment was made. The unpaid test checkout/cart item remain pending cleanup approval; live quantity refresh, alternate address, offline and payment completion are not claimed as verified.
- Changed files, contract, security checks, deployment precautions and manual test steps: `C:\mscratch\apps\mobile\docs\CART_BILL_PREVIEW.md`.
- Only existing backend images and the new cart APIM operation were updated. No new Azure resources, security-policy changes, money transfers or GitHub pushes. Phone verification did add a test cart item and inadvertently open one unpaid checkout, as recorded above.

### Version 1.11 - Changes document card surfaces and order visibility

- Requested changes: `C:\Users\saive\Downloads\Changes.docx` (2026-09-30)
- Tag: `KUSHIRAVI-app-v1.11`
- Commit: resolve with `git rev-parse KUSHIRAVI-app-v1.11`; the APK build evidence records the full SHA.
- Android versionCode: `12`
- Android versionName: `1.11`
- APK path: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.11.apk`
- Buildable source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.11-source.zip`
- Change summary:
  - Use a shared liquid-style surface for the existing home dish capsules, nearby kitchen capsules, and bottom menu, with connected Android blur targets and rounded reflective rims.
  - Center the existing bottom menu icons and labels vertically while retaining Home, Chefs, Orders, Profile and the conditional Cart action.
  - Fix kitchen photo paging; derive the dots from the actual photo offset and show a compact moving dot window for larger galleries.
  - Remove the reserved second biography line and reduce the gap before the kitchen starting price.
  - Hide PAYMENT_PENDING orders in All/Upcoming when the last server update is over ten minutes old, with automatic expiry while Orders is open. Use createdAt if updatedAt is invalid; never remove or cancel server orders.
  - Keep every paid, delivered, cancelled, and refund order visible under its existing lifecycle tab.
  - Retain the existing Razorpay integration and all other screen layouts and backend contracts.
- Files changed (relative to `C:\mscratch`):
  - `apps/mobile/src/shared/components/LiquidGlassSurface.tsx`
  - `apps/mobile/src/features/home/components/KitchenImageCarousel.tsx`
  - `apps/mobile/src/features/home/components/KitchenImageCarousel.test.tsx`
  - `apps/mobile/src/features/home/components/HomePromoAndKitchens.tsx`
  - `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
  - `apps/mobile/src/features/favorites/components/CustomerFavoriteHeartButton.tsx`
  - `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
  - `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
  - `apps/mobile/src/features/customerOrders/presentation/customerOrdersPresentation.ts`
  - `apps/mobile/src/features/customerOrders/screens/CustomerOrdersScreen.tsx`
  - `apps/mobile/src/features/customerOrders/query/customerOrdersQueries.ts`
  - `apps/mobile/src/features/customerOrders/customerOrdersPresentation.test.ts`
  - `apps/mobile/jest.setup.js`
  - `apps/mobile/android/app/build.gradle`
  - `apps/mobile/KUSHIRAVI_VERSION.md`
- Verification: TypeScript, scoped ESLint, and 51 tests across nine suites passed. Build evidence and phone observations are recorded beside the versioned APK.
- Manual verification:
  1. Open Home and inspect the availability, food type, favorite, preparation-time, and rating capsules over food photos.
  2. Watch and swipe a kitchen with multiple photos; verify the visible photo and selected dot move together. A single photo has no cycling dots.
  3. Check the reduced biography/price gap and the centered four bottom tabs, including the Cart action when the cart has items.
  4. Open All Orders and Upcoming: pending payments older than ten minutes are absent; recent pending payments remain visible and still offer Continue Payment.
  5. Leave Orders open across a pending order's ten-minute boundary, then background/reopen the app and refresh. Verify paid and completed orders remain visible.

### Version 1.10 - Resume pending Razorpay orders from Order Details

- Tag: `KUSHIRAVI-app-v1.10`
- Commit: resolve from the local `KUSHIRAVI-app-v1.10` tag
- Android versionCode: `11`
- Android versionName: `1.10`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Reuse the existing primary action on payment-pending order details to continue its backend-issued Razorpay payment after leaving Cart or reopening the app.
  - Recheck checkout ownership and any persisted payment state before reopening the provider; retain unresolved attempts for backend verification.
  - Do not alter backend, pricing, orders, auth, or the completed-order UI.

### Version 1.9 - Preserve checkout review through cart clearing

- Tag: `KUSHIRAVI-app-v1.9`
- Commit: resolve from the local `KUSHIRAVI-app-v1.9` tag
- Android versionCode: `10`
- Android versionName: `1.9`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Keep the server-confirmed checkout and final bill on screen when the server clears the cart after order creation.
  - Do not discard a prepared checkout during automatic payment recovery when no provider attempt has started.
  - Keep the existing cart UI and Razorpay-only customer payment integration unchanged.
  - Pin Android Studio's Gradle daemon to Java 21 and stop the signing script on build failure.
  - Allow an ARM64-only phone verification build without changing the default full release build.

### Version 1.8 - Customer flow backend wiring fixes

- Tag: `KUSHIRAVI-app-v1.8`
- Commit: recorded in the final handoff for tag `KUSHIRAVI-app-v1.8`
- Android versionCode: `9`
- Android versionName: `1.8`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Cleared stale locally stored pending-payment attempts after 30 minutes so an old interrupted payment no longer blocks a new checkout forever.
  - Wired dish detail, kitchen profile, and all-dishes add-to-cart flows to the existing conditional switch-kitchen backend route when the cart already contains another kitchen.
  - Kept published APIM route coverage intact and preserved the existing UI layout and navigation.

### Version 1.7 - Checkout bill details and stale payment recovery

- Tag: `KUSHIRAVI-app-v1.7`
- Commit: `036a4677`
- Android versionCode: `8`
- Android versionName: `1.7`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Separated checkout bill preparation from payment order creation so delivery fee, platform fee, taxes, and final total appear before opening payment.
  - Prevented the app from creating a new pending payment order just to show Bill Details.
  - Cleared stale locally persisted pending-payment attempts when they belong to an older cart or delivery address, so users can start a fresh checkout.
  - Preserved existing backend APIs, payment provider logic, cart calculations, and order flows.

### Version 1.5 - Match CRAVES logo size across launch handoff

- Tag: `KUSHIRAVI-app-v1.5`
- Commit: `d54b03f14dccf34ef7bbc40eadd999790eabf0eb`
- Android versionCode: `6`
- Android versionName: `1.5`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Removed the React splash logo's initial scale-down so the CRAVES word stays the same apparent size when Android hands off to React.
  - Reduced the final fade-out scale change so the splash does not visibly shrink before navigation continues.
  - Preserved the existing native splash asset and post-splash navigation behavior.

### Version 1.4 - Keep CRAVES visible during native-to-React handoff

- Tag: `KUSHIRAVI-app-v1.4`
- Commit: `807692c31d79b7edaaf5b77f247b4d16b7590f90`
- Android versionCode: `5`
- Android versionName: `1.4`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Made the React splash render the CRAVES logo from its first frame instead of starting with logo opacity hidden.
  - Removed the delayed logo fade-in that caused a brief red-only gap between the native Android launch splash and the animated React splash.
  - Preserved the existing native splash logo, React splash animation, and post-splash navigation behavior.

### Version 1.3 - Matched native and React splash logo sizing

- Tag: `KUSHIRAVI-app-v1.3`
- Commit: `a09be19549fd23f3ab0c9d2018bb98190f902861`
- Android versionCode: `4`
- Android versionName: `1.3`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Added a padded Craves splash logo asset for Android's native launch screen to prevent the CRAVES letters from being cropped or oversized on first open.
  - Reused the same padded logo visual in the React splash animation so the first native frame and animated splash frame keep the same apparent logo size.
  - Preserved the existing post-splash navigation behavior.

### Version 1.2 - Streamlined Android startup handoff

- Tag: `KUSHIRAVI-app-v1.2`
- Commit: `de7bb67a5d39b808ffd939ce2aca46c168ef06f2`
- Android versionCode: `3`
- Android versionName: `1.2`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Changed the native Android launch splash from the default Android launcher icon to the Craves launcher icon.
  - Aligned the native launch background, status bar, navigation bar, and React splash background to Craves red to remove the visible white transition before the animated splash.
  - Preserved the existing post-splash navigation behavior: unauthenticated users continue to signin/signup and authenticated users continue to home.

### Version 1.1 - Splash screen integration

- Tag: `KUSHIRAVI-app-v1.1`
- Commit: `6778ffb2ccdb877f2a4b3d9d595b9be92b41c54b`
- Android versionCode: `2`
- Android versionName: `1.1`
- APK path: `apps/mobile/android/app/build/outputs/apk/release/app-release-signed.apk`
- Change summary:
  - Wired the approved Craves splash animation from the supplied ZIP into the existing React Native startup flow.
  - Reused only the ZIP splash animation and logo asset; did not import the ZIP sample login/home placeholder screens.
  - Preserved the existing app navigation decision after startup: unauthenticated users continue to the signin/signup flow, authenticated users continue to their home flow.

### Version 1 - Phone-installed baseline

- Tag: `KUSHIRAVI-app-v1`
- Commit: `679dd039f8ab1d6791083d39fdf43ae983ee5f5d`
- Android versionCode: `1`
- Android versionName: `1.0`
- APK source branch: `KUSHIRAVI-app-build`

## Installed APK

The Version 1 APK installed on the phone was built from this branch and signed locally with:

- Keystore: `apps/mobile/android/app/debug.keystore`
- SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

Those fingerprints are registered in Firebase project `cravesapp-dev` for Android app `com.cravesapp`.

## Local Build Rule

Every future app change should be committed on this branch or a branch made from it. For every meaningful change:

1. Update the Android version when producing a new installable build.
2. Commit the change locally.
3. Rebuild the APK with `apps/mobile/scripts/build-kushiravi-release-apk.ps1`.
4. Keep the generated APK path in the handover notes.

Do not modify `origin/mobile-ui-rebuild-from-scratch` directly for KUSHIRAVI app work.
