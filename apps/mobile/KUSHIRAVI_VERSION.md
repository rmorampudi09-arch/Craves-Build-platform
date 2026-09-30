# KUSHIRAVI App Build - Version 1.15.4 Installed

This branch contains the local KUSHIRAVI Android app build line. Version 1 remains the known-good rollback point installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Installed Android versionCode: `21`
- Installed Android versionName: `1.15.4`
- Installed APK source commit: `f808496eec0a8b983bacb1a391123b3d437c5724`, tag `KUSHIRAVI-app-v1.15.4`. Later evidence-only commits do not change that APK/tag.
- Last installation: `2026-09-30 18:55:35`, device `RS7PB6VOY9ZLLFYD` / RMX5003; replace-install succeeded without clearing app data.
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

## Version Checkpoints

### Version 1.15.4 Installed - Bounded live glass and Home scrolling performance

- Baseline: installed `KUSHIRAVI-app-v1.15.3`, source
  `a77b95c8ebc2b5089d72a93413e1e306ca7925e0`, plus its evidence-only commit.
- Android versionCode `21`, versionName `1.15.4`.
- Source commit: `f808496eec0a8b983bacb1a391123b3d437c5724`.
- Tag: `KUSHIRAVI-app-v1.15.4`; previous tags remain untouched.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.4.apk`.
- APK SHA-256: `A11A4D22B98BF6BA73AB112176418CCB0E8E731113CB8B6F548F97CEAA01BDA7`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.4-source.zip`.
- Source ZIP SHA-256: `E378E1E7EC3166AB20522C7E77B83B49A372E5ED1C24223942E3D2104D4B6CB9`.
- Remove the additional near-sharp Expo BlurView from every live rim. Capture the
  existing backdrop directly into a capsule-sized native RenderNode instead of
  another full-photo/full-scene blur buffer. Cache native drawing until its source,
  relative position or geometry changes; keep actual background refraction.
- Bound the Home feed's render window and initial/batch card count. Preserve
  existing sticky rail, offsets, pagination, shapes, blur 22 / reduction 2.5,
  glass rim width/bend, foregrounds, haptics and all functional flows.
- Baseline six-swipe phone profile: 111 frames, 110 janky (99.10%), median frame
  latency 89 ms, p90 101 ms; scratch render targets 421.58 MB, 2443 attached views.
- TypeScript, scoped ESLint and 187 suites / 954 tests passed. Signed ARM64
  release succeeded in 5m 17s, 823 tasks (40 executed). APK code 21 / name 1.15.4,
  v2/v3 signatures and unchanged registered signing certificate verified.
- Replace-install succeeded at `2026-09-30 18:55:35`. Same six-swipe test: 302
  frames, 7 janky (2.32%), median latency 25 ms / p90 34 ms; repeat 296 frames,
  6 janky (2.03%), median 25 ms / p90 32 ms. Scratch targets 94.29 MB, views 841.
  Android's separate legacy counter and raw evidence are included in the report;
  these measurements do not claim a constant display FPS or zero stutter.
- Fast eight-fling stress test: 212 frames, 13 janky (6.13%). Loaded food rows
  and pinned/unpinned rail checked; live menu/photo rims still change with the
  backdrop. Customer tab navigation and native haptic ticks verified. Chef
  Dashboard/Profile scrolling and Chef/Customer force-stop/reopen checked.
  No shader fallback/errors or post-install app crashes; returned to Customer Home.
- A separate blank second promo slide was observed. Carousel code and packaged
  image are unchanged; its cause is not verified or claimed fixed by this patch.
- No new dependencies, backend/API, auth, cart, payment, order, chef business
  logic, splash, remote or CI changes. No GitHub push.
- Details and manual checks: `C:\mscratch\apps\mobile\docs\SCROLL_PERFORMANCE_V1_15_4.md`.

### Version 1.15.3 Installed - Live scrolling backdrop at glass rims

- Source baseline: installed `KUSHIRAVI-app-v1.15.2`, source
  `9bcd1eda070ad6b99a832caec4f0475720c4ba99`, plus its evidence-only commit.
- Source commit: `a77b95c8ebc2b5089d72a93413e1e306ca7925e0`.
- Tag: `KUSHIRAVI-app-v1.15.3`; previous tags remain untouched.
- Android versionCode `20`, versionName `1.15.3`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.3.apk`.
- APK SHA-256: `F603B3DF07BE11F865F897CE1FD687E476E1D9D2B288E357EEE93E1E13049B27`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.3-source.zip`.
- Source ZIP SHA-256: `50C415468515D1E14C570AAB8C4E023FE42214048FDC885E601EC7689047434B`.
- Precise correction: the existing glass edge now samples actual live background
  pixels and bends them along the rounded rim on supported Android API 33+.
  A separate near-sharp Expo Blur capture uses the same existing blurTarget;
  Android's native RuntimeShader masks the center and displaces only rim samples.
- Approved center blur 22 / reduction 2.5, center lighting/tint, shapes, layouts,
  black menu text/icons, haptics and foreground interactions remain unchanged.
- Unsupported Android, unavailable native manager or shader failure safely retain
  the existing glass. Supported iOS keeps its native clear system GlassView.
- No new dependencies or backend/API, auth, cart, payment, order, splash, remote
  or CI changes. No GitHub push.
