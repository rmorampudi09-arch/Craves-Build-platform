# KUSHIRAVI App Build - Version 1.25.1 Ola Maps Address Flow

This branch contains the local KUSHIRAVI Android app build line. Version 1 remains the known-good rollback point installed on the connected phone on 2026-09-29.

## Identity

- Display branch name: `KUSHIRAVI-app build`
- Git branch name: `KUSHIRAVI-app-build`
- Baseline source branch: `origin/mobile-ui-rebuild-from-scratch`
- Baseline commit: `4d6907e254b43180d6d86c540ba4795771778c4f`
- Android package: `com.cravesapp`
- Installed Android versionCode: `40`
- Installed Android versionName: `1.25.1`
- Approved rollback origin: `KUSHIRAVI-app-v1.15.1`, source `5dece0e8cae9208aeccdcf12f231e336ad830bec`.
- Installed release: `KUSHIRAVI-app-v1.25.1`, source/tag checkpoint `0bd37e0c810f749de8dd45a09a9c0f265583adfa` (local branch in the `C:\mscratch` worktree, not pushed). Previous: `KUSHIRAVI-app-v1.25.0` (`4bdc5109837cfb4f3d5436bf9de8b537ed8b8f1f`) and the 1.24.3 + liquid-glass build recorded as commit `7c89bb2a6`. Earlier release: `KUSHIRAVI-app-v1.24.2`, source/tag checkpoint `983a24898a5f7ff3535ce64b8162e70b2d081f7c`. Chef sign-in, verified email, current-location address fill, submission and matching Admin pending request are verified. Subsequent document upload fails and is under investigation; no approval is claimed.
- Last installation: `2026-10-10 19:57:24` Asia/Calcutta, device `GURKT4DYYPUW7DX8` / Xiaomi 22041216I (Android 14); replace-install succeeded without clearing app data.
- Runtime API base URL: `https://api.craves.in`
- Runtime environment: `production`

## Version Checkpoints

### Version 1.34.4 - Meal plans: choose a refund or an extra day, 2026-10-15

- My Meal Plan shows a card for each chef-declined day ("Your chef couldn't make Lunch on Wed, 14 Oct") and for paused
  days ("You paused 3 days"), with "Get a refund" (or "Refund ₹X" once finance prices it) and "Add N day(s) at the end".
  Small print: "If you don't choose by <time> on <date>, we'll add it at the end." Each button asks to confirm first,
  because a choice can't be changed later. Once chosen the card shows the outcome.
- Right after Resume, a new pause choice opens as a prompt with Later / Get a refund / Add N days at the end.
- Needs subscription-service feat/meal-plan-refund-choice (V20). The server ships the refunds switch off, so it sends
  `dayCredits: []` (older servers send nothing) and the app looks exactly as before until finance turns refunds on.
- versionCode 84 on top of 1.34.3 (83, kitchen photos), as decided on 14 Oct.

### Version 1.34.3 - Kitchen photos, on top of 1.34.2, 2026-10-14

- Customers: the kitchen page header plays the chef's kitchen photos as a slideshow (it stays empty when there are
  none), and the Chefs (Discover) cards show the kitchen photos first, then the dish photos.
- Chefs: Kitchen details shows two kitchen photo tiles, "Overall kitchen" and "Cooking setup". An empty tile offers
  Take a photo / Choose from gallery; a filled one can't be replaced or removed, and tapping it says "Kitchen photos
  can't be changed. To change one, contact Craves support." The same message shows if the server refuses an upload.
