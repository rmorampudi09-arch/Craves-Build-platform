# Craves Rider: phone tests for the online service and offer ringing

A person runs these on real phones. Use a **live** build (`CRAVES_RIDER_API_MODE=live`, real `RIDER_GOOGLE_SERVICES_JSON`) against the backend in test mode, with an allow-listed rider whose phone is approved. Write the results in the tables at the end.

The server records what these tests measure: when each offer rang and by which channel, each shift's silences and battery, and each step's sync delay. Read them in the console (Rider pilot health, and the rider's own page) or with the read-only queries in `PILOT-HEALTH.md` instead of a stopwatch. They need app 1.1.0 or later.

## Before each phone

1. Install the live APK (`craves-rider-live-<sha>.apk`) from the "craves-rider-apk" artifact: run the "Craves Rider APK" workflow by hand on `main` (live is the default), or set the repo variable `CRAVES_RIDER_API_MODE=live` for PR builds.
2. Sign in, accept the terms, and finish **Phone setup** (all checks green, including autostart, battery "no restrictions" and "lock Craves in recent apps"). From app 1.3.1 the battery button asks once with Android's "Allow" dialog, and location must be "Precise".
3. Charge to at least 80%, Wi-Fi off, mobile data on, location on.
4. Connect adb if you can and keep `adb logcat -s CravesRiderOffer CravesRiderOnline > <brand>.log` running.
5. Note the model, Android version and OEM skin (MIUI/HyperOS, ColorOS, Funtouch/OriginOS, realme UI, One UI).

## 1. Service survival: 4 hours (a 4 GB and a 3 GB phone; done when both pass)

1. Tap **Go online** (selfie). The "You're online" notification appears.
2. Lock the screen. Leave the phone still for 30 minutes.
3. Unlock, **swipe Craves Rider away** from recent apps, lock again.
4. Turn **battery saver on**. Leave the phone for the rest of the 4 hours, screen off, moving it now and then (a short walk or ride).
5. During the 4 hours, ops checks every 30 minutes on the ops console that the rider was **seen in the last 45 s** (or the backend's `rider_shift.last_seen_at`, which every location call sets, with or without a new fix).
6. At 4 hours: the "You're online" notification is still there.
7. Tap **Go offline**. The notification goes away and uploads stop.
8. Run `shift_survival` and `battery_per_hour` (`PILOT-HEALTH.md`). For this shift, write down `longest_silence_s`, `silences_over_60s`, `last_exit_reason` and the battery used per hour.

**Pass:** `silences_over_60s` is 0 (no gap over 60 s between location calls during the 4 hours), and the notification survived the swipe and battery saver. **Fail:** write down when uploads stopped, what the phone was doing and the `last_exit_reason`.

**Then again with uploads on location batches (P2-10; required before any Play rollout).** Ask the backend owner to set `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED=true` (phones then drop the shift-long wake lock and upload on each location batch under a short lock), and run this section once more on the same phones with the same APK. **Pass:** the same pass as above, and battery per hour no worse than the run with it off. Write both runs in the table (mode: wake lock / location batches). If either phone fails, set it back to false.

Also try once per phone (record, not pass/fail):

- Reboot while online: the service doesn't come back on its own (no background location by design). Opening the app resumes it without a new selfie while the shift is valid.
- Force stop in Settings, then open the app: same as reboot.
- Selfie face check (app 1.3.1): go online with the helmet on, with a second person in the photo, and with eyes shut. Each asks to take the selfie again and says why; a plain selfie goes straight through. Write down any plain selfie it refused.
- Airplane mode for 2 minutes, then off: uploads resume within 10 s and the fixes from the gap arrive (all of the first minute, then one per 30 s; P2-03), oldest first.
- Trip cancelled with the screen off: on a test trip, lock the phone and have ops cancel the trip in the console. The "Trip cancelled" notification appears within 15 s, and tapping it opens the app on the cancelled trip.

## 2. Offer to ring: p95 under 5 s (Xiaomi, Oppo, Vivo, Realme, Samsung)

For each phone, send **20 offers** to the rider through dispatch in test mode. Mix the states:

| Offers | Phone state |
|---|---|
| 5 | App open, screen on |
| 5 | App in background, screen off |
| 5 | App swiped away, screen off, battery saver on |
| 5 | Doze forced: `adb shell dumpsys deviceidle force-idle` (screen off, unplugged) |

The phone records each offer's arrival itself and reports it on its next location call. After the 20 offers, run `offer_to_ring`, `first_channel` and `push_results` (`PILOT-HEALTH.md`) and read the rows for this phone's model. If that model had other offers in the last 7 days, add `AND o.offered_at > '<the test's start time>'` to each query's `WHERE` line.

- **Offer to ring:** `rang_at − offered_at`, from the server creating the offer to the phone ringing; p50, p95 and p99.
- **First channel:** `fcm` or `locations`. Logcat shows it too (`offer <id> first via <channel>`), with the other channel's gap on the `also via ..., N ms after ...` line.
- **Missed:** offers that never rang (`offers − rang`), and what `push_results` says about their pushes.

Checks on every phone:

- [ ] The phone rings (ringtone and vibration) and shows a heads-up notification, with the screen off too.
- [ ] Tapping the notification opens the app on the Offer screen with the right countdown.
- [ ] The same offer never rings twice when both channels deliver it.
- [ ] After accept or decline, the ringing stops by the next location call (within 15 s).
- [ ] An offer that expires stops ringing and its notification disappears.
- [ ] Phone setup's **Test ring** rings the same way.

**Pass:** `p95_s` under 5 for each phone's model over its 20 offers, and none missed. If FCM misses and the location call delivers, that offer can take up to about 11 s; if p95 fails because of it, write how many offers came by `locations` first.

## 3. Airplane-mode trip test: zero lost steps (a 4 GB and a 3 GB phone)

The app keeps every trip step on the phone until the server has it, through a force stop and a reboot, and the server counts each step from when it was tapped (app 1.1.0). A restart without signal opens from what the phone saved last time (the rider, Home and the trip in progress, encrypted on the phone), so the trip carries on; the app checks for signal every 10 s and signs in again by itself.

1. Accept a test offer. Turn **airplane mode on**.
2. Tap **I've reached the kitchen**, then **Picked up**. Each step moves on at once and shows "Saved · will sync".
3. **Force stop** the app (Settings → Apps → Craves Rider → Force stop) and reopen it, still offline. Home opens with "You're offline" and "You have a trip in progress"; **Open trip** shows the trip at the customer leg, not at the kitchen.
4. Tap **I've reached the customer**, enter the customer's OTP and tap **Delivered**. The app shows "Delivery saved" and "We'll check the code when you're back online. You can go."
5. Turn **airplane mode off** and note the time. Within about 10 s the app is back online by itself and the saved steps go to the server.
6. Check the trip on the server (read-only):

   ```sql
   SELECT kind, created_at, detail ->> 'ageMs' AS age_ms FROM fleet_schema.trip_event WHERE trip_id = '<trip id>' ORDER BY created_at;
   ```

   `ARRIVED_PICKUP`, `PICKED_UP`, `ARRIVED_DROP` and `DELIVERED` are all there, in that order, created within 60 s of step 5; each `age_ms` is about how long before then you tapped it.

Run it three ways on each phone: as above; with a **reboot** instead of the force stop in step 3 (reboot with airplane mode still on, then reopen the app); and once with the **photo route** in step 4 (at the customer, tap Call twice and wait until "You can leave at …" has passed, then take the photo; the delivery goes with the photo the app kept).

**With the native outbox** (once the server's `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED` is on, the app keeps trip steps in the phone's native outbox, P2-02), run two more on each phone, online with a shift started:

- **Swiped away:** steps 1 and 2, then swipe the app away from recent apps (not Force stop; "You're online" stays in the notifications). Turn airplane mode off and don't open the app. The steps reach the server within 60 s: the online service sends them after its next upload.
- **Reboot, app not opened:** steps 1 and 2, then reboot with airplane mode still on. After the reboot turn airplane mode off and don't open the app. The steps reach the server within 5 minutes, sent by the outbox's job, on phones whose maker lets jobs run; write down any phone where they wait for the app. Then try a **Force stop** instead of the reboot: Android cancels the job, so those steps go when the app opens; write down what each phone does.

A phone that has never been online with this app, or that was offline for more than a day, has nothing saved to open from: it shows "Something went wrong" with **Try again** until there is signal.

**Pass:** every step of every run reaches the server, in order, within 60 s of the signal coming back. **Fail:** write down which step is missing or out of order and what the app showed.

## 4. Language review: Telugu and Hindi (a native speaker of each, before riders get it)

Live builds show riders English until a language is signed off (WORKPLAN P2-08). This review uses a **demo** build (`craves-rider-mock-<sha>.apk`: run the workflow with `mock`), which offers all three languages. Sign in with any 10-digit number and the code 123456.

1. Profile, then Language, then తెలుగు (or हिन्दी). Go through every screen in that language:
   - sign-up and the terms (sign out first);
   - phone setup, home and going online;
   - an offer;
   - every trip step: food not ready, the customer not answering, the photo, the OTP, and marking a trip failed;
   - trip complete, earnings, a trip's pay and payouts;
   - Profile, Help, SOS and a notice;
   - the privacy notice screen (Demo controls → Publish a privacy notice; its link opens the customer privacy page, as a stand-in for the lawyer's text).

   The **Demo controls** screen makes offers, notices and the privacy notice. Small screens: check that no button or banner cuts its words off.
2. The notification words (an offer, "You're online", trip cancelled, "You're offline", the test ring) don't show in a demo build. Read them in `apps/mobile/android/app/src/rider/res/values-te/strings.xml` (or `values-hi`) against `values/strings.xml`, about 20 lines.
3. Write each correction with its screen and the English line; an agent changes `strings/te.ts` or `hi.ts` and the strings file, and the speaker checks the next build.
4. The lawyer reads the terms screen and the appeal, grievance and notice lines in each language.

**Pass:** the speaker signs off every screen and notification line, and the lawyer the terms words. An agent then adds the language to `REVIEWED_LANGUAGES` in `apps/mobile/src/features/rider/strings/StringsProvider.tsx`. After that release, on a live build: pick the language, go online and let an offer ring; the notification reads in that language.

## 5. Privacy notice (once the lawyer's text is published, WORKPLAN P2-09)

On a live build, after `CRAVES_FLEET_PRIVACY_NOTICE_VERSION` and `CRAVES_FLEET_PRIVACY_NOTICE_URL` are set and the rider APIM is republished:

1. Open the app as an active rider who is offline. "Your privacy" shows before Home, with the version.
2. Tap **Read the privacy notice**: the browser opens the text in the language on screen (English, and Telugu or Hindi once they are signed off).
3. Tap **I have read it and agree**: Home opens. Close and reopen the app: the notice doesn't come back.
4. With a rider who is online, set a new version: nothing interrupts the shift or the trip. After the rider goes offline and reopens the app, the new notice shows.
5. Sign up a new rider: the notice comes before the documents.

**Pass:** every step as written, and each acceptance is in `fleet_schema.rider_privacy_acceptance` with its version and language.

## 6. Offer rules, breaks, distances and the data copy (Phase 4)

Set-up:
- Two pilot riders, A and B, online near one pilot kitchen, on a live build, in test mode.
- A dispatch policy in `live` with the rules from `DISPATCH.md` §7: one rider at a time, 30 s to accept, 3 rounds.
- For steps 3, 4 and 6, `CRAVES_FLEET_RIDER_CHOICES_ENABLED` on, after the gateway runs this release (`GO-LIVE.md` §8).

1. **Why this offer.** Place a test order at the kitchen.
   - Only one phone rings, and its offer says why, for example "You're the nearest free rider." or the fair-turns line.
   - Terms → "How you get orders" lists the same rules as the console.
2. **The next round.** On that phone, tap **Decline**.
   - Within about 10 s the other phone rings, with "You're the next nearest free rider." or the fair-turns line.
   - Let it run out: the order goes to Borzo at the stage's end, and neither rider sees a warning or a count.
3. **A break.** On A, Home → **Take a break** → 10 min.
   - Home shows "On a break until …".
   - Place a test order: only B rings.
   - On A, tap **I'm back**, then place another: A can ring again.
4. **Distances.** On A, Profile → "Orders you hear of" → kitchen at most 1 km, then stand about 2 km from the kitchen.
   - A test order rings only B.
   - Set it back to **Any**.
5. **The data copy.** On A, Profile → Your data → **Share a copy of my data**, and share it to yourself.
   - The JSON holds A's offers, each with `whyThisOffer`, and A's break.
   - Ops downloads A's data from the rider's page in the console.
   - A's next copy lists that download under `opsActions`.

6. **Heading home (Phase 5).** Have A stand at a spot about 4 km from the kitchen, on the far side from where test orders drop.
   - Profile → "Home spot for heading home" → **I'm home: save this spot**. It reads "Saved on …".
   - Ride back near the kitchen. Home → **Head home**: Home shows "Heading home until …" (an hour from now).
   - A test order whose drop lies toward the saved spot rings A, with "On your way home: the drop leaves you … km nearer home."
   - A test order dropping the other way rings only B.
   - Ride to within 1 km of the saved spot: within a minute Home no longer says "Heading home".
   - Profile → **Delete home spot**: it reads "At home? Save this spot…" again.

**Pass:** every step as written; on Rider pilot health, `offer_rules` shows round 2, and `rider_choices` counts the break and the limit.

## 7. Apply and get approved (app 1.2.0, `FLOWS.md`)

Set-up: a live build, a phone number that isn't a rider yet, and the console open as an operations admin and as a
payments admin.

1. **Apply.** Sign in. "Apply to ride", step 1 of 4. Next without a name or the box: each says what is missing. Fill
   them, Next; on step 2 a wrong plate is refused before anything is sent. Petrol, a plate, "Honda Activa 6G", Next.
2. **Photos.** Step 3 lists six photos. Add one with **Take a photo** and one with **Choose from gallery** (a PNG
   screenshot works). Kill the app and open it again: it opens on step 3 with those two sent. Press the phone's back
   button: step 2, with the plate on file. Send the rest; Next unlocks. Send a UPI ID: "Application sent".
3. **Fixes.** In the console, Riders → To review shows the rider. Mark the licence Needs a fix with a reason and the
   payout account Return; **Send fixes**. On the phone (open, or on returning to it) within a minute: "Fix 2 things to
   go on" with that reason. Send both again: "Sent again".
4. **Approve.** In the console the rider is back in To review. Mark everything Looks good (dates for the licence, RC,
   insurance, PUC) and Confirm; **Approve and activate**. The panel says the rider is on the pilot riders. On the phone
   within a minute: the terms with "You're approved" (or "Pay rates are on the way" with no rate card), then Home with
   "Before you go online".

**Pass:** every step as written; the rider's page shows one audit entry for each decision.

## 8. The sign-in code from the SMS, every way back, and the decision on the phone (app 1.2.0, `FLOWS.md` §4, §9)

Set-up: a live build on a phone with Google Play services and a SIM that receives SMS, signed out.

1. **Paste.** Copy "+91 98480 12345" (your number) and paste it into the number field: it shows the ten digits. Send code.
2. **Allow.** Under the code field: "When the SMS comes, tap Allow and the code fills in by itself." When the SMS comes,
   Android asks whether Craves Rider may read that message; **Allow**: the code fills in and the app signs in, no tap.
3. **Deny.** Sign out, sign in again, and **Deny** this time: nothing fills in. Type the code: the sixth digit signs in.
4. **Resend.** Sign out and in again; wait for Resend, press it, and Allow on the second SMS: its code fills in.
5. **Without Play services** (a phone without Google services, if one is at hand): no line about Allow; typing works.
6. **The way back.** Profile → Terms, Help and Phone setup: each has ← and the phone's Back returns to Profile. On an
   offer the phone's Back does nothing; Decline returns to Home. Online on Home, Go offline asks; Stay online keeps the
   shift.
7. **The decision reaches the phone.** Apply on a new number and close the app. In the console, send one fix: a notice
   "Your application needs a fix" appears; tapping it opens the app on the fix. Send it, close the app, approve: "You're
   approved" appears, and the app opens on the pay terms. Accept: Phone setup opens by itself; Done lands on Home.
8. **Demo is separate.** Install a mock (PR) APK: it appears as "Craves Rider Demo" beside "Craves Rider", and the live
   app keeps its sign-in.

**Pass:** every step as written, and Settings → Apps → Craves Rider → Permissions lists no SMS permission.

## Results

### Service survival

| Phone (model, RAM, Android, skin) | Mode (wake lock / location batches) | Date | Tester | Longest silence (s) | Gaps over 60 s | Last exit reason | Battery %/h | Survived swipe | Survived battery saver | Trip cancelled notice | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 GB phone | wake lock | | | | | | | | | | |
| 3 GB phone | wake lock | | | | | | | | | | |
| 4 GB phone | location batches | | | | | | | | | | |
| 3 GB phone | location batches | | | | | | | | | | |

### Offer to ring

| Phone (model, Android, skin) | Date | Tester | Offers | p50 (s) | p95 (s) | p99 (s) | First by fcm | First by locations | Missed | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| Xiaomi | | | 20 | | | | | | | |
| Oppo | | | 20 | | | | | | | |
| Vivo | | | 20 | | | | | | | |
| Realme | | | 20 | | | | | | | |
| Samsung | | | 20 | | | | | | | |

### Airplane-mode trip test

| Phone (model, RAM, Android) | Date | Tester | Run (force stop / reboot / photo) | Steps tapped offline | Reached the server in order within 60 s | Pass |
|---|---|---|---|---|---|---|
| 4 GB phone | | | force stop | | | |
| 4 GB phone | | | reboot | | | |
| 4 GB phone | | | photo | | | |
| 3 GB phone | | | force stop | | | |
| 3 GB phone | | | reboot | | | |
| 3 GB phone | | | photo | | | |
| 4 GB phone | | | native outbox: swiped away | | | |
| 4 GB phone | | | native outbox: reboot, app not opened | | | |
| 3 GB phone | | | native outbox: swiped away | | | |
| 3 GB phone | | | native outbox: reboot, app not opened | | | |

### Language review

| Language | Date | Native speaker | Build | Screens signed off | Notification lines signed off | Lawyer (terms words) | Pass |
|---|---|---|---|---|---|---|---|
| Telugu | | | | | | | |
| Hindi | | | | | | | |

### Privacy notice

| Phone (model, Android) | Date | Tester | Notice version | Steps 1–5 as written | Acceptances recorded | Pass |
|---|---|---|---|---|---|---|
| | | | | | | |

### Offer rules, breaks, distances and the data copy

| Phones (A, B) | Date | Tester | Policy version | Why lines (1) | Next round (2) | Break (3) | Distances (4) | Data copy (5) | Pass |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

### Sign-in code and the way back

| Phone (model, Android) | Date | Tester | Paste (1) | Allow (2) | Deny (3) | Resend (4) | No Play services (5) | Back (6) | Decision push (7) | Demo separate (8) | No SMS permission | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |

Keep each phone's logcat file and the query output with the results.
