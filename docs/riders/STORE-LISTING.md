# Craves Riders: store listing pack (Indus Appstore first, Google Play later)

Everything a person needs to list the rider app (`com.cravesapp.rider`) on PhonePe's Indus Appstore, written from the code and the docs in this repo as of `origin/main` 43e336bba (26 Nov 2026). `[TO CONFIRM]` marks a fact the repo doesn't have. Nothing here has been checked in the Indus developer portal: its limits and forms are the owner's questions at the end.

Sources: `RELEASE.md`, `NATIVE.md`, `PHONE-TESTS.md`, `GO-LIVE.md` §7–8 and "Accounts and listings", `BACKEND.md` "Data retention", `apps/mobile/src/features/rider/**`, `apps/mobile/android/app/src/rider/**`, and the web pages in `apps/customer-web-next/src/app/{privacy,terms,account-deletion}`.

## 1. The build to upload

| | Value | Where it comes from |
|---|---|---|
| Package | `com.cravesapp.rider` | `android/app/build.gradle`, rider flavor `applicationId` |
| Launcher name | Craves Riders | `src/rider/res/values/strings.xml` `app_name` |
| Newest live build | 1.4.1, versionCode 71, commit 6df30b777, 13 Nov 2026 (run 43468418005), APK 89,750,946 bytes | the run, and release `delivery-app-latest` (the same file, SHA-256 `1f8f050d…acd43`) |
| minSdk / targetSdk | 24 / 36 | the APK's manifest |
| Native code | arm64-v8a and armeabi-v7a only | `rider-apk.yml` checks it |
| Signing certificate SHA-256 | `6d08ab79d30151333fe897b30840fcf16c11079be10f56b248accd0b3c1e6265` (APK signature scheme v2; no v1 JAR signature) | every live run #61 to #71 prints it; the APKs of #69, #71 and the release were checked on 26 Nov 2026 |
| Version for the upload | **[TO CONFIRM]: the next live build.** Rider changes merged since build 71 (#696 ops-assign ring, #697 ring receipt) are not in any live build yet. The rider flavor's versionName and `RIDER_APP_VERSION` are both still 1.4.1; raise both in one commit only if riders must move to it (`RELEASE.md`, "Updates are required"). | `git log 6df30b777..origin/main -- apps/mobile` |
| File format | APK (`craves-rider-live-<sha>.apk`) and AAB (`craves-rider-live-<sha>.aab`) from the same live run; Indus's preferred format **[TO CONFIRM]** | `RELEASE.md` |

**Never change the signing key** (`RELEASE.md`). The app binds each rider to one phone by `ANDROID_ID`, which Android derives per signing key. If Indus re-signs apps with its own key, every rider installing from Indus counts as a new phone and can't update over the GitHub APK, or the other way round. Confirm Indus distributes our signature unchanged before the first upload.

## 2. Listing text

**App name:** "Craves Riders – Delivery Partner" is 32 characters, over a 30-character limit. Proposed: **Craves Riders Delivery Partner** (30). Other options: "Craves Riders – Delivery App" (28), "Craves Riders – Partner App" (27). Indus's actual limit **[TO CONFIRM]**.

**Short description (79 of 80 characters):**

> Deliver for Craves in Hyderabad: pay shown first, free to decline, paid weekly.

**Long description:**

> Craves Riders is the app for delivery partners who deliver home-cooked food for Craves in Hyderabad. It is not the Craves food-ordering app. To order food, get the Craves app: [TO CONFIRM link].
>
> Join with your phone number
> • Sign in with your mobile number and the 6-digit code we send by SMS. New here? The same number starts your application.
> • Send photos of your driving licence, vehicle RC, insurance, PUC certificate, PAN card and bank proof, and a selfie. A person at Craves checks them, usually within a day.
> • No fee, no deposit, no kit cost to join. Don't pay anyone who asks.
> • You must be 18 or older.
>
> Know the pay before you ride
> • Every order shows the pay before you accept. The pay is locked: you get at least that, plus any tip.
> • Saying no is free. Nothing is counted.
> • Offers ring with their own sound, even with the screen off.
>
> On the trip
> • Directions open in Google Maps.
> • Show the order code to the chef at the kitchen, and ask the customer for their 4-digit code at the door.
> • No signal? Each step is saved on the phone and sent when you are back online.
>
> Earnings and payouts
> • See what you earned on each trip and each day.
> • Your whole balance is paid to your bank account or UPI ID every Monday. You can also take one free withdrawal a day.
>
> Safety and help
> • SOS: call Craves ops or 112 in one tap, and send your location to Craves ops.
> • Report a problem with a trip or a payout from the app.
> • Any change to the terms is shown in the app 14 days before it starts.
> • Get a copy of the data Craves keeps about you from the app.
>
> Your location is used only while you are online, never in the background.

Every claim above is in the app (`strings/en.ts`: `signIn`, the application's `docNames`, `offer.locked`, `offer.freeDecline`, `earnings`, `payouts`, `sos`, `terms.changesAhead`; `screens/trip/parts.tsx` for Google Maps; `api/riderApi.ts` `getMyData`). Left out on purpose:

- **Languages.** The app carries English, Telugu, Hindi and Kannada text (`strings/{en,te,hi,kn}.ts`, `res/values-{te,hi,kn}`), but live builds offer **English only**: `REVIEWED_LANGUAGES` in `strings/StringsProvider.tsx` is empty until a native speaker signs each one off (`GO-LIVE.md` §8). List English only; add a language to the listing when it is added there.
- Breaks, order distance limits and heading home: behind `CRAVES_FLEET_RIDER_CHOICES_ENABLED`, off.
- Insurance: the insurer isn't chosen yet (`GO-LIVE.md`, "Accounts and listings").

## 3. Category and rating

- **Category: Business.** The app is work for delivery partners: sign-up, offers, trips, pay. It draws no route itself (it opens Google Maps for directions), so Maps & Navigation would mislead. Indus's category names **[TO CONFIRM]**.
- **Audience: 18+ only.** Sign-up requires "I am 18 or older" (`RiderSignUp.adult`).
- **Content rating answers:** no violence, sexual content, gambling or drugs; no ads (no ad SDK in `package.json`); no user content shared with other users (support notes and delivery photos go to Craves ops only); no in-app purchases (riders are paid, they never pay); no web browsing beyond opening the terms and privacy notice; **shares the rider's location with Craves** while online. Customers see no Craves rider's position: the fleet code in integration-service sends none to order tracking (`courierLocation` comes only from courier partners) **[TO CONFIRM on the server]**.
- **Price:** free.

## 4. Data declaration (Indus now, Google Play Data safety later)

Collected means sent to Craves servers. "Shared" means sent to a party other than Craves or its processors. All traffic is HTTPS (`usesCleartextTraffic="false"` in the live APK). A rider can get a copy of their data in the app (`GET /my-data`).

| Data | Collected / shared | Why | Required? | Kept |
|---|---|---|---|---|
| Mobile number | Collected. Sent to MSG91 to deliver the sign-in SMS. | Sign-in, account, ops calls | Required | [TO CONFIRM] |
| SMS sign-in code | Read on the phone only from the one SMS the rider allows (SMS User Consent API, no SMS permission); sent once to verify | Sign-in | Optional (can be typed) | Not kept by the app |
| Name (as on PAN), vehicle kind, model and plate, app language, 18+ confirmation | Collected | Application, document checks, payouts in the rider's name | Required | [TO CONFIRM] |
| Document photos: driving licence, RC, insurance, PUC, PAN, bank proof, sign-up selfie | Collected | A person checks identity and vehicle | Required | [TO CONFIRM]. No Aadhaar document type exists (`BACKEND.md`). |
| Payout account: UPI ID, or bank account number and IFSC, and holder name | Collected. Sent to Craves's bank in the weekly payout file. | Paying the rider | Required to be paid | [TO CONFIRM] (tax law may set 8 years, as for chefs) |
| Go-online selfie, every shift | Collected. The face check runs on the phone (ML Kit, bundled model); only the photo is sent. | Ops checks the right person is riding | Required to go online | 30 days unless flagged, **once `CRAVES_FLEET_PHOTO_RETENTION_ENABLED` is on; it is off, so today nothing is deleted** |
| Precise location | Collected while online only (fixes every 10 s idle, every 3 s on a trip), from the Go Online tap to Go offline. Never in the background, no background-location permission. | Offers near the rider, trip progress, pay by distance, safety | Required to go online | Latest position: 15 min after the last fix. On-trip track: 90 days. |
| Location with an SOS press | Collected, with the trip; ops lead gets an email with the phone and a map link | Emergency help | Optional (rider presses SOS) | [TO CONFIRM] |
| Delivery photo (customer not answering) | Collected | Proof of delivery | Only in that case | 90 days unless disputed, once the same switch is on (off today) |
| Home spot, about 1 km | Collected | Orders on the way home | Optional; behind a switch that is off | Until deleted, or 90 days unused |
| Device: `ANDROID_ID` for this app, FCM token, app version, phone model | Collected. The FCM token goes to Google (Firebase Cloud Messaging) to deliver offers. | One phone per rider; offer pushes | Required | [TO CONFIRM] |
| Phone health while online: battery %, charging, power saver, whether offers can ring, why the app last closed, unsent step counts; when each offer rang | Collected about once a minute | Find phones that miss offers | Required while online | Health: 90 days. Ring receipts: [TO CONFIRM] |
| Trips, offers and why each came, steps, earnings, withdrawals, payouts | Collected | Pay, disputes, tax | Required | [TO CONFIRM] |
| Support reports (category, note, trip or payout) | Collected | Fix the rider's problem | Optional | [TO CONFIRM] |
| Terms and privacy-notice acceptances | Collected | Legal record | Required | [TO CONFIRM] |
| Crash reports, analytics | None by Craves: no crash or analytics SDK, and `setObservabilitySink` is never called | — | — | — |
| Razorpay SDK (built into the shared app; riders never pay) | Initialises at every start (WebView warm-up, `AnalyticsUtil.trackEvent`, `Lumberjack.transmitSavedEvents`) and may send device and network details to Razorpay. **Not verified.** | None for riders | — | Open item 3 |

**Mismatches with the web pages (open items):**

1. `/privacy` (`apps/customer-web-next/src/app/privacy/page.tsx`) is written for customers. It doesn't mention rider location, document photos, selfies, the device ID, phone health, MSG91, Firebase Cloud Messaging, Ola Maps (map tiles) or the bank. Its "Firebase for phone authentication" is wrong for riders: MSG91 sends the code, Firebase only holds the session.
2. There is no `/delivery-partners/privacy` page in the source. The rider privacy notice (`CRAVES_FLEET_PRIVACY_NOTICE_URL`, `GO-LIVE.md` §8) waits for the lawyer's text and is unset. The listing needs a privacy URL that covers riders: [TO CONFIRM].
3. `/account-deletion` covers customers and chefs only, and the rider app has no delete-account path. Google Play requires one in the app and on the web for apps with sign-up; Indus's rule [TO CONFIRM].
4. Photo retention is written in `BACKEND.md` but switched off, so a listing that says "selfies are deleted after 30 days" would be false today.
5. `/terms` is the customer terms; the rider terms live in the app (`GET /terms`) with an optional full-text URL [TO CONFIRM it is published].

## 5. Notes for the reviewer

**Sign-in:** a test rider phone number and OTP [ops to provide]. The account must be ACTIVE, with published rates, and its phone binding cleared or the reviewer's phone approved by ops (`DEVICE_NOT_BOUND` otherwise). Offers come only near Craves kitchens in Hyderabad, so a reviewer elsewhere sees Home but no offers; a screen recording of a trip helps [TO CONFIRM: make one].

**Location only while online.** The location service starts only from the Go Online tap and stops at Go offline; the app never asks for background location.

One line per sensitive permission, each checked in the code:

| Permission | What it does in this app |
|---|---|
| `ACCESS_FINE_LOCATION` (and coarse) | Precise position while online, to offer nearby orders and track the trip. Phone setup asks for "Precise". |
| `FOREGROUND_SERVICE_LOCATION` | `RiderOnlineService` (`foregroundServiceType="location"`) runs with the "You're online" notification from Go Online to Go offline. |
| `USE_FULL_SCREEN_INTENT` | A ringing order offer opens over the lock screen (`RiderOffers.kt`), only if the rider allowed it in Phone setup (Android 14+). |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Phone setup's one-tap "Allow" so Android doesn't stop the online service (`RiderDeviceModule.openBatterySettings`). |
| `RECEIVE_BOOT_COMPLETED` | The saved trip-step queue (`RiderOutboxJob`, a persisted job) sends steps after a reboot. It doesn't restart the online service. |
| `POST_NOTIFICATIONS` | Order offers, the "You're online" notice and trip updates (cancelled, reassigned). |
| `WAKE_LOCK` | While online the phone holds a partial wake lock for the whole shift, so location uploads continue with the screen off. It is dropped only when the server sends `callbackUploads`, i.e. when `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED` is on; it is off (default `false` in integration-service `application.yml`) as far as the repo knows. Short wake locks (20 s at most) also cover each upload. |
| `CAMERA` | The go-online selfie, document photos and a delivery photo, each when the rider taps. |
| `VIBRATE`, `FOREGROUND_SERVICE`, `ACCESS_NETWORK_STATE`, `INTERNET` | Offer ringing, the online service, waiting for a network, API calls. |

Library permissions kept: `ACCESS_WIFI_STATE` (MapLibre map, used for the offer map), `READ_`/`WRITE_EXTERNAL_STORAGE` up to Android 12 only (expo-image-picker and expo-file-system: choosing a document photo from the gallery), `com.google.android.c2dm.permission.RECEIVE` (Firebase Cloud Messaging), `READ_GSERVICES` (Google reCAPTCHA through Firebase Auth). Removed in the rider manifest from the next build: `NFC`, `READ_BASIC_PHONE_STATE` (Razorpay), `USE_BIOMETRIC`, `USE_FINGERPRINT` (androidx.biometric). Build 71 still has them.

## 6. Screenshots plan

Take 6 to 8 phone screenshots from the **demo build** (`com.cravesapp.rider.demo`, "Craves Riders Demo"): a mock-mode APK from the "Craves Rider APK" workflow (a pull request build, or a manual run with `api_mode` `mock`). It shows only made-up data and never talks to Craves. Never use a live build or real riders', customers' or chefs' details.

| # | Screen | How to get there in the demo |
|---|---|---|
| 1 | Sign-in | First open |
| 2 | Phone setup | After sign-in (all checks green) |
| 3 | Home, online | Go online (demo selfie) |
| 4 | Offer card with pay and the map | Demo controls: long-press the status chip, send an offer |
| 5 | Kitchen leg with the code board | Accept, then "I've reached the kitchen" |
| 6 | OTP hand-over | "Picked up", then "I've reached the customer" |
| 7 | Trip complete | Enter the demo OTP, Delivered |
| 8 | Earnings | Earnings tab |

Capture each with `adb exec-out screencap -p > 0N-<screen>.png` (portrait, phone, no crop of the status bar). Sizes Indus accepts: [TO CONFIRM].

**Demo-only marks that would show (open item 5):** the "Demo data" badge in the header of every screen with a header (`components/RiderHeader.tsx`, line 82, `isDemo`); "Demo build: any 10-digit number works and the code is 123456." on both sign-in screens (`app/rider/signIn/RiderPhoneScreen.tsx`, `RiderOtpScreen.tsx`); "Demo: the OTP is …" on the hand-over (`screens/trip/Dropoff.tsx`); and the language picker with four languages, where a live build shows English only. Decide: keep them (honest, but the screenshots don't match the live app), or crop and edit them out. Also check that every name and phone number in the demo data (`api/riderApi.mock.ts`) is made up before publishing.

## 7. Open items

1. **Signing:** Indus must keep our signature (section 1). If it re-signs, stop: don't list.
2. **Updates outside the store:** the app tells riders below the newest version to "Update now", which opens `craves.in/rider` (the GitHub APK). Confirm Indus allows this for an app it distributes, or decide how store installs should update.
3. **Razorpay in the rider app:** its SDK initialises at every start and may send analytics to Razorpay, and its `<queries>` (an `ACTION_MAIN` intent, UPI and credpay schemes) give the app visibility of most installed apps. Riders never use it. Either declare it, or remove Razorpay's startup initializers and queries from the rider flavor (a manifest change that needs a phone check).
4. **Privacy policy and account deletion for riders** (section 4, items 1–3).
5. **Screenshots:** the demo marks (section 6).
6. **Languages:** listing in English only until `REVIEWED_LANGUAGES` has more.
7. **Customer app link** for the long description: [TO CONFIRM].
8. **Wake lock:** Google Play flags wake locks held 2 hours or more with the screen off; turn on `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED` after `PHONE-TESTS.md` §1 passes both ways, before any Play rollout (`GO-LIVE.md` §8). Whether Indus checks this: [TO CONFIRM].
9. **Reviewer account:** ops to create the test rider and clear its phone binding (section 5).

## 8. Questions only the owner can answer in the Indus developer portal

- [ ] Account type and company KYC: which documents (company PAN, GST, certificate of incorporation, a director's ID, D-U-N-S?) and how long verification takes.
- [ ] Fees: to register, to list, per app or per update.
- [ ] Upload format (APK or AAB) and size limit; our APK is about 90 MB.
- [ ] Signing: does Indus keep the developer's signature, or re-sign?
- [ ] App name, short and long description limits.
- [ ] Icon size and format (the launcher icon is `@mipmap/craves_launcher`).
- [ ] Screenshot count, sizes and aspect ratios; feature graphic or banner size; promo video.
- [ ] Category list, content rating system and data declaration form fields.
- [ ] Privacy policy and account-deletion URL requirements.
- [ ] Rules on apps that update themselves from a website (open item 2).
- [ ] Review time for the first listing and for updates, and whether updates can be staged or limited.
- [ ] Can the listing be unlisted or limited to invited riders while the pilot is small?
- [ ] Where to give reviewer sign-in details and notes.
- [ ] Country availability (India only) and support contact shown on the listing.