- The photos are the two the chef uploaded when applying; the server copies them in once the application is
  approved (backend PR rmorampudi09-arch/Craves-Build-platform#504, live in production since 14 Oct). Against an older
  server `kitchenPhotoUrls` is missing, so the kitchen page and Discover look as before and the chef tiles say "Coming soon".
- versionCode 83: built on feat/app-1.34.1 at e3ec9f8f1 (1.34.2, code 82). Meal plan release 2 takes 1.34.4 (84).

### Version 1.34.1 - Outfit font, iPhone text sizes, order screens, with the 1.34.0 meal plans, 2026-10-14

- Joins the two lines that were built separately: 1.34.0 (meal plans, versionCode 80) and
  1.33.0-1.33.6 (order screens and type, versionCodes 73-79).
- Order screens (1.33.0): My Orders cards, Order details with a map that stays blurred under
  Awaiting chef / Chef accepted / Ready for pickup and opens after pickup, Track delivery with the
  map on top. The delivery partner's pin needs `courierLocation` from the server (not sent yet).
- My Orders stays under an order opened from a notification, after payment, or when the app
  reopens on it (1.33.2-1.33.3).
- Outfit is the app font everywhere (1.33.6, picked from the font demo), with real 400/600/700
  weights; type tokens use iPhone sizes: 34/28/20/17/17/15/12 (1.33.5).

### Version 1.34.0 - Meal plans: one repeating week, 14-day bills, pause days per bill, 2026-10-14

- Chefs set up one week (Sun–Sat) for every plan; it repeats once in a weekly bill, twice in a 14-day
  bill and four times in a monthly (28-day) bill. The 28-date picker is gone; a draft set up by date
  starts again as one empty week, a live date plan still shows its dates read-only.
- New bill length "14 days" (FORTNIGHTLY); monthly prices read "/ 28 days". Plan lists, detail and
  payment count meals per bill (Mon–Fri lunch on a 28-day bill = 20 lunches); weekdays list Sunday first.
- My meal plan: pause shows the pause days left this bill (weekly 1, 14-day 3, monthly 7), Pause is off
  when none are left, and a paused plan shows "Restarts on <date>". Needs subscription-service
  feat/meal-plan-week-cycle (V19); against an older server the app behaves as before.
- versionCode 80 skips 72–79, which builds on other branches (1.32.x–1.33.x) already use.
### Version 1.33.1 - Chef picture on every kitchen avatar, 2026-10-14

- On top of 1.33.0 (order screens redesign, which already shows the chef's face on the Orders cards
  and the order details header).
- Customers now also see the chef's drawn face on the food item "Prepared by" card and the cart
  kitchen header (were initials), and in Favorites > Home Chefs / Kitchens (was a chef-hat or
  heart icon). The shared round chef avatar only loads https links and falls back to the plain
  circle if the face fails to load. No picture keeps the old look.
- The faces come from the public kitchen read (`GET /api/v1/catalog/kitchens/{id}`, cached and
  shared with the order screens).

### Version 1.32.0 - Chef profile pictures, 2026-10-13

- Chefs pick one of 18 drawn faces as their profile picture. Never a real photo: chef photo
  uploads are refused by the server and the camera and gallery are gone for this picture.
- Right after approval (and once for any chef who has no picture yet) a "Choose your profile
  picture" screen opens before the chef workspace. Continue stays grey until a face is picked.
  There is no Skip. After a failed save the screen shows "Try again" and "Not now", and "Not now"
  opens the workspace, so a server problem never locks a chef out of orders. A kitchen Craves has
  suspended, a chef with no kitchen yet, or a server that does not send the picture field go
  straight in. Once the workspace has opened it stays open for that visit; the picture screen can
  only come back the next time chef mode opens.
- Later: Profile > Kitchen details > "Your picture" opens "Change your picture" with the same
  faces, Cancel and Save ("Picture saved"). The kitchen photo tile is unchanged.
- Customers see the face next to the chef's name on the kitchen page, the Discover chefs cards
  and the Home top-kitchen cards. If there is no picture, or it fails to load, they see initials
  (on Home: the grey chef-hat circle) as before. Order screens are unchanged.
- Needs catalog-service from PR #493 (branch feat/chef-app-backend) plus the avatar server commits
  on branch feat/chef-avatar-backend, which MUST be folded into #493 before #493 merges: `PUT
  /api/v1/kitchens/me/chef-avatar`, `chefPhotoUrl` on the nearby and public kitchen lists, and the
  18 faces hosted at `public/chef-avatars/chef-avatar-NN.jpg`. Without them, 1.31.x "Your photo"
  uploads real chef photos that #493's public profile serves.
- Release order: merge #493, upload the 18 faces, catalog deploy, gateway route, then install this
  app. Installing earlier is harmless before the catalog deploy (no field, no picker). Between the
  catalog deploy and the gateway route a save fails and "Not now" lets chefs in.
- Spec: docs/superpowers/specs/2026-10-13-chef-avatar-picker-design.md. Plan:
  docs/superpowers/plans/2026-10-13-chef-avatar-picker.md.
- Android versionCode `72`, versionName `1.32.0`. Source: branch `feat/chef-avatar` on top of
  1.31.1 (b4b8db727), local only, not pushed.

### Version 1.31.1 - Ask Craves support chat for chefs and customers, 2026-10-13

- Chef Help & support "Chat with us" and the order page "Problem with this order?" open the Ask
  Craves chat (POST /api/v1/support/chat, channel APP, live on api.craves.in). When the assistant
  opens a ticket the chat shows "Ticket #... created" and opens it. Customers get the same chat from
  Help & support and the order page. Ported from main #468/#469/#471, restyled for the chef kit.
- Chat limits: the per-minute limit waits out Retry-After; the daily limit keeps Send off for the
  visit. Sign-in and other screens keep their generic "too many requests" copy.

### Version 1.31.0 - Chef app redesign: Home, Orders, Menu, Meal plans, Earnings, Profile, 2026-10-13

- Whole chef side rebuilt on one white design kit (white screens, white cards, no grey pages). The
  chef tabs are Home, Orders, Menu, Earnings and Profile, in a plain white floating bar (no glass)
  with the new-order count on Orders. Analytics became Earnings. The bell opens a chef-only
  notifications screen; the old side menu and notifications sheet are gone. Order numbers read
  `#` plus the last 5 characters everywhere, and money reads as `₹1,240`.
- Home: kitchen open, paused or closed with a status sheet and Resume; "Needs you now" (accept with
  cooking time, reject, response timer and customer note when sent); Today tiles; "In the kitchen"
  with a confirm before Mark ready and courier or "Waiting for pickup" on ready orders; menu card,
  latest reviews, balance card with Withdraw.
- Orders: one screen with New, Preparing, Ready, Scheduled and Past, and a status-aware order page
  (reject with a reason, Handed over and Not picked up on ready orders, status times and courier
  details when sent). Buttons ignore a second tap while one request is running.
- Menu: dishes list with search, one filter row, on/off switch per dish (rolls back if it fails),
  one add or edit dish form, publish drafts, delete a dish.
- Meal plans: list with Live, Waiting approval and Drafts, 3-step plan editor, "Taking new
  subscribers" switch, and Daily limits per meal that never overwrite silently.
- Earnings: sales for week, month or a picked range with order counts, Withdraw, payout history and
  Bank account.
- Profile: kitchen details with photos, documents and verification, opening hours and special days,
  preferences (sound, push, email, auto-accept, default cooking time), help and support tickets,
  reviews, refer a chef, login and security, switch to customer, log out.
- Anything whose server route is not published for mobile yet (schedule, reviews, support, scheduled
  orders, full order history, notification settings, kitchen settings, photos, hand-over, delete a
  dish) shows "Coming soon" instead of an error, and goes live on the first successful call with no
  new build.
- Confirm dialogs have a grey Cancel button, and an unknown food type no longer crashes a card.

### Version 1.30.0 - Meal plans only from chefs within 10 km, 2026-10-12

- The Meal plans list now sends the selected location, and the server lists only plans whose
  chef has an active kitchen within 10 km (the same radius as dishes). With no location chosen,
  the list asks for one. Other meal-plan screens still read the full list, so a customer's own plan
  keeps its details after they move.
- Subscribing to a chef more than 10 km from the delivery address is refused by the server
  (DELIVERY_ADDRESS_OUT_OF_RANGE). That check needs the subscription-service release from this change.

### Version 1.29.2 - First dashboard after approval loads cleanly, 2026-10-12

- On a chef's first open after approval the Dashboard listed dishes before the kitchen
  existed (catalog answers 400 KITCHEN_PROFILE_REQUIRED), so it showed "Some live data is
  unavailable" until Retry. Listing and adding dishes now save the kitchen from the
  application first (chefProfileApi.getKitchen) and try once more.
- Verified on the phone with 1.29.1: Khushi Test 2 (approved) shows KPHB Kitchen,
  "Kitchen setup in progress"; the dashboard warning cleared after Retry.

### Version 1.29.1 - Approved chefs get their kitchen, 2026-10-12

- A newly approved chef had no kitchen, so Chef Profile showed "Kitchen details
  unavailable" and Edit profile stayed blocked. When GET /api/v1/kitchens/me answers
  KITCHEN_PROFILE_NOT_FOUND, the app now saves the kitchen from the approved application
  (name, about, address, pin, contact; status DRAFT), like the website's chef-kitchen-handoff.
- A sign-in pass signed before approval has no CHEF role, so "Open your kitchen" failed with
  "We could not verify your Chef access". Account resolution now renews the pass once and
  retries, like the website.
- Still open: chefs approved through the old one-page form have no kitchen name to copy; the
  kitchen editor cannot create a kitchen from scratch yet.

### Version 1.29.0 - Step-by-step chef application, same as craves.in, 2026-10-12

- New chefs now get the website's application (craves.in/chef/application, onboarding v2)
  instead of the one-page form: Basic details (full name, birthday calendar for 18+,
  verified mobile and email), Your kitchen (name, about, Ola map pin with search and
  current location, address, two kitchen photos), FSSAI number or "Don't have FSSAI?"
  (FoSCoS steps, video guide in 23 languages, request a call), Identity verification
  (Aadhaar/PAN/bank statement/other ID, front and back), Bank details when the server
  requires them, Review with terms, then the status page.
- Same server contract as the website: GET/PUT/PATCH /api/v1/chef/onboarding, submit,
  help, document preview/delete, learning content and playback; uploads go multipart to
  /api/v1/chef/application/proof-files; IFSC lookup /api/v1/chef-onboarding/bank/ifsc.
- Draft saved per step ("Save and continue", "Save & exit"), Welcome back list with
  section progress, and changes requested by Craves walk only the flagged sections.
- The older registration and status screens stay as the fallback for applications made
  with the older form, or when the server has no step-by-step application.
- Bank status responses that name the account holder, bank and branch are accepted
  (the old strict check rejected them).
- Known gaps vs the website: photos only (no PDF picker), no upload percentage or cancel.

### Version 1.28.1 - Glass buttons on the kitchen page, popup closes on Add, 2026-10-11

- Kitchen page: the back arrow and kitchen heart in the top bar, and the heart on every
  dish photo, use the Home liquid glass (`LiquidGlassSurface appearance="home"`; dish
  hearts sample their photo through a `BlurTargetView`, like the Home kitchen cards).
- Dish popup: a successful first Add (including Replace in the kitchen-switch popup)
  closes the popup. It stays open on a failure or a price-change message, and − / + on
  a dish already in the cart keeps it open.

### Version 1.28.0 - Kitchen page with the full menu, 2026-10-11

- The kitchen page now holds the whole menu (design Option A in
  `design-review/kitchen-profile/`): an empty white space at the top where chef-uploaded
  kitchen photos will go, a round initials avatar, name, area and "On Craves since",
  three facts from the menu (dish count, veg/non-veg mix, prep-time range), the
  kitchen's line, then sticky category tabs and every dish grouped by category.
  Tabs follow the scroll and jump to a category when tapped.
- The top bar has back and a kitchen favorite heart (saved kitchens, same as the Chefs
  tab); the "in cart" counter is gone. The kitchen name shows in the bar after scrolling.
- Dish rows are compact: veg/non-veg mark, full name, price, prep time and serves, photo
  on the right with the heart and Add on it; Add turns into − 1 + in place.
- Removed: "Active kitchen" pill, Menu button, fact boxes, "What Craves can confirm",
  the made-up "Available - N" count on these rows, and the separate "View all" page
  (`CustomerKitchenDishes`). "Your usual" and Favorites now open the kitchen page.
- Still to do: backend for chefs to upload a profile photo and kitchen photos.

### Version 1.27.3 - White backgrounds and kitchen-switch popup, 2026-10-11

- Cart, Checkout and Discover home chefs page backgrounds are white instead of grey
  (1.27.2). Cards keep their borders.
- Adding a dish from another kitchen now opens a Craves popup instead of a system
  alert. The popup shows "Replace your cart?", the dishes in the cart (two shown, then
  "+ N more"), the dish that would replace them, and Keep cart / Replace buttons.
  `askKitchenSwitch()` lives in `features/cart/components/KitchenSwitchDialog.tsx`,
  and `KitchenSwitchHost` is mounted once in `CustomerRootNavigator`.
- Used by the kitchen page, kitchen dishes, dish popup and favourites (each keeps its
  existing `switchCartKitchen` call). Home's Add button previously had no check (the
  server rejection showed as a warning above the dishes) and now asks too.
- Checks: tsc and eslint clean; Jest 226 suites / 1,388 tests. Installed on
  GURKT4DYYPUW7DX8 (code 63). APK in artifacts. Uncommitted. The popup was not
  opened on the phone because the cart was empty at the time.

### Version 1.27.1 - Cart then Checkout redesign (Option A), 2026-10-11