- Verification and file list: `C:\mscratch\apps\mobile\docs\LIVE_GLASS_REFLECTION_V1_15_3.md`.
- Verification: TypeScript and scoped ESLint passed; 187 suites / 952 tests
  passed. Signed ARM64 release succeeded in 13m 54s, 823 tasks (34 executed).
  APK code 20 / name 1.15.3, v2/v3 signatures and unchanged registered certificate verified.
- Replace-install succeeded at `2026-09-30 18:09:31`. Live native rim active on
  photo capsules and Customer/Chef menus without fallback or shader errors.
  Scrolling photo details/colors changed along the fixed menu rim, confirmed
  by screenshots and pixel comparison. Center blur/foregrounds unchanged;
  tab navigation and native selection tick verified. Both sides survived
  force-stop/reopen. Post-install crash log clear; phone returned to Customer Home.
- No live order/payment/cart/menu mutation performed. iOS and older Android
  hardware unverified; their capability/fallback cases covered by component tests.

### Version 1.15.2 Installed - Precise glass edge optics

- Source baseline: installed `KUSHIRAVI-app-v1.15.1`, commit `5dece0e8cae9208aeccdcf12f231e336ad830bec`, plus its evidence-only commit.
- Source commit: `9bcd1eda070ad6b99a832caec4f0475720c4ba99`.
- Tag: `KUSHIRAVI-app-v1.15.2`; previous version tags remain untouched.
- Android versionCode `19`, versionName `1.15.2`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2.apk`.
- APK SHA-256: `532AD12A55ED7B8637204D099327003FACAAABCA5524A5DEFB69C85DFD1FA83A`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.2-source.zip`.
- Source ZIP SHA-256: `7A3370B12221282F8F4CE22E00B66F8A2D1F37BD8D710DA2B270E250CF2FF575`.
- Only edge optics change: stronger directional rounded highlights, slightly deeper
  edge band and a paired inner light/shadow band on the shared existing glass
  capsules and Customer/Chef menus. No uniform white stroke is added.
- Approved blur remains 22, reduction factor 2.5; center tint/wash, top/bottom
  lighting, sizes, layouts, black menu foregrounds and interactions remain unchanged.
- Android uses bounded edge-lighting bands to approximate lens depth, not actual
  refractive background displacement or Apple's proprietary rendering. Supported
  iOS retains its existing native clear GlassView without the Android overlay.
- Verification: TypeScript, scoped ESLint and 186 suites / 942 tests passed.
  Signed ARM64 release succeeded in 9m 36s, 823 tasks (41 executed). APK identity
  code 19 / name 1.15.2 and v2/v3 signatures verified; registered certificate unchanged.
- Replace-install succeeded; Android reports code 19 / name 1.15.2 and update time
  `2026-09-30 17:18:32`. Live food/kitchen capsule and Customer/Chef menu comparisons,
  tab navigation, native selection ticks and Chef force-stop/reopen passed. No app
  crashes appeared in the post-install crash buffer. No live business-data mutation
  or payment was performed; phone returned to its original Chef side. iOS unverified.
- No new dependencies, backend/API, auth/role, cart, payment, order, splash, remote
  or CI changes. No GitHub push.
- Changed files, checks and build evidence: `C:\mscratch\apps\mobile\docs\GLASS_EDGE_OPTICS_V1_15_2.md`.

### Version 1.15.1 Installed - Seven precise changes and Chef menu lifecycle correction

- Source commit: `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
- Tag: `KUSHIRAVI-app-v1.15.1`; earlier tags remain untouched, including original v1 and v1.13.
- Android versionCode `18`, versionName `1.15.1`.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1.apk`.
- APK SHA-256: `F881C6A510ACD08BC4669EB586360D69B14B68315EDB0C5360195BCF8DF9BA1D`.
- Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-source.zip`.
- Source ZIP SHA-256: `2F38E94A763483FC98EFC919DAAA48051EB97215B795E46F2B86C90003C56A24`; archived from the exact tagged source, without dependencies or private runtime logs.
- Retains the seven precise changes above the exact v1.13 baseline. Fixes only
  Chef tabBar's callback: return a React component instead of directly invoking a
  hook-bearing component. Regression test invokes that callback outside React.
- v1.15 test APK was installed preserving data, with black customer menu and a
  recorded successful native haptic tick. Live Chef switch then exposed an invalid
  hook-call crash; that trial is not the accepted delivery. No payment submitted.
- Verification: TypeScript, scoped ESLint and all 186 suites / 939 tests passed.
  Signed ARM64 Android release succeeded in 4m 21s, 823 tasks (41 executed).
  APK v2/v3 signatures and the registered Firebase signing certificate verified.
- Phone: package `com.cravesapp` reports code 18 / name 1.15.1 and update time
  `2026-09-30 14:45:23`. Both Chef and Customer survived force-stop/reopen on the
  selected side. All five Chef tabs were checked; Customer menu and removed Chefs
  descriptions checked. Native selection ticks were recorded. Slow/fast Home
  scrolling and reversed scrolling showed one continuously pinned/unpinned rail.
- Payment handoff, changed-bill review, duplicate-tap protection and missing-preview
  blocking passed automated screen tests. No live cart/order mutation or actual
  payment was performed in this update. iOS hardware was not available for testing.
- Final delivery evidence and manual steps: `C:\mscratch\apps\mobile\docs\PRECISE_JOURNEY_CHANGES_V1_15.md`.

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