- Cart page: dishes grouped in a kitchen card (open kitchen, "Add more from this
  kitchen"), delivery card, bottom bar "Item total" + Proceed to Checkout. No bill,
  no Offers card, no location bar or bell (removed in 1.26.4).
- Proceed creates the server checkout (the server empties the cart at this point) and
  shows the Checkout page: address, Your order with Edit, bill details, Razorpay note,
  bar "To pay" + Continue to Payment. Razorpay only opens from the Checkout page.
- Back, Edit or Change on Checkout puts the missing dishes back with add-to-cart
  (`cartItemsToRestore`). A started payment is dropped only if the server still
  reports it unpaid.
- The broken read-only bill preview (`/api/v1/cart/bill-preview`, body-less 403
  from order-service) is no longer called. `CartBillPreviewSync` was unmounted and the
  module was left unused.
- 1.26.2–1.26.4 on the same day: the preview error code was shown in the banner, a
  failed preview no longer blocked checkout, and the "Check previous payment" loop
  after a Razorpay cancel plus a cart change was fixed.
- Design: `Downloads\Craves-Build-platform-KUSHIRAVI-app-build\design-review\cart\board.html`.
- Checks: tsc and eslint clean; Jest 225 suites / 1,386 tests (before the 1.27.1 polish;
  cart suites re-run after it). APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.27.1.apk`,
  installed on GURKT4DYYPUW7DX8 (code 61). Uncommitted. The Checkout page itself was
  not exercised on the phone: tapping Proceed creates a real checkout.

### Version 1.26.0 - Meal Plan Redesign, 2026-10-11

- User approved the meal-plan redesign (board `design-review/meal-plans/board.html`
  in the Downloads folder) with "go with your design", then asked for the backend
  that satisfies it. Plan: `docs/superpowers/plans/2026-10-11-meal-plan-redesign.md`.
- Builds on 1.25.14 (code 53, commit `4592ba4bd`) and another session's 1.25.15
  (code 54, commit `ce0171258`, Chefs-tab photo strip), both committed on this branch.
- Customer: the single meal-plan screen is replaced by a nested stack on the existing
  `CustomerSettingsSubscription` route: Meal Plans list (search, All/Weekly/Monthly,
  banner, plan cards), Meal Plan detail, Review Subscription (start date and address
  Change), Delivery Address picker (add/edit via the Ola editor), Payment (no in-app
  method list; Pay & Subscribe opens Razorpay), Meal Plan Activated, My Meal Plan
  (pause/resume, skip a meal, cancel, this week's schedule, Complete payment) and the
  meal details screen (order tracker when the backend links an order).
- Payment: the old Razorpay sequence is ported unchanged (create with Idempotency-Key,
  invoice wait, order, pending-payment store, verify, recovery). New: leaving Payment
  is blocked while checkout is open; retries and re-entry reuse the created
  subscription; a verify failure after Razorpay returned proof shows "processing";
  recovered payments show a notice on the list.
- Chef: Menu tab has an "Items | Meal plans" switch; the Meal plans tab lists plans
  like items (status, schedule summary, price, Accepting new subscribers switch when
  the backend supports it) with "+ Add new plan"; new Create/Edit Meal Plan editor
  (plan photo, weekly/monthly, price, description, lead time, per-day meal slots with
  editable times, dish and quantity; Save draft / Submit for approval). The old
  Profile "Subscription plan" screen stays for capacity rules.
- Works against today's production: plan photos, ratings, Renews date, the order
  tracker, the chef photo upload and the accepting switch use optional fields from the
  backend branch `feat/meal-plan-backend` (`C:\msub`, not yet merged or deployed) and
  fall back when absent. Ratings use the existing public kitchen review summary.
- Android 1.26.0 / code 55, tag `KUSHIRAVI-app-v1.26.0`. ARM64 release via
  `scripts\build-kushiravi-release-apk.ps1 -PhoneOnly -SkipNpmCi` (3m 9s, 41 of 907
  tasks executed). Signer SHA-256 `fac61745…3b9c`, same as installed; v2/v3 verify.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.26.0.apk` (61,622,479 bytes) SHA-256
  `0FD5CF97F847851110D811AF6AB674801DE489AA1F59EBBCAE9E4F33A89B92E1`; aapt2 badging
  `com.cravesapp` versionCode 55 versionName 1.26.0. Not yet installed.
- Checks: TypeScript clean, ESLint zero warnings on changed files, Jest 224 suites /
  1,383 tests, APIM contract check unchanged (3 pre-existing failures), every task
  spec + quality reviewed, final whole-branch review with one fix wave.

### Version 1.25.1 - Ola Maps Address Flow, 2026-10-10

- User approved the address designs (Design canvas "Craves Address & Ola Maps
  Screens") and asked to integrate Ola Maps per the CRAVES APK guide and the
  location rate-limit patch, validated against GitHub `main`, then build and
  install. Validated on `origin/main` `c9fbe9ed2`: User/Chef
  `CustomerAddressGeocodingController`, `OlaMapsClient` records and
  `LocationRateLimiter` (60 searches / 30 reverse geocodes per customer per
  minute, `429 LOCATION_RATE_LIMITED` + `Retry-After`) match the guide.
  Live probes: both APIM routes answer 401 without a token; the craves.in
  tile proxy serves the Ola style (200 with the craves.in Referer, 403
  without), rewrites every URL to itself and exposes no `api_key`.
- Baseline: the phone ran an uncommitted 1.24.3 + liquid-glass build from
  `C:\cm\mobile` (APK SHA-256 `178a2413…8ff5`, installed 18:24). Its source
  was taken byte-for-byte as commit `7c89bb2a6` so nothing installed is lost.
- Map: `@maplibre/maplibre-react-native` 11.5.0 and `OlaMapPicker` /
  `olaMapTiles` from `main` (`8364ab604`), Ola vector tiles through
  `https://craves.in/api/location/map-tiles`; no Ola key in the APK and no
  `api.olamaps.io` call (bundle checked). iOS Podfile hook as on `main`.
- Address editor is now search -> map pin -> details:
  `POST /customer/addresses/location-search` (350 ms debounce, from 3 letters,
  stale requests cancelled, bias sent as a full lat/lng pair or omitted),
  settled pin -> existing `reverse-geocode`. Flat/house is filled only from a
  precise house number, otherwise empty and required. Area, pincode, city,
  district and state come from the pin in an editable card. Saving still
  requires a pin (manual entry keeps the placed pin).
- States per the guide: empty results, 503 search / reverse geocode (manual
  entry and current location stay available), permission denied (search
  still works; permission asked only on "Use current location"), 429
  (`AppApiError.retryAfterSeconds`; lookups wait Retry-After, retry once).
- Location sheet: search, use current location, add new address, saved
  addresses as radios, "Set map pin" for saved addresses without a pin,
  "Manage addresses". Saving or picking from a delivery picker selects that
  address (and the cart address on Cart). Default header shows label +
  address line (Home, Chefs, Orders, Favorites, Notifications); compact
  header unchanged. Home without a location offers GPS, search or saved.
- 1.25.0 (code 39, tag `KUSHIRAVI-app-v1.25.0`) installed at 19:42:20 IST.
  On the phone the header label read "Ho…" (this Xiaomi under-measures bold
  text; existing "Subscription" is clipped the same way) and in landscape the
  map sheet left a thin strip. 1.25.1 fixes both: the title fills its row
  with an inline chevron; the map sheet is capped at 50% with scrolling copy.
- Android 1.25.1 / code 40, tag `KUSHIRAVI-app-v1.25.1`. ARM64 release via
  `scripts\build-kushiravi-release-apk.ps1 -PhoneOnly -SkipNpmCi` from
  `C:\mscratch\apps\mobile` (1.25.0: 15m 52s, 907 tasks; 1.25.1: 3m 43s, 41
  executed). Signer SHA-256 `fac61745…3b9c`, same as installed; v2/v3 verify.
- APKs: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.25.1.apk` SHA-256
  `2BD12DEA1D0349824E7ED28B7A93B3726A9263EFC53695307ED106D1DB0A9CD9`;
  `KUSHIRAVI-app-v1.25.0.apk` SHA-256
  `8F84D2AA7AA79E999503E7A5300A42C60C84487CD3D61BD2F631F71C863A237E`.
  Source ZIP `KUSHIRAVI-app-v1.25.1-source.zip` SHA-256
  `1976B871CCC55E7C0AA137B9AFB87B7061CB7C743526A12CD9A8C1E7F4263A51`,
  1,155 entries, no `.env`.
- Checks: TypeScript, ESLint (zero warnings) on changed files, `git diff
  --check`; Jest 207 suites / 1,149 tests pass with `--maxWorkers=4` (two
  unrelated screen suites time out under default workers and pass alone),
  including new search-contract, Retry-After and editor-flow tests.
- Phone verification (landscape, phone lying flat): replace-install kept the
  session (the first launch of 1.25.0 showed "We couldn't restore your
  session"; Try again restored it. Auth refresh answered normally from the
  PC; ART was optimising the new APK at that moment; cause not confirmed.
  The 1.25.1 launch restored the session directly).
  Header, sheet, live search ("Madhapur" -> Ola results), map with Ola tiles,
  reverse geocode with approximate-pin warning, drag-to-re-resolve, details
  form (house empty + hint, street and area from the pin), denied-permission
  notice (the permission dialog was dismissed, permission left as it was)
  and discard all work; no crash or JS error. No address was saved and no
  permission was granted: saving and GPS are left for the owner to try.
- Observed, not changed: on this phone bold text sometimes renders regular
  between launches, and pre-existing bold labels with one-line truncation
  (header "Subscription") can be clipped.

### Version 1.24.3 - Android System Bars, 2026-10-10

- User reported a white bar at the top while the red splash showed, and a thick
  red strip at the bottom on every screen. Remove both; no other UI change.
- Cause: the theme hard-coded `navigationBarColor` to `#ff1707` and nothing reset
  it. The JS splash sets a red status bar, but the home screen's `ScreenShell`
  `StatusBar` (white) mounts behind the still-visible splash and wins the
  React Native StatusBar stack, so the status bar turned white mid-splash.
- Fix: `android/gradle.properties` `edgeToEdgeEnabled=true`. Both system bars are
  transparent; the full-screen splash covers them, and screens draw behind the
  gesture bar using their existing safe-area insets. Android 15+ already forces
  edge-to-edge for targetSdk 35+, so Android 14 now matches newer phones.
- Android target 1.24.3 / code 38. Release ARM64 build via
  `scripts\build-kushiravi-release-apk.ps1 -PhoneOnly` from the short build copy
  `C:\cm\mobile` (the Downloads path exceeds ninja 1.10.2's 260-character limit).
  2m 19s, 38 of 823 tasks executed. Existing signer verifies with APK v2/v3.
- APK SHA256 `5198696D5C758FFB973547DC5A2DAFB7531BE8FCD0D6214065E7B89797C3DA4E`.
- Phone verification: replace-install kept the session. A launch burst
  (screenshot about every 0.45s) shows a red status bar with light icons
  throughout the splash (before: white from 2.0s to 4.1s) and no red strip under
  the tab bar. Home, Chefs, Orders and Profile headers sit below the status bar,
  and the tab bar sits above the gesture bar. No crash.
- Not re-verified: login, checkout/Razorpay, chef screens, modals and keyboard
  screens under edge-to-edge on Android 14.

### Version 1.24.2 - Chef Application Current Location, 2026-10-02

- User confirmed Chef sign-in opens registration, then reported the missing
  current-location action. Add only Use my current location above the existing
  address fields; reuse the existing location icon, outline button, native
  foreground permission/GPS service and backend reverse-geocode contract.
- The published APIM POST `/api/v1/customer/addresses/reverse-geocode` targets
  the existing live User-Chef service. No new backend endpoint, keys or resource.
  Fill detected address/city/state/pincode, preserving applicant/email and
  address-line-2/landmark details. The applicant reviews exact house/flat details.
- Send valid detected latitude/longitude through the existing Chef application
  POST contract. Preserve rejected application coordinates on resubmission;
  clear the detected pin when city/state/pincode is manually changed. Do not
  auto-create a Customer address or bypass email verification/Admin approval.
- Explicit tap only, no background location request. Handle denied permission,
  disabled GPS, invalid coordinates and lookup failure without discarding the
  form. Guard duplicate requests, unmounted screens and overlapping submit/logout.
- Android target 1.24.2 / code 37; intended immutable tag `KUSHIRAVI-app-v1.24.2`.
  Intended files `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.2.apk` and
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.2-source.zip`. Prior tags untouched.
- All 204 Jest suites / 1,132 tests pass, including 19 location regressions;
  TypeScript, targeted ESLint and `git diff --check` pass. Build/install and
  validation completed. All-architecture build succeeds in 2m 54s (859 tasks,
  77 executed / 782 up-to-date). Existing signer verifies with APK v2/v3.
- Source/tag checkpoint `983a24898a5f7ff3535ce64b8162e70b2d081f7c`, immutable
  tag `KUSHIRAVI-app-v1.24.2`. Replace-install at 13:06:00 IST and cold launch
  succeed; phone reports code 37 / name 1.24.2 and retains Chef session/email status.
- APK SHA256 `A2C90E321F76BC2A1CAC4EB2FBFDFFAE25472ACF8E6934D1DFAFD05C713BAE30`.
  Source ZIP SHA256 `94C26E4C7988851CD7D97DE006BBFFCDC6B6149551BFF648676CD236575C8CA4`;
  1,123 entries, required rebuild files present, no private `.env`.
- Live GPS/backend lookup fills the address. Owner submits genuine details;
  phone shows Chef application under review. Matching Admin pending request:
  `16e204db-6160-484c-a339-5113b9791941`, account ending 4345, submitted
  `2026-10-02T07:37:37.228468Z` (13:07:37 IST). Admin refresh returns HTTP 200,
  PENDING, saved address and valid latitude/longitude. No Admin decision made.
- Subsequent owner-selected Applicant photo upload shows Document upload failed.
  All four proofs remain missing at this observation. Storage/upload investigation
  is ongoing; registration receipt is not evidence of completed KYC or approval.

### Version 1.24.1 - Chef Registration Recovery, 2026-10-02

- Live 1.24 restart exposed an existing gap: role intent was persisted only after
  successful account resolution, so a failed first Chef login restored Customer
  onboarding. Persist authenticated workspace intent immediately after verified
  login, per identity. This stores intent only; backend authorization still gates
  every product role. Unauthenticated login attempts remain unpersisted.
- Add the existing outline Sign out action to the two registration forms, using
  the existing coordinated logout. A wrong-role applicant can return to the role
  picker without creating a Customer profile or submitting a Chef application.
  No restyling or changes to fields, submission, email verification or approval.
- Installed Android 1.24.1 / code 36; immutable tag `KUSHIRAVI-app-v1.24.1` and paths
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1.apk` and
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.1-source.zip`.
- Verification: all 204 Jest suites / 1,113 tests pass (30 new regression tests
  across 1.24 and 1.24.1), TypeScript and targeted ESLint pass. All-architecture
  release build succeeds in 3m 14s (859 tasks: 77 executed, 782 up-to-date).
  APK v2/v3 signature verifies against the existing signer. Replace-install at
  12:48:21 IST and cold launch succeed; phone confirms code 36 / name 1.24.1.
- Source/tag checkpoint `7cb18d405033e978475798336226d9832f794f28`.
  APK SHA256 `7BE828C7F7B0BF44166ADDC8A53EA5E19308734AF500A3EEBD8225246B35118A`.
  Source ZIP SHA256 `6DCA641691566CB7A1C313C8AAF3D11C5F5873D443716AEE8FDAA7C36612DFA0`;
  1,123 entries, required rebuild files present, private `.env` absent.
- Live empty Customer form -> coordinated Sign out -> role picker -> Chef
  sign-in works without creating a profile or application. After the owner
  signs in, the phone shows Become a Chef and the existing registration form at
  12:54 IST, not the account-verification error. Fields remain empty at that
  observation. Evidence: `artifacts/chef-registration-live-20261002/phone-chef-registration-v1.24.1.png`.
- Genuine applicant details, email verification, application submission and a
  matching Admin pending request still await owner completion. Do not claim
  end-to-end submission from tests or unrelated existing queue entries. No
  backend/APIM changes or Admin decision. All earlier tags remain unchanged.

### Version 1.24 - Chef Application Routing, 2026-10-02

- Requested: fix the live phone's Chef account-verification error and verify
  registration through submission and the Admin pending approval request.
- Clean start `859afe8b0b7a6e71433a0e5d9e4458fe8cc1df4a`, branch
  `KUSHIRAVI-app-build`. Installed baseline remains 1.23 / code 34 until verified
  replace-install. No GitHub push and no UI redesign.
- The mobile resolver previously rejected every non-approved application if the
  authenticated identity already had CHEF. Live read-only checks confirm a
  Chef-enabled identity without an application. Route NOT_SUBMITTED, PENDING and
  REJECTED to the existing onboarding screens irrespective of existing CHEF;
  Chef product access still requires ACTIVE identity, CUSTOMER/CHEF authority,
  matching application ownership and APPROVED application status.
- Validate the backend's application state before routing or confirming
  submission. Do not invent approval, grant/revoke roles, bypass verified email
  or KYC, or write applicant details through diagnostic SQL.
- Android target 1.24 / code 35, intended immutable tag `KUSHIRAVI-app-v1.24`.
  Intended APK/source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24.apk` and
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.24-source.zip`.
- Verification: all 204 Jest suites / 1,108 tests pass, including 25 added
  regression tests. TypeScript, targeted ESLint and `git diff --check` pass.
  Release build and phone acceptance are in progress. APIM publishes the
  application/proof and Admin review routes; the signed-in Admin queue loads
  existing pending applications. This is not yet this phone's submission proof.
  See `docs/chef-registration-live-20261002.md`. No backend/APIM changes made.
- Build succeeded (38m 7s, 859 tasks); APK signer matches the previous release.
  Source/tag checkpoint `a4d6e390b6aaa5d90bf4f3291c640c8a37659827`, immutable tag
  `KUSHIRAVI-app-v1.24`. Replace-install succeeded at 12:40:28 IST; phone reports
  code 35 / name 1.24 and cold launch succeeds. The prior failed login's absent
  persisted Chef choice restores Customer registration; 1.24.1 addresses recovery.
- APK SHA256 `08C3057B032E71ABFF5E5E85EC2BDF50B72E343358A231812983D25F1CD7633E`.
  Source ZIP SHA256 `A3BEAB0B67B9A06FCDD38DC617F0607F24EC689C4AE39D2948FD6B595BDA7BB2`;
  1,123 entries, all required build files present, private `.env` absent.

### Version 1.23 - Centralized Web And Mobile Phone OTP, 2026-10-02

- User authorized live centralized MSG91 authentication. Clean starting source:
  `ccffe5c0136e050390e851dad2186d433102f325` on `KUSHIRAVI-app-build`.
- Android target: code `34`, name `1.23`, intended immutable tag
  `KUSHIRAVI-app-v1.23`. Previous tags remain untouched. No GitHub push.
- Mobile removes the MSG91 native SDK and all widget credentials/configuration.
  Only Craves `/api/v1/auth/otp/send` and `/otp/verify` handle SMS verification.
  Existing Firebase custom-token compatibility, Craves token exchange/storage,
  account IDs, Customer/Chef roles and email login remain unchanged.
- Exact live auth baseline is pinned at image `sha256:01b6783cf1f946b178721aa416feb47f8de98996555879f4ff3d82de2184b88b`.
  New OTP classes/V19 migration only; every existing JAR entry is byte-identical.
  Reuse existing Key Vault `msg91-authkey` and verified DLT template
  `6abe727541deb95f6d0b7192`. Legacy widget verification remains available.
- Exact live web source `e828209dc127085b8c1ffff84387a974b9eeef56` is preserved
  under a rebuildable overlay. Existing login screens are not restyled.
- Shared PostgreSQL challenge leases, hashed random challenge IDs, one-use proof,
  five attempts, two resends, 30-second cooldown, per-phone/shared send limits,
  bounded requests and reviewed errors protect both clients. No automatic SMS retry.
- Release APK/source paths: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.23.apk`
  and `C:\mscratch\artifacts\KUSHIRAVI-app-v1.23-source.zip`.
- Build/deployment, exact image hashes, phone installation and real web SMS
  acceptance are recorded in the rollout receipt. UI, orders, payments, delivery and banners are
  outside this change. No new Azure resource is provisioned.
- Initial live user acceptance failed: an accepted send did not deliver SMS.
  Investigated the exact provider request and DLT delivery status; a separate
  earlier account log reported template mismatch, not correlated with this
  request. Added real-time provider responses, redacted
  operational diagnostics and redirect rejection. Do not claim login readiness
  from invalid-input probes or provider acceptance alone.
- Backend diagnostic fix is committed at
  `8f956490f5cdf8b8036c29098967f34eb8f1fa91` and deployed as healthy auth revision
  `central-otp-rt-1002`, ACR build `cu53`. SMS API Failed Logs correlate the exact
  current request `366a6269706c52556457796c` with error 204 (authkey has no SMS
  send permission). After owner verification the user enabled only Send SMS
  Allowed on the existing `CravesOTPServer` rule 3752 and saved Update. A fresh
  rule read confirms it alongside the original Send OTP Allowed and Widget View;
  no other scopes or IP restrictions changed. Post-change web request
  `366a62695930616376657452` was sent at 09:51:00 and delivered at 09:51:02
  Asia/Calcutta, with Verified YES and INR 0.25 debit. Existing approved Chef
  dashboard opens after sign-in. Full failure/rollout receipt:
  `docs/msg91-centralized-live-20261002.md`.
- Android build/signature verification and replace-install pass. Installed phone
  reports name `1.23`, code `34`; normal launch reaches the existing role picker.
  APK SHA256 `04E3FC546152AEB8538DEB9A150AA0819CF8BFBE180AD3AA1CDFDC6D7C4E857A`.
  Release checkpoint: `4954acbb6694e05fa79d5fbc249c5e96bfd48dca`, immutable tag
  `KUSHIRAVI-app-v1.23`; no previous tag changed.
- Mobile request `366a62693237336d6434596b` is correlated with auth acceptance at
  `2026-10-02T04:24:59.596Z`. MSG91 logs show sent 09:55:04, delivered 09:55:05
  Asia/Calcutta, Verified YES, INR 0.25 debit and the same sender/template/account
  as web. The user confirmed mobile sign-in completed. Both frontends now use
  the centralized backend and the same MSG91 wallet. No OTP or key was exposed.

### Version 1.22 - Admin-Published Home Banners, 2026-10-02

- Banner-only update requested by the user. Clean start on `KUSHIRAVI-app-build`
  at `04cae95fe933f0e88a6173da4752758298bc4692`. No GitHub push.
- Confirmed that mobile used three bundled promotional images and the exact live
  Admin source/module list and current main had no banner publishing feature.
- Replace only the existing home carousel data source with published Catalog
  banners; retain its geometry, location, paging, press action and timer. No fake
  fallback. Visible-home polling, focus reload and pull-to-refresh pick up changes.
- Add banner-only Catalog classes/migration and an Admin upload/draft/publish page
  under `backend-patches/home-banners-v1`; preserve actual runtime baselines and
  unchanged source outside the banner scope. Existing admin authorization applies.
- Android target: versionCode `33`, versionName `1.22`, tag `KUSHIRAVI-app-v1.22`.
  Mobile TypeScript and all 203 suites / 1096 tests pass. Backend's 7 focused tests
  and the 9 new Admin contract/BFF tests pass. Full Admin checks, build, live
  upload/publish and phone verification are in progress, not claimed complete.
- Intended immutable APK/source ZIP paths:
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.22.apk` and
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.22-source.zip`. Exact source SHA,
  deployed images, final test counts and phone evidence will be appended after
  verification. Previous versions remain untouched.
- No other home/menu/glass UI, auth, finance, checkout/order, Razorpay, delivery,
  Chef or customer-web changes. No new Azure resource or public storage container.
- Final source: `b9be7ea33ab8a3fcd615beac491a32f708a01bef`, immutable tag
  `KUSHIRAVI-app-v1.22`. APK build/signature verification and replace-install
  succeeded; phone reports code 33 / name 1.22. APK SHA256:
  `F0FD0ACF219ACDB3DE54DBC6703425C7500752204AAA094B488C8C4D39724B6A`.
- Final Admin checks: TypeScript and changed-source lint pass; 422 Vitest and
  334 Node tests pass. Initial full-tree tests lacked root fixtures; restored the
  exact baseline repository. Worker/time-out failures were re-run with bounded
  workers and a 15-second test limit; no test or runtime behavior was skipped.
  Existing dependency audit reports 10 issues (2 moderate, 7 high, 1 critical);
  dependencies were not upgraded in this banner-only change.
- Catalog ACR build `cu4y`, healthy one-replica revision
  `ca-craves-catalog-service-prodlo--home-banners-1002`, image
  `sha256:c7792c391e7dbac986c420394ea452092039c84f1b6c2eec29dd768a632ebf0c`.
  V8 migration applied. All pre-existing runtime archive entries are unchanged.
  Literal environment values, secret references, CPU/memory and replica limits
  match the prior ready revision. Azure materialized defaults in its metadata;
  a raw unordered-JSON fingerprint was not a reliable comparison.
- Admin ACR build `cu50`, healthy one-replica revision
  `ca-craves-admin-r92-ffe80e7c--home-banners-1002`, image
  `sha256:750cccb048743cf4e15d118e53d9ec9af93c15793eadbe3296460c9a3aa8574c`.
  Existing configuration matches its pre-deployment fingerprint ignoring JSON
  key order. Existing Front Door origin and APIM Catalog wildcard routes reused;
  no APIM, Front Door, role, secret or customer-web deployment changes.
- Uploaded the existing approved Craves web artwork through the real Admin UI,
  converted only from WebP to JPEG. Banner ID
  `50fe8e74-8397-4ab8-8a84-560d43851e21`, label `Craves homemade food`.
  Draft absent from public feed; public draft image access denied (production
  security error dispatch returns 403). Publish returns this ID and exact JPEG
  bytes; unpublish returns empty feed; republished and left live. Image SHA256:
  `FBA1A8E7BCF55C96C489DA4F10D5F9670DE9C911DDC093D2E767F30816FC251D`.
- Source ZIP SHA256:
  `7F24274B4C273CB5A99AAB0F49D1F5ABE702E667B1FD5CF6BB75D87D14E86A2D`.
  Checked the archived version, banner sources, build script and signing input.
  Text matches Git-normalized newlines; signing bytes match exactly. This is an
  input inspection, not a second complete clean ZIP build.
- Full receipt, changed paths, manual test steps and limitations:
  `docs/home-banners-20261002.md`. No OTP was entered by the agent. No phone Home
  screenshot or live native rendering success is claimed until the user signs in.

### MSG91 Independent Web And Mobile OTP v1, 2026-10-02

- User explicitly requested simultaneous web/mobile sign-in without UI/UX
  changes. Clean start on `KUSHIRAVI-app-build` at
  `9de3adfb4b4b12d9fc9c011bba0e64be25075054`. No GitHub push.
- Confirmed the live Web app's actual source
  `889fea7b13d9b05be86ea482c8abbfb387544750`, not the older reference. Fetched
  that exact commit read-only, without switching or modifying either branch.
- Preserve existing widget `366942756930393636363638` in Mobile mode and the
  installed v1.21 configuration URL. Created a separate web widget
  `366a62307562353731383338` with the existing Craves India SMS template,
  six-digit OTP, 30-second resend, two resends, 15-minute expiry, invisible OTP
  off, and web CAPTCHA protection retained. User explicitly requested completing
  its Free OTP Widget plan, monthly charge/confirmation amount/spending limit
  all zero. No wallet top-up, paid plan or spending-limit increase.
- Web configuration route accepts `platform=web` for the dedicated web widget;
  legacy/no-platform and `platform=mobile` preserve the existing mobile widget.
  Web SDK explicitly requests web. Missing/shared web config fails closed; no
  bypass or fallback to a wrong-platform widget. Existing server token bridge
  and identity/account/role/session contracts remain unchanged.
- Only two web runtime files and their focused tests are overlaid on the exact
  deployed web baseline. Source, rebuild/verification instructions:
  `backend-patches\msg91-dual-platform-v1`. Checkpoint tag:
  `KUSHIRAVI-msg91-dual-platform-v1`; rebuild-fixture/baseline clarification
  checkpoint `KUSHIRAVI-msg91-dual-platform-v1.1`. Current ready web baseline
  completed during inspection: revision `ca-craves-web-prodlow--0000066`, image
  `sha256:1886687428f003b80c31affb1987e3995055e17be9a16d969ae9df98ecad9f9d`.
  Source remains the same exact web commit above. Build/deployment/live acceptance evidence
  will be appended after verification; this entry is not a success claim.
- Mobile runtime/UI/version/APK unchanged: installed `KUSHIRAVI-app-v1.21`,
  code 32 / name 1.21, source `5fac235a421f9541dfac40f3d82beee7fe6fad93`;
  APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`. No mobile rebuild is
  needed because its public configuration contract remains compatible.
- Deployment verified: source `01728e3d27220691b8f67cc65b8e8791f790ecc5`, tag
  `KUSHIRAVI-msg91-dual-platform-v1.1`. TypeScript/changed-source lint pass;
  423 Vitest and 340 Node tests pass. ACR build `cu4x` passed; healthy Web
  revision `ca-craves-web-prodlow--msg91-dual-1002` serves 100% traffic, image
  `sha256:8a5a8d7c5781bdecfbdf8d2a6419a38e4c80c2bb159f653d51ecea96c266c77c`.
  Existing non-OTP template/secret references verified unchanged. Same-run live
  configuration readback confirms mobile mode 1 and separate web mode 0.
  Live landing auth bundle uses the independent web URL. Fresh user-only sign-in
  on both platforms requested; not inferred from successful configuration reads.
  Source ZIP, hashes, exact paths, rollback and full receipt:
  `docs\msg91-dual-platform-20261002.md`.
- After being asked to test the deployed split on web and mobile, the user
  confirmed "it is working". This is recorded as user-reported acceptance,
  not an agent-created session or independent trace of two OTP exchanges.
  No OTP was read or entered. Existing APK/tags remain untouched.

### MSG91 Mobile Configuration Repair v2, 2026-10-02

- Clean start on `KUSHIRAVI-app-build` at
  `ad0ef851e4551dc498583741f69eefc89a75944d`. No GitHub push.
- User reported Send OTP failing on the connected phone. The actual phone
  displayed "Mobile verification is not enabled yet. Please try again shortly."
  The live widget policy, fetched using the application's public configuration,
  confirmed `mobileIntegration: 0`. Reloading the existing CravesOTP settings
  confirmed that the saved Widget Integration selection was web, not Mobile.
- Restored only Widget Integration to Mobile in the existing MSG91 widget
  `366942756930393636363638`; saved with Save & Next. MSG91 reported success.
  Reopened settings and independently read back the provider policy at
  `2026-10-02T00:11:40.3117381Z`: `mobileIntegration: 1`. Other checked policy
  fields remained unchanged, including six-digit SMS OTP, 30-second resend,
  two resends, 15-minute expiry, CAPTCHA off and invisible OTP off.
- User subsequently confirmed: "OTP arrived and sign-in works". The user
  requested and entered the genuine OTP on the phone; the agent did not read
  or enter any OTP, password or phone input. No artificial session was created.
- Configuration-only checkpoint: `KUSHIRAVI-msg91-mobile-config-v2`.
  Repair evidence and recurrence precautions:
  `docs\msg91-mobile-installation-20261002.md`. Git tags record evidence;
  they do not restore external MSG91 settings.
- Mobile source/UI/backend contracts unchanged. Installed app remains code 32 /
  name 1.21, tag `KUSHIRAVI-app-v1.21`, source
  `5fac235a421f9541dfac40f3d82beee7fe6fad93`. Existing APK:
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`.
  No rebuild/reinstall/version increment, credential access, backend/APIM
  deployment, new resource, template edit or security-check bypass.

### Backend Checkpoint - Pidge Coordinate Routing v1, 2026-10-02

- Requested backend-only correction: use actual latitude/longitude and Pidge's
  real-time serviceability, not literal city-name equality. No UI/UX changes.
- The waiting command for checkout `9047d2d6-54e1-4a05-96ad-d10ae6e4164d`
  failed locally on pickup city `HYD` versus drop city `Hyderabad`; the deployed
  validator threw before contacting Pidge. Actual kitchen order:
  `c6c6481c-1b93-4d03-bffd-e1ea79f4f8d4`.
- Patch source/rebuild/test tools: `backend-patches\pidge-coordinate-routing-v1`.
  Replaces only the two Pidge adapter/transport classes in the exact immutable
  live Integration Service image; preserves all other deployed archive entries.
- Keeps address/contact/coordinate/postcode, prepaid/weight, immediate-partner,
  price revalidation and duplicate-booking safeguards. Adds safe provider logs.
  Pidge remains the only active provider; Borzo remains disabled.
- Backend source checkpoint tag: `KUSHIRAVI-delivery-pidge-coordinates-v1`.
  Source `bfc870c2a37bca2fe89da8ab8d2ae5f01b3a43a5`. ACR build `cu4w`
  deployed healthy revision `ca-craves-integration-service-pr--pidge-coord-1002`.
  New image digest:
  `sha256:9c0919f6d25f69ffe00cbadc7957f2afd717949b6306ee12e5f7ee385110ca81`.
- Verification: 26 focused tests pass; broader suite has 396 executed / 284
  database-dependent skipped, zero failures/errors. Exact runtime archive
  comparison and unchanged environment hash verified. Normal pending retry
  received Pidge HTTP 200 / one eligible partner, completed the delivery command
  and fulfilled Pidge booking `179089878105454L7CGG6`. Live delivery status
  `COURIER_TO_PICKUP` / `OUT_FOR_PICKUP`; provider callback applied.
  No manual replay, extra diagnostic quote or forced order transition.
- Exact source ZIP, tested JAR/image, logs and live database evidence:
  `docs\delivery-pidge-coordinates-20261002.md`. Customer browser session had
  expired (401); sign-in was requested before authenticated screen readback.
- Mobile remains `KUSHIRAVI-app-v1.21`, source
  `5fac235a421f9541dfac40f3d82beee7fe6fad93`, code 32 / name 1.21.
  Existing APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`.
  No APK rebuild/install, GitHub push, APIM, new infrastructure or payment edit.

### Version 1.21 - Reachable Chef Order Rejection, 2026-10-02

- Clean start on `KUSHIRAVI-app-build` at
  `ffae3e945fee8030093806809af56e3a3980e080`; phone had v1.20 / code 31.
  No GitHub push. Previous tags and APK checkpoints remain untouched.
- Package `com.cravesapp`, versionCode `32`, versionName `1.21`.
  Immutable checkpoint: `KUSHIRAVI-app-v1.21`, source
  `5fac235a421f9541dfac40f3d82beee7fe6fad93`.
- Reproduced on the connected phone: tapping Reject in New orders opens the
  sheet, but the unbounded flex reason input pushes Cancel/Reject Order below
  the screen. The native UI tree has no visible confirmation control.
- Bounded the multiline reason field to its existing 112-point size. Both
  rejection sheets have a scrollable, height-constrained body and a separate
  non-shrinking action row, with bottom safe-area padding. Kept original
  styling, labels, colors, order cards and acceptance flow.
- Rejection errors are visible inside the New orders sheet; opening a new
  rejection clears old feedback/draft. Empty reasons and in-flight actions
  cannot submit. The same existing validated API, UUID tracing, idempotency,
  server ownership checks and authoritative status reconciliation are retained.
- No backend/APIM deployment, order/payment/refund edits, role grants,
  acceptance deadline bypass or delivery routing changes.
- Verification: TypeScript passes; changed TS/TSX ESLint passes with zero
  warnings; full Jest suite passes (202 suites / 1,088 tests). The screen suite
  covers both rejection entry points, bounded field/footer placement, empty
  reason, cancellation, delayed server success, failure and busy guards.
- Signed release build passed in 4m 26s, 864 tasks (41 executed / 823 cached),
  arm64-v8a. APK metadata code 32 / name 1.21; v2/v3 signing verifies with
  the unchanged certificate.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`, 49,015,928 bytes.
  SHA-256: `0FDD5E1AF580FC645E63D557158960B541B8433A2FFB3B299DE11F4362663918`.
  Tagged source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21-source.zip`,
  13,337,908 bytes.
  SHA-256: `1B67F26F6CB0A788C37A054E8574E11F86CC3137719BC3C10356AFF55631EE1D`.
- Replace-install succeeded; device confirms code 32 / name 1.21, update time
  `2026-10-02 03:38:39` Asia/Calcutta. Its actual installed base APK SHA-256
  matches the versioned file exactly. First-install timestamp unchanged:
  `2026-09-30 03:39:04`. Cold launch OK (487 ms), Chef session restored.
- Physical checks: New orders and order-detail Reject sheets show both buttons
  before/after the keyboard opens. Blank reason disables confirmation; a typed
  reason enables it. Cancel closes each sheet with one tap while the keyboard
  is open and keeps the order in New. Reopening clears the draft. Zero matched
  process crash/JavaScript errors; phone left on Chef Orders -> New.
- No production rejection, refund, paid acceptance, ready mutation or delivery
  booking was submitted. Server success/failure submission is covered by
  automated tests; a genuine fresh order remains the production retest.
- Detailed build/phone receipt and test steps:
  `docs\chef-order-rejection-v1.21-20261002.md`.

### Version 1.20 - Chef Acceptance and Automatic Preparation Time, 2026-10-02

- Branch `KUSHIRAVI-app-build`, clean start at
  `68abc6244358666a49a019f3840af7116ad559e6`. No GitHub push.
- Android package `com.cravesapp`, versionCode `31`, versionName `1.20`.
  Installable checkpoint: `KUSHIRAVI-app-v1.20`; immutable source SHA and
  source `0e892a5b3517ddcf4725dce8e7552e12809d1b79`.
  Build/install receipt recorded after verification. Previous tags untouched.
- Removed manual preparation-time entry from New orders and order detail.
  Accept now uses the existing authorized menu metadata for the ordered items:
  longest item preparation time, matching the existing cart rule; only items
  with no saved preparation time use the user-approved 15-minute default.
  An existing server order preparation time is preserved. Menu read failures
  are not treated as missing times and do not send an acceptance.
- Live Order Service logs confirmed the reported permission-looking failure
  was preceded by `X-Correlation-ID` UUID conversion errors for the mobile
  `mobile-...` tracking IDs. Mobile now uses the already-installed Expo native
  UUID generator. Backend/APIM routes, credentials, roles and access checks
  are unchanged; acceptance, rejection and ready-for-pickup all receive UUIDs.
- Preserved server revalidation, per-order duplicate guard, idempotency keys,
  authoritative status reconciliation and rejection reasons. A failed list
  refresh no longer turns an authoritative successful acceptance into an error.
  When the server rejects an expired order still stored as pending, its actual
  expiry message is preserved instead of reporting a misleading status change.
- No backend deployment, financial/order policy changes, account grants,
  acceptance-deadline bypass, Pidge/Borzo changes or unrelated UI redesign.
- Verification: TypeScript passed; all changed JS/TS/TSX files passed ESLint
  with zero warnings; entire Jest suite passed (202 suites / 1,078 tests).
  Final signed release build passed in 3m 9s, 864 tasks, arm64-v8a; APK metadata
  confirms code 31 / name 1.20. Signing certificate unchanged.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.20.apk`.
  SHA-256: `AF4D9511673B198BB81631E804AB90BBC2B6F83BBE0B5806E4A448FD81D138E2`.
  Tagged source: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.20-source.zip`.
  ZIP SHA-256: `5E1FD353877C8A4DAF740106BE4C76F8FA0BA2E388673D02F8A3A4748D07291C`.
- Replace-install succeeded; phone confirms code 31 / name 1.20, update time
  `2026-10-02 03:11:43` Asia/Calcutta. Original first-install timestamp remains
  `2026-09-30 03:39:04`. Cold launch OK, authenticated Chef side restored.
- Live read checks: menu, New orders, order detail, Preparing and Ready lists
  load. Order detail has zero preparation inputs and an enabled Accept button;
  New orders has zero preparation inputs. No matched process crash/UUID errors.
  Left the phone on New orders. No paid accept/reject/ready mutation, delivery
  booking or old-order replay was triggered; a genuine fresh order is needed
  for production mutation/handoff verification.
- Full receipt and precise manual steps:
  `docs\chef-order-acceptance-v1.20-20261002.md`.

### Delivery Intelligence / Pidge Routing Configuration v1, 2026-10-02

- User requested investigation of order `05b31712-f30e-4bb5-a922-2da7ae0943e9`,
  Pidge priority through delivery intelligence, and temporary Borzo disablement.
  Confirmed clean `KUSHIRAVI-app-build` before production changes. No GitHub push.
- Confirmed exact command `b3089845-6dc8-3f73-9672-af829b169692`, Chef sub-order
  `78110b83-cce9-4fe8-981e-36c3a2ce25a3`, DEAD_LETTER after five attempts:
  `503 SERVICE_UNAVAILABLE "Delivery intelligence is disabled"`.
  No delivery job, assignment or Pidge booking exists for that order.
- Integration Service: set `CRAVES_DELIVERY_INTELLIGENCE_ENABLED=true` and
  `BORZO_API_ENABLED=false`. Same immutable image, new healthy revision
  `ca-craves-integration-service-pr--pidge-1002`, one ready replica, 100% traffic.
- Used the existing authenticated provider-registration API to set only Borzo's
  active state false, preserving its name, adapter, coverage and capabilities.
  Pidge remains active; all other providers were already inactive. New routing
  therefore considers only Pidge through the existing intelligence algorithm;
  no hardcoded booking shortcut, scoring change or artificial success state.
- Found the Order Service delivery-status consumer also disabled. Enabled only
  `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=true`, same image, healthy revision
  `ca-craves-order-service-prodlow--delivery-1002`, one replica, 100% traffic.
  Existing Service Bus receiver role/subscription preserved; startup and actual
  receiver-link activation confirmed. No new permissions or resources created.
- Both service health checks UP. Pidge protected readiness reports production
  ready / active / no blockers. Before/after fingerprints match for all other
  service template/configuration settings after neutralizing only these flags
  and revision suffixes. Original dead letter retained: no replay, queue drain,
  order/payment/refund edit, new quote, booking or provider dispatch.
- Safe unavailable-candidate diagnostic returned opaque HTTP 503, so it was
  not counted as proof. A subsequent deliberate unknown-provider diagnostic
  returned HTTP 400 rather than disabled-engine 503; no assignments/jobs/bookings
  were created. Genuine new-order / rider / tracking acceptance remains for
  the user's requested retest. No production delivery status was fabricated.
- Temporary one-address database firewall rule removed; original rules restored.
  This is backend configuration only: no app-code/UI changes, build, reinstall,
  APK version increment or moved APK tag. Mobile remains v1.19/code 30, source
  `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`, tag `KUSHIRAVI-app-v1.19`.
- Local configuration checkpoint tag `KUSHIRAVI-delivery-pidge-routing-v1`
  (not an installable version). Receipt, exact images/settings, verification
  boundaries and rollback: `docs\delivery-pidge-routing-20261002.md`.

### MSG91 Mobile Integration Configuration v1, 2026-10-02

- User explicitly requested enabling Mobile Integration and signed into the
  existing MSG91 account. Confirmed clean `KUSHIRAVI-app-build` before the change.
- Edited only existing `CravesOTP` widget `366942756930393636363638` in MSG91:
  Widget Settings -> Widget Integration -> Mobile -> Save & Next.
  Portal confirmed "Widget updated successfully". Reopened settings from the
  widget list and verified Mobile remained selected after loading saved values.
- Read-only live configuration before/after confirmed `mobileIntegration: 0`
  became `1`. All other checked fields identical: provider MSG91, same widget,
  enabled status, Mobile Number/OTP verification, six digits, CAPTCHA/invisible
  OTP off, retry 30 seconds/two retries, expiry 15 minutes. Did not edit channel
  configuration, SMS template, DLT, credentials, wallet, subscription or caps.
- Native adapter reads this policy for each new Send OTP request. No APK rebuild,
  reinstall, app-code change or version increment required. Installed package
  remains `com.cravesapp`, code `30` / name `1.19`, tag `KUSHIRAVI-app-v1.19`,
  source `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`. Previous tags/APKs untouched.
- User retried on the phone and subsequently confirmed on 2026-10-02:
  "yes i got otp and logged in". SMS receipt and successful OTP sign-in are
  user-confirmed, not independently inspected or traced by the agent. Chef
  restoration, wrong-code/resend and session-lifecycle edge cases remain
  unchecked live. No phone number/OTP/password was entered or read by the agent.
- Configuration-only local checkpoint tag: `KUSHIRAVI-msg91-mobile-config-v1`,
  not an installable APK version. Resolve its documentation commit with
  `git rev-parse KUSHIRAVI-msg91-mobile-config-v1^{}`. No GitHub push.
- Receipt and screenshot: `docs\msg91-mobile-installation-20261002.md` and
  `C:\mscratch\artifacts\msg91-mobile-20261002\mobile-integration-enabled.jpg`.
  This resolves the historical Mobile Integration OFF blocker below; it does
  not imply that any other live acceptance check has passed.

### Version 1.19 - Native MSG91 OTP Integration, 2026-10-02

- Branch `KUSHIRAVI-app-build`; clean start at
  `8750c988845c0c3c7fab43d41aa27ddbfe687d6a`. No GitHub push, backend changes,
  payment changes, UI redesign, role grants or account migration.
- Android package `com.cravesapp`, versionCode `30`, versionName `1.19`.
  Installable tag `KUSHIRAVI-app-v1.19`; exact source
  `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`. Source committed locally and
  annotated tag created after the successful release build; no tag was moved.
- Uses the official native MSG91 SDK and the live web configuration/verification
  contract. Firebase SMS methods removed. Backend-issued Firebase custom token
  compatibility remains necessary because the verified live backend still uses
  it to preserve existing identities, Chef roles and Craves refresh sessions.
  Email/password and recovery remain consistent with the working web.
- Resend now retries its existing provider request and tracks replacement IDs.
  Cooldown, retries and expiry come from actual widget configuration. Runtime
  response checks, bounded requests, double-tap guards, cancellation, replay
  prevention and partial-session cleanup added. Existing screens/styles retained.
- Live reference: `https://craves.in/api/version` source
  `0472d7e58f9c205c60b55ca7d7475a3953f056c1`. GitHub main remained Firebase;
  compared the deployed Azure DevOps branch instead of assuming main was live.
  Public config selected MSG91, backend enabled, malformed bridge body returned
  HTTP 400 `AUTH_REQUEST_INVALID`. Provider read-only policy confirmed six digits,
  30 seconds/two retries/15 minutes; Mobile Integration was OFF at preflight.
  User action requested to enable only that existing setting. No Firebase SMS
  fallback or bypass while mobile verification is unavailable.
- Release build succeeded in 6m 7s, 864 tasks (94 executed / 770 up-to-date),
  using the existing script with `-SkipNpmCi -PhoneOnly`. Official MSG91 Android
  module autolinked; v2/v3 APK signature verified with the unchanged signing
  certificate. Package `com.cravesapp`, arm64-v8a, minSdk 24 / targetSdk 36.
- Replace-install returned Success without clearing app data. Phone readback:
  code `30`, name `1.19`, last update `2026-10-02 00:31:40` Asia/Calcutta.
  Customer Home and Profile loaded; cold native activity launch returned ok,
  603ms total / 639ms wait. Checked process logs had no fatal/JS/native-module
  error matches; this is not a blanket crash audit.
- Reported OTP error confirmed on the phone: "Mobile verification is not
  enabled yet. Please try again shortly." This was on the Send OTP form,
  before SMS delivery or OTP verification. Read-only provider policy recheck
  still returned `mobileIntegration: 0`. Existing MSG91 account sign-in and
  enabling only CravesOTP Mobile Integration are required; no APK rebuild is
  needed for this remote setting. No OTP/password was read, entered or logged.
- At initial installation, fresh SMS/OTP sign-in, resend/wrong-code acceptance
  and Chef restoration had NOT been verified live. The attempted Chef switch
  reached its confirmation dialog, but the subsequent visible screen was phone
  entry, not Chef Dashboard;
  stopped input to avoid interrupting user authentication. No role was granted
  or successful Chef check inferred from the earlier v1.18 installation.
- Pre-build verification: TypeScript passed; changed-source ESLint passed with
  zero warnings; all 197 Jest suites / 1,054 tests passed. Focused auth checks:
  25 suites / 162 tests passed. These are automated checks, not SMS acceptance.
- Immutable APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.19.apk`, 49,007,736 bytes;
  SHA-256 `C153E6E83274203C94CC38AC4BBA7DFDE8C3B8C4019A4B3B8787D2974583F64B`.
  Exact tagged source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.19-source.zip`;
  SHA-256 `4A20C200980E9CB9939AADB5CAED1D1BC4B1CBDEC907D1AEC629AC36767F4F9D`.
  Prior APKs/tags retained unchanged. Installation receipt and remaining manual
  checks: `docs\msg91-mobile-installation-20261002.md`.
- Setup, exact contracts, protected boundaries and manual acceptance steps:
  `src\features\auth\msg91\README.md`.

### Chef Application Auth Connection v1, 2026-10-01 - Backend configuration only

- Requested fix for Chef application submission failing to save the address.
  Confirmed clean `KUSHIRAVI-app-build` before investigation. Mobile address
  field names/limits match the main-branch backend DTO and database columns;
  no form, layout, address rule or mobile runtime change was needed.
- Running backend image `craves/user-chef-service:activate-69`, immutable digest
  `sha256:cd5b819909bedef99065269cca6dd69346865d3d40b45ddb33d3206ac74fb6da`,
  contains the verified-email guard before application INSERT/UPDATE. Its
  configured internal Auth URL included `/api/v1/auth`, which that guard rejects
  with `503 EMAIL_AUTHORITY_UNAVAILABLE` before saving any application fields.
- Corrected only `CRAVES_AUTH_INTERNAL_BASE_URL` on existing Azure app
  `ca-craves-user-chef-service-prod` to the existing Auth service HTTPS origin.
  Live revision: `ca-craves-user-chef-service-prod--chef-auth-20261001`;
  Succeeded/Running/Healthy, one replica, 100% traffic. Same backend image,
  credentials/references, resources, scale, ingress and verification rules.
  No database/schema write, APIM edit, new resource or financial activation.
- Both native service health endpoints returned HTTP 200 / UP. From inside
  the corrected revision, its actual configured Auth origin and existing
  service credential reached the protected identity lookup. A deliberately
  nonexistent identity returned honest `400 IDENTITY_NOT_FOUND`, not an
  authentication or connection error. No real identity or application changed.
- Like-for-like original/corrected revision template hashes are identical
  after neutralizing only the requested Auth URL and revision suffix:
  `5E01A0C584E3E5ED4AEC3EF418938BE3F81FF1DB2DD48216AC6984C1793C77AA`.
  App configuration fingerprint is unchanged. Earlier app/revision API-view
  comparisons flagged representation/default differences; retained as diagnostic
  evidence, not passed guards or proof of unrelated running changes.
- TypeScript passed. Mobile application/domain/validation: 3 suites / 10 tests
  passed. Existing backend canonical-email and Auth HTTP guards: 2 classes /
  6 tests passed, no failures/errors/skips. Anonymous application POST remains
  HTTP 401. No OTP, new application, approval or credential bypass performed.
- Real applicant submission/PENDING status and saved-address readback remain
  a manual acceptance check: the phone account has existing approved Chef
  access and must not be overwritten to manufacture a successful test.
- Local configuration checkpoint tag: `KUSHIRAVI-chef-application-auth-v1`
  (not an APK tag). Runtime app remains `KUSHIRAVI-app-v1.18`, source
  `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a`, code `29` / name `1.18`;
  APK/source ZIP and all prior tags remain untouched. No rebuild, reinstall,
  version increment, GitHub push or change to the original source branch.
- Detailed cause, exact settings, evidence paths, repeat checks and rollback:
  `docs\chef-application-auth-connection-20261001.md`.

### Version 1.18 Installed And Phone-Checked, 2026-10-01

- Requested installation and live checks on the connected phone. Verified clean
  `KUSHIRAVI-app-build` before operating it; installed the existing immutable
  v1.18 APK with replace-install. Result: Success; existing sign-in preserved.
  Phone package readback: `com.cravesapp`, code `29`, name `1.18`, last update
  `2026-10-01 21:44:04` Asia/Calcutta, device `RS7PB6VOY9ZLLFYD` / RMX5003.
- Installed tag/source: `KUSHIRAVI-app-v1.18` /
  `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a`. APK:
  `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18.apk`; SHA-256
  `B5E202ACC268B83E8189293F0C05DA2ED70B3B67DEC948DBD22F4713E7DCE2EC`.
  Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18-source.zip`;
  SHA-256 `507D36F07509609EF362F6D93C39FC9AD4B1D046F576285BA1A05FB1B480A111`.
  Both hashes rechecked. Existing v2/v3 signature verified before installation;
  signer SHA-256 remains
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- Native screenshots and UI hierarchies inspected for Customer Refer a friend,
  Share invitation, Chef Refer & earn and Chef earnings. Copy link displayed
  Link copied; More opened Android's native chooser and was cancelled without
  choosing a recipient. Clipboard bytes and WhatsApp/Messages composers were
  not independently exercised. No invitation was sent.
- Existing signed-in Customer -> Chef switch opened Dashboard without signup.
  Chef Profile -> Refer a chef -> View referral earnings worked. Cold reopening
  from earnings restored Chef mode and the earnings screen; Back to referrals
  correctly returned to the overview. A normal Chef -> Customer switch worked;
  final cold reopen remained Customer Home. Phone left in Customer Mode.
- Remaining native issue: after restoring Chef earnings and returning to its
  overview, Android Back goes to Dashboard instead of Chef Profile Home; the
  Profile tab retains the referral detail stack. Reopening from Dashboard
  restored a fresh Profile stack, allowing the normal workspace switch.
  Repeatable steps and likely restoration path recorded in the test receipt.
  No runtime fix, UI change or additional APK was made in this install turn.
- Initial native activity launch: Status ok, cold, 582ms total / 602ms wait.
  Final Customer cold launch: Status ok, 378ms total / 386ms wait. These are
  activity timings, not full React/auth-ready startup measurements. Scoped
  AndroidRuntime/ReactNativeJS/ReactNative error checks for the checked app
  processes were empty, including final PID `28075`; not a blanket crash audit.
- The prior approved backend deployment made the two protected member GETs
  live; backend tag/source `KUSHIRAVI-referral-backend-v1.1` /
  `4e98febeeab94e87fcb70ef853cb3654d97d2631`. Its real-account checks returned
  honest not-enrolled 403 responses. This supersedes the older local-only
  checkpoint's live-route status, without changing that historical evidence.
  The mobile code/earnings/reward flags remain false: native screens display
  unavailable values honestly. No memberships, consent, credits or payments
  created. Terms, genuine enrolment and financial acceptance remain pending.
- Installation-only continuation: no code edits, rebuild, version increment,
  moved tags, backend changes or GitHub push. Only these version notes and
  `docs\referral-v1.18-phone-install-20261001.md` are committed locally.
  Previous build-time TypeScript and 195 suites / 1,019 passing tests are
  retained evidence, not represented as rerun during this phone check.
- Detailed native results, exact evidence filenames, remaining issue and manual
  repeat steps: `docs\referral-v1.18-phone-install-20261001.md`.
  Backend deployment receipt:
  `C:\mscratch-referral-backend\docs\referrals\LIVE_RELEASE_RECEIPT_20261001.md`.

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
