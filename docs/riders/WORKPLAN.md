# Craves Rider: work plan by phase

27 Oct 2026 · for Gopi · goes with `docs/riders/BLUEPRINT.md` (the why). This file is the what: every task, who does it, what to change, and how to prove it. Task IDs match the blueprint. Finding IDs (A1–A9) and decisions (E1–E8) refer to the blueprint.

## How to use this

- **Agent tasks** are one PR each. Hand them to an agent one at a time, in the order of the "Order" list for the phase. Paste the task block as the prompt, plus: "Read `docs/riders/BLUEPRINT.md` and `AGENTS.md` first."
- **People tasks** (marked **Person**) are deploys, phone tests and console switches. Agents never deploy.
- A task marked **Blocked by Ex** waits for Gopi's decision Ex in the blueprint.

**Rules for every PR**
1. Branch from `main`. One task per PR. Title `rider(P1-03): …`. Say which finding it fixes.
2. Flyway migrations are additive and take the next free number when merged (V161 onward). Never edit an applied one (`AGENTS.md`).
3. A new controller goes into `services/integration-service/src/main/resources/live-runtime-lock.txt` (`AGENTS.md`).
4. A contract change updates, in the same PR:
   - `contracts/openapi/rider-v1.yaml`;
   - `apps/mobile/src/features/rider/api/contract.ts`;
   - the mock API (`riderApi.mock.ts`), where the app would see a difference: a new optional request field the demo can ignore needs no mock change (Phase 1's `ageMs`, `fix` and `capturedOffline` are such fields).

   Every new field is optional. APKs already installed must keep working.
5. Update `docs/riders/BACKEND.md` or `docs/riders/NATIVE.md` in the same PR when behaviour changes.
6. Customer and chef apps don't change. Rider-only native code stays in `apps/mobile/android/app/src/rider`.
7. CI must pass: "Exact release launch regression" (Java with the database tests) and "Craves Rider APK".
8. Rider screens stay plain: no new countdowns or lateness warnings, and SOS stays in every trip header.
9. Once dispatch is live, any change to who gets offers or when a trip is taken away is an automated-system change. It needs 14 days' notice (*legal*).

## Decision gates

| Decision (blueprint E) | Blocks | Default if Gopi agrees |
|---|---|---|
| E1 OTP kept encrypted on the phone | P1-05 | encrypted until the server answers, at most 24 h |
| E2 Watchdog windows | P1-02 | ASSIGNED 90 s; kitchen alert 90 s, hand back 300 s |
| E3 Pool size | P1-16 | 8 connections, 1 replica |
| E5 Door wait timer | P1-17 | "You can leave at 12:42", no bar |
| E6 Retention periods | P1-14, P2-09 | positions until shift end; track, photos, health 90 days; selfies 30 days |
| E8 Distribution | P2-07 | Play internal testing |

---

## Phase 1: pilot-ready reliability

**Goal:**
- no trip action is lost;
- an order is never taken from a rider who holds the food;
- the reliability numbers can be measured;
- the pilot zone goes live.

**Entry:** true today (27 Oct). Services are deployed, dispatch is off, a live APK is built from `main`, and CI is green.

**Order:**
1. **Server first.** These are safe with today's APK: P1-01 → P1-02 → P1-14 → P1-16 → P1-09 → P1-03 → P1-04 → P1-10 → P1-11 → P1-13.
2. **Then the app:** P1-06 → P1-08 → P1-05 → P1-07 → P1-12 → P1-17 → P1-18. The app parts of P1-03, P1-04, P1-09, P1-10 and P1-13 ship inside their own PRs.
3. **Then:** P1-15, and the people steps S1–S6.

### P1-01 Heartbeat: count calls, not fixes
**Why:** A1, A6. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. Add migration `V161__fleet_shift_heartbeat.sql`. It adds to `fleet_schema.rider_shift`:
   - `last_seen_at timestamptz`;
   - `max_silence_seconds integer NOT NULL DEFAULT 0`;
   - `silences_over_60s integer NOT NULL DEFAULT 0`.
2. In `FleetLocationService.ingest`, run the shift-row update on every call. Today it runs only when there are in-zone seconds to add. The update:
   - sets `last_seen_at = now()`;
   - raises `max_silence_seconds` to the gap since `COALESCE(last_seen_at, started_at)`;
   - adds 1 to `silences_over_60s` when that gap is over 60 s;
   - keeps the in-zone addition and the slot CTE.

   A call must still run at most 5 statements.
3. A rider is eligible when `last_seen_at` is within 45 s **and** the latest non-mock fix is under 3 minutes old. Apply this in both places:
   - `FleetDispatcher.nearbyRiders`;
   - ops reassign-to-rider (`FleetOpsService.java:248-255`).
4. Docs:
   - `BACKEND.md`: update "Location ingest" and the eligibility lines.
   - `PHONE-TESTS.md` step 5: read `rider_shift.last_seen_at`. The column `updated_at` doesn't exist.

**Prove it:**
- `FleetLocationApiDatabaseTest`:
  - an empty batch sets `last_seen_at`;
  - a 70 s gap adds 1 to `silences_over_60s`;
  - `twoHundredCallsStayWithinFiveStatementsEach` still passes.
- `FleetDispatchDatabaseTest`:
  - a fresh heartbeat with a 2-minute-old fix gets an offer;
  - a heartbeat 46 s old does not.

### P1-02 The watchdog never takes food from a working rider
**Why:** A1. **Who:** agent. **Blocked by:** E2, P1-01.

**Do:**
1. In `FleetDispatchJobs`, a rider is "silent" when the newest `rider_shift.last_seen_at` for the trip's rider is older than the window. It no longer uses `rider_position_latest.received_at`.
2. ASSIGNED: hand back after 90 s silent (today's `handBack`, unchanged).
3. AT_PICKUP:
   - at 90 s silent, send one ops alert `FLEET_RIDER_SILENT_AT_KITCHEN` and record a `WATCHDOG_ALERTED` trip event, so it's sent once;
   - hand back only at 300 s silent.
4. Update the class comment and `BACKEND.md` "Dispatch chain" step 5.

**Prove it:** `FleetDispatchJobsDatabaseTest`:
- ASSIGNED silent for 91 s is handed back;
- AT_PICKUP silent for 120 s sends the alert once and keeps the trip;
- AT_PICKUP silent for 301 s is handed back;
- a fresh heartbeat with no new fix for 5 minutes is never handed back.

### P1-03 Fix times that don't trust the phone clock
**Why:** A6. **Who:** agent (server, contract and Kotlin in one PR). **Blocked by:** nothing.

**Do:**
1. **Contract.** `RiderFix.ageMs`, an optional integer from 0 to 3,600,000. Add it in `rider-v1.yaml` and `contract.ts`.
2. **Server.**
   - `FleetRiderModels.RiderFix` gets `Long ageMs`.
   - In `FleetLocationService.ingest`, a fix's time is `shift.now() − min(ageMs, 3,600,000 ms)` when `ageMs` is present, else `at` as today. Then apply the existing `usable` and "newer than stored" filters.
3. **Kotlin.**
   - `RiderOnlineService.Fix` keeps `elapsedMs = location.elapsedRealtimeNanos / 1_000_000`.
   - `toJson()` adds `ageMs = SystemClock.elapsedRealtime() − elapsedMs`, worked out at send time.
4. **Docs.** `NATIVE.md` "Location upload" and `BACKEND.md` "Location ingest". Delete the "riders should keep automatic time on" caveat.

**Prove it:**
- `FleetLocationApiDatabaseTest`: a fix stamped 10 minutes in the future with `ageMs: 2000` is stored at about the database time minus 2 s. The same fix without `ageMs` is still dropped.
- The CI APK build compiles.

### P1-04 Steps record when and where the rider tapped
**Why:** A2 (`WAIT_NOT_OVER`), A4. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. **Contract.** Every trip step accepts optional `ageMs` and `fix` (RiderFix). The photo multipart accepts `ageMs`, and its `fix` field is now read.
2. **Server.**
   - `FleetTripController.StepBody` gets `Long ageMs` and `FleetRiderModels.RiderFix fix`. `deliveredByPhoto` reads `@RequestParam ageMs` and `@RequestParam fix` (JSON).
   - `FleetTripService` works out one time per step: `occurred = max(previous step time, now − min(ageMs, 30 min))`.
     - The previous step time is the latest of `accepted_at`, `arrived_kitchen_at`, `picked_up_at` and `arrived_drop_at`. Read these, and `drop_lat` and `drop_lng`, in `lock()`.
     - Without `ageMs`, `occurred = now`.
   - `step()` writes `occurred` into `arrived_kitchen_at`, `picked_up_at` and `arrived_drop_at` instead of `now()`.
   - An earlier `occurred` only counts when the step's own fix supports it:
     - `arrived-pickup`: the fix is non-mock, accurate to 100 m or better, and within 300 m of the kitchen;
     - `arrived-drop`: the fix is within 250 m of the drop.

     Otherwise use `now`. Earlier times would raise waiting pay or shorten the door wait, so they need evidence.
   - The kitchen-zone check uses the step's own fix when it was taken within 2 minutes of `occurred`; otherwise it keeps today's rule.
   - `requireUnreachableWaitOver` compares against `occurred`, not `now()`, for both the photo delivery and `failed` CUSTOMER_UNREACHABLE.
   - Store `ageMs` and the fix's lat, lng and mock on the step's `trip_event` row. Those columns already exist.
3. **App.**
   - `TripScreen.run` saves `occurredAt: Date.now()` and `fix: riderOnlineService.lastFix()` on the queue entry.
   - `riderApi.live.tripAction` sends `ageMs = Date.now() − occurredAt` and the fix: in the JSON body for every step, and as form fields for the photo.

**Prove it:** `FleetTripStepsDatabaseTest`:
- "arrived at drop" sent with `ageMs` of 9 minutes and a fix at the door, then a photo with 2 calls, is DELIVERED, not `WAIT_NOT_OVER`;
- an `ageMs` of 2 hours is clamped;
- a mock fix leaves `occurred = now`;
- `arrived-pickup` with an in-zone fix sets `arrived_kitchen_at` to `occurred`.

Also `riderApi.live.test.ts`: every step carries `ageMs` and `fix`.

### P1-05 The delivery OTP survives a restart
**Why:** A2. **Who:** agent. **Blocked by:** E1.

**Do:**
1. **Queue storage.**
   - `offlineQueue.ts` replaces `memoryOnly` with a `secret` store: `save(id, value)`, `load(id)`, `remove(id)`.
   - An OTP entry is saved to AsyncStorage as `{method: 'OTP', otpRef: <entry id>, fix}`, and the 4 digits go to the secret store.
   - Sending reads the digits back. They are removed once the entry is sent or refused. On load, purge any digits older than 24 h.
2. **Secure store.** `tripQueue.ts` implements `secret` with `expo-secure-store`, the way `core/security/refreshTokenStore.ts` does, under the key `rider.otp.<entry id>`.
3. **Trip end screen.** While an OTP delivery is unsent, `TripEnd.tsx` shows "Delivery saved" with "We'll check the code when you're back online. You can go." instead of "Trip complete". Add the strings to `strings/en.ts`.
4. **A code entered offline that the server later rejects.**
   - The app sends `capturedOffline: true` with an OTP queued while offline.
   - On `OTP_INVALID`, the app keeps a "needs attention" notice on Home: "Order code didn't match. Call support." with the call button.
   - The server, in `FleetTripService.deliveredByOtp`, sends the ops alert `FLEET_OFFLINE_OTP_INVALID` once per trip, because ops checks these (E4).

**Prove it:**
- `offlineQueue.test.ts`: an OTP entry survives a new queue instance; AsyncStorage never holds the digits; the secret is removed after the send.
- `trip.test.tsx`: an offline OTP shows "Delivery saved".
- `FleetTripStepsDatabaseTest`: a wrong code with `capturedOffline` sends one alert.

### P1-06 The trip screen shows the step from the queue
**Why:** A3. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. Add `apps/mobile/src/features/rider/domain/tripSteps.ts` with a pure `displayedStep(serverStep, pendingEntries)`. It applies the pending steps in order:

   | Step | From | To |
   |---|---|---|
   | arrived-pickup | TO_KITCHEN | AT_KITCHEN |
   | picked-up | AT_KITCHEN | PICKED_UP |
   | arrived-drop | PICKED_UP | AT_DROP |
   | delivered | AT_DROP | DELIVERED |
   | failed | any | FAILED |
   | food-not-ready | — | unchanged |

   An ended server step always wins.
2. `tripQueue.ts`: `usePendingActions` becomes `usePendingEntries(riderId, tripId)`, which returns the entries.
3. `TripScreen.tsx`: delete the `localStep` state and use `displayedStep(trip.step, entries)`.

**Prove it:**
- `tripSteps.test.ts` covers the table.
- `trip.test.tsx`: a fresh render with a pending "Picked up" opens on the to-customer step.

### P1-07 The delivery photo is kept until the server has it
**Why:** A2, A9. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. **Kotlin.** `RiderDeviceModule` gets two methods:
   - `keepPhoto(uri)`:
     - applies the EXIF rotation using the platform `android.media.ExifInterface`;
     - scales the long edge to at most 1600 px (`BitmapFactory` with `inSampleSize`);
     - writes a JPEG at quality 80 to `filesDir/rider-photos/<uuid>.jpg`;
     - returns its `file://` URI.
   - `deletePhoto(uri)`.

   No new dependency.
2. **JS.**
   - `riderDevice.ts` exposes both methods; in mock mode `keepPhoto` returns the same URI.
   - `NotAnswering.tsx` calls `keepPhoto` before queuing.
   - The queue deletes the file once the entry is sent or refused.
   - If the kept file is missing, `riderApi.live.ts` marks the entry "needs attention: take the photo again". It never sends a delivery without the photo.
3. **Server.** In `FleetTripService.deliveredByPhoto`, run `photoBytes()` after the replay and DELIVERED checks. A retry for a trip that is already delivered then gets the trip back, not 422.

**Prove it:**
- `riderApi.live.test.ts`: a missing file sends no request and the entry needs attention.
- `FleetTripStepsDatabaseTest`: a photo retry with no file, for a delivered trip, returns 200 and the trip.
- The CI APK build compiles.

### P1-08 Send queued steps when the signal returns; show refusals
**Why:** A2, A3. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. **Flush on signal.** In `RiderRuntime.tsx`, every `riderStatus` ONLINE event (an upload that worked) calls `tripQueue.flush(riderId, {now: true})`, at most once every 5 s. In `offlineQueue.ts`, `flush(..., {now: true})` sends entries even when their backoff hasn't run out.
2. **Refusals.** Keep the last refusal per trip in AsyncStorage (`rider.queue.refusals.v1`). `TripEnd.tsx` and `HomeScreen.tsx` show it as a Banner with the server's message and "Call support" until the rider dismisses it. It replaces the passing `Alert`.

**Prove it:**
- `RiderRuntime.test.tsx`: an ONLINE event sends an entry that is still in backoff.
- `offlineQueue.test.ts`: the refusal record is stored, then cleared on dismiss.
- **Limit:** this works while the app's screen exists. A swiped-away app waits for Phase 2 (P2-02).

### P1-09 Offer receipts and push results
**Why:** A5. **Who:** agent. **Blocked by:** P1-01 (shares the shift-row statement).

**Do:**
1. **Migration** `V162__fleet_offer_receipts.sql`. It adds to `trip_offer`:
   - `pushed_at timestamptz`;
   - `push_result varchar(40)`;
   - `rang_at timestamptz`;
   - `rang_channel varchar(10)`, checked to be `fcm` or `locations`.
2. **Server: push results.** In `FleetDispatcher.ring()`, after the push, set `pushed_at = now()` and `push_result` (`NO_TOKEN` when the rider has no token).
3. **Server: receipts.** `FleetLocationService.ingest` accepts `offerReceipts` (at most 10). For this rider's offers whose `rang_at` is still empty, it sets `rang_at = now() − ageMs` and `rang_channel`. Do this as a data-modifying CTE in the shift-row statement, so a call stays within 5 statements.
4. **Kotlin.**
   - `RiderOffers.receive` remembers each first arrival as offer ID, channel and `elapsedRealtime`, keeping at most 10.
   - `RiderOnlineService.tick` sends them as `offerReceipts` with `ageMs`, and clears them after a 2xx.
5. **Contract.** `OfferReceipt`, and `offerReceipts` on the `/locations` body.

**Prove it:**
- `FleetLocationApiDatabaseTest`:
  - a receipt is stored once, and a second receipt for the same offer is ignored;
  - a receipt for another rider's offer is ignored;
  - a call still runs at most 5 statements.
- `FleetDispatchDatabaseTest`: the push result is stored.

### P1-10 Phone health and why the app died
**Why:** A5. **Who:** agent. **Blocked by:** P1-01.

**Do:**
1. **Migration** `V163__fleet_shift_health.sql`. It adds to `rider_shift`:
   - `health jsonb`;
   - `can_ring boolean`.
2. **Kotlin.** Once a minute, `RiderOnlineService` adds `health` to the upload:
   - `batteryPct`, `charging` and `powerSave`;
   - `canRing`: app notifications are enabled **and** the `rider_offers` channel importance is still HIGH;
   - `drainPct` and `unpluggedMin` since the shift started, counted only while not charging;
   - `lastExitReason`, sent once after each start. It comes from `ActivityManager.getHistoricalProcessExitReasons` (Android 11 and later).
   - `queuePending` and `queueOldestAgeS`, which JS sends through a new `RiderOnlineModule.setQueueStats(pending, oldestAgeS)`.
3. **Server.**
   - Store `health` (latest wins) and `can_ring` in the shift-row statement.
   - Log `FLEET_APP_EXIT rider=… reason=…` whenever `lastExitReason` is present.
4. **Contract.** `DeviceHealth`.

**Prove it:** `FleetLocationApiDatabaseTest`: health is stored; a payload without health changes nothing.

### P1-11 A phone that can't ring gets no offers
**Why:** A9. **Who:** agent. **Blocked by:** P1-10.

**Do:**
1. **Server.** `FleetDispatcher.nearbyRiders` and ops reassign-to-rider skip riders whose open shift has `can_ring = false`.
2. **Kotlin.** While `canRing` is false, every tick reports status ERROR with "Turn on notifications to get orders". Home already shows status messages.

**Prove it:** `FleetDispatchDatabaseTest`: a rider with `can_ring = false` gets no offer; the rider is eligible again once it is true.

### P1-12 Tell the rider when a trip is cancelled
**Why:** A7. **Who:** agent. **Blocked by:** nothing.

**Do:**
1. `RiderOffers.createChannels` adds the channel `rider_trip`, at default importance.
2. In `RiderOnlineService.handle`, when the active trip changes to CANCELLED:
   - post "Trip cancelled" with "Open Craves Rider to see what's next";
   - tapping it opens the app.
3. Strings are English for now, with the existing `shortcut:` note.

**Prove it:**
- The CI APK build.
- The phone-test step added in P1-15: ops cancels a trip with the screen off, and the notification appears within 15 s.

### P1-13 "Tap to go online", and token refresh from Kotlin
**Why:** A7, A9. **Who:** agent. **Blocked by:** P1-01, P1-18 (needs the version number).

**Do:**
1. **Migration** `V164__fleet_shift_nudge.sql` adds `rider_shift.last_nudge_at timestamptz`.
2. **Server.** In `FleetDispatchJobs.tick`, add `nudgeSilentShifts()`. Don't add a new scheduled job: the fleet pool has one thread per job, which `FleetConfigurationTest` checks.
   - **Who gets a nudge:** open shifts whose `last_seen_at` is over 3 minutes old and whose `last_nudge_at` is empty or over 30 minutes old. The phone must be BOUND, have a token, and run app version ≥ 1.1.0.
   - For the version check, make `FleetShiftService.versionBelow` public, or move it to `FleetRules`.
   - **Limit:** 20 nudges per tick.
   - **Sending:** `RiderPushClient.goOnline(token)` posts to `/internal/v1/push/realtime` with:
     - data `type=GO_ONLINE`;
     - title "You're offline";
     - body "Tap to go back online and get orders.";
     - TTL 600 s and collapse key `go-online`.

     notification-service needs no change.
   - Set `last_nudge_at` after sending.
3. **Kotlin: GO_ONLINE.** `RiderMessagingService` handles `type=GO_ONLINE` by posting on `rider_trip`. The tap opens the app, and Home resumes the saved shift (`HomeScreen.tsx:127-131`).
4. **Kotlin: token refresh.**
   - In `onNewToken`, if `RiderOnlineService.loadShift(this)` returns a shift, post `/api/v1/rider/devices` with the shift credential, on a background thread.
   - Send `installationId` = ANDROID_ID, `fcmToken`, `appVersion = BuildConfig.VERSION_NAME` and `model = Build.MODEL`.

**Prove it:**
- `FleetDispatchJobsDatabaseTest`:
  - one nudge per 30 minutes;
  - none for ended shifts, unbound phones or app 1.0.0.
- `FleetClientsTest`: the GO_ONLINE request body.

### P1-14 Location retention and what ops can see
**Why:** A8. **Who:** agent. **Blocked by:** E6.

**Do:**
1. **Forget off-shift positions.** In `FleetDispatchJobs.tick`, `forgetOffShiftPositions()` deletes a `rider_position_latest` row when all of these hold:
   - the rider has no open, unexpired shift;
   - the rider has no active trip;
   - the row is more than 15 minutes old.
2. **Drop old tracks.** `FleetLocationService.createTrackDays` also:
   - drops `trip_track_YYYYMMDD` partitions older than 90 days;
   - deletes rows older than 90 days from `trip_track_default`.

   A failure logs `CRAVES_ALERT`.
3. **Ops view.** `FleetOpsService.positions` lists only riders with an open shift or an active trip.
4. **Docs.** `BACKEND.md` gets a "Data retention" section with every period. The rider privacy notice text is the lawyer's.

**Prove it:**
- `FleetOpsDatabaseTest`: an off-shift rider isn't listed.
- `FleetDispatchJobsDatabaseTest`: an off-shift position is gone after 15 minutes, but is kept while a trip is active.
- A database test: a 91-day-old partition is dropped.

### P1-15 Pilot-health queries and updated test plans
**Why:** A5. **Who:** agent. **Blocked by:** P1-01, P1-09, P1-10.

**Do:**
1. **New `scripts/riders/pilot_health.sql`** (since P3-04 `services/integration-service/src/main/resources/fleet/pilot_health.sql`, so the server can run it), with one named query each for:
   - offer-to-ring p50, p95 and p99 by channel and phone model (last 7 days);
   - which channel arrived first;
   - push results;
   - per-shift survival: hours, longest silence, silences over 60 s, last exit reason;
   - sync delay (`ageMs` on step events) by step;
   - battery per online hour (`drainPct / unpluggedMin`);
   - fleet-stage outcomes per day.
2. **New `docs/riders/PILOT-HEALTH.md`:** how to run the queries read-only, what each number means, the targets, and the stop rules from S6.
3. **`PHONE-TESTS.md`.**
   - Use the queries instead of a stopwatch for offer-to-ring.
   - Run survival on a 4 GB and a 3 GB phone.
   - Record battery per hour.
   - Add the cancel-notification step (P1-12).
   - Add "3. Airplane-mode trip test":
     1. accept, then turn airplane mode on;
     2. tap arrived, picked up and arrived at drop, and enter the OTP;
     3. force stop the app in Settings and reopen it offline (it opens from what it saved, P2-12);
     4. turn airplane mode off. Every step should reach the server in order within 60 s.

     Repeat with a reboot instead of the force stop, and once with the photo route.
4. **`PERF.md`.** Add "Each screen renders ≤ 100 ms": a Perfetto trace from the tap's input event to the first frame of the next screen, over 10 navigations.

**Prove it:** a new `FleetPilotHealthDatabaseTest` runs every query in the file on fixtures, and checks the offer-to-ring p95 on 20 seeded offers.

### P1-16 Database pool: 8 connections, 1 replica
**Why:** BUILD decision 1. **Who:** agent, then a person. **Blocked by:** E3.

**Do:**
1. **Agent.**
   - `services/integration-service/src/main/resources/application.yml`: change the pool default from 4 to 8.
   - `infra/main.bicep` and `infra/prodlow-rebuild/main.bicep`: set integration-service `maxReplicas` to 1.
   - Update `BACKEND.md` "Database connections" and tick `GO-LIVE.md` step 0.
2. **Person.** On `ca-craves-integration-service-pr`, set the live `SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE=8` if it is set, and max replicas to 1 (`az containerapp update`).

**Prove it:** `python3 scripts/release/check-db-connection-budget.py` passes. The total stays 43 of 45, because 8 × 1 equals 4 × 2.

### P1-17 Door wait shows a time, not a countdown
**Why:** A9 (rule 7). **Who:** agent. **Blocked by:** E5.

**Do:** In `NotAnswering.tsx`, replace the `CountdownBar` (line 123) with "You can leave at 12:42": the arrival time plus `unreachableWaitSeconds`. Keep the unlock logic. Add the strings to `strings/en.ts`.

**Prove it:** `trip.test.tsx` shows the time text and no countdown bar.

### P1-18 Release 1.1.0
**Why:** P1-13 and `minAppVersion` need a version number to compare. **Who:** agent. **Blocked by:** nothing. Merge it last among the app PRs.

**Do:**
1. Set the rider `versionName` to `1.1.0` in `apps/mobile/android/app/build.gradle`, and `RIDER_APP_VERSION = '1.1.0'` in `riderConfig.ts`. They must match: `riderConfig.ts:11` says keep them in step.
2. Add a step to `.github/workflows/rider-apk.yml` that fails when the two differ.
3. Add a note to `RELEASE.md`.

**Prove it:** the APK workflow passes, and its version check fails on a deliberately mismatched build.

### People steps for Phase 1

**S1. Pick how integration-service is released (Gopi, once).** The runbook's pipeline table (`docs/runbooks/production-environment.md`) has no integration-service pipeline, and `AGENTS.md` says to release only through that table. Choose one:
- **Recommended:** create the pipeline from `azure-pipelines-integration-service.yml` on GitHub `main`, as the runbook allows, and add it to the table.
- Or use the Cloud Shell route from the project doc `rider-app/DEPLOY-NOW-2026-10-24.md` §1.

**S2. Deploy the server PRs.**
1. Deploy integration-service from `main` once P1-01 to P1-16's server parts have merged (delivered as one patch, that is its merge). V161 to V169 apply on start, and nothing changes for riders until the new APK: every setting added since is off (`GO-LIVE.md` §8).
2. Check:
   - `/api/v1/rider/locations` answers 401 when signed out;
   - the console's rider pages load;
   - `rider_shift.last_seen_at` fills while a test rider is online.

**S3. Build and pin the APK.**
1. Run "Craves Rider APK" on `main` (live mode) and install 1.1.0 on the test phones.
2. Pin the minimum version: `python3 scripts/riders/rider_pilot_runtime.py --stage wire --min-app-version 1.1.0 … --apply --expected-source-sha <sha>`. Riders on 1.0.0 are blocked only between shifts.

**S4. Phone passes.** Record every result in the tables and commit them in a docs PR. Run these on one 4 GB and one 3 GB phone, and the offer test on all five brands:
- `PHONE-TESTS.md`:
  - §1 survival: 4 hours, no silence over 60 s;
  - §2 offer-to-ring: 20 offers per phone, read from the receipts query;
  - §3 airplane-mode trip test: zero lost steps.
- `PERF.md`: every check.

**S5. Shadow for one day.**
1. In the console, open Rider pilot setup → Dispatch and choose **shadow**.
2. With real orders, read the `FLEET_SHADOW` lines and the fleet-stage query.
3. **Pass:** at least 20 orders logged, and every skipped order has a reason you accept.

**S6. Live in one zone.**
1. Rider pilot setup → Dispatch → **live**.
2. For the first week, run `pilot_health.sql` every day.
3. Press **Stop dispatch now** if any of these happens:
   - a trip step is lost;
   - an order gets two couriers;
   - offer-to-ring p95 is over 8 s for a day.

### Phase 1 done when

| Measure | Target | How it's measured |
|---|---|---|
| Cold start to Home | ≤ 2 s, release build, 4 GB phone | `PERF.md` §1 |
| Each screen renders | ≤ 100 ms, mid-range phone | `PERF.md` (P1-15) |
| Offer shows on screen | ≤ 300 ms after arrival | `PERF.md` §2 |
| Offer-to-ring | p95 ≤ 5 s, p99 ≤ 12 s, over 100+ offers | receipts query |
| Service, screen off | 4 h on both phones, no silence over 60 s | survival query |
| Earnings, 200 rows | < 5% janky frames | `PERF.md` §3 |
| Airplane-mode trip test | zero lost steps, including a kill and a reboot | `PHONE-TESTS.md` §3 |
| CI | green on every PR | regression workflow |
| Pilot | one zone live for a week with no stop rule hit | S6 |

---

## Phase 2: 50 to 200 riders

**Goal:**
- steps survive even an app that has been swiped away or killed;
- location storage and retention are settled;
- the ops tools are complete;
- the app is on Play with Telugu and Hindi.

**Entry:** Phase 1 done, and two weeks live in one zone with receipts.

**Order:** P2-01 → P2-02a → P2-02b → P2-02c, then any order for P2-03 to P2-11.

### P2-01 Let the shift credential send trip steps
**Why:** the native outbox (P2-02) runs without the JS sign-in token. **Who:** agent, then a person. **Blocked by:** a security review.

**Do:**
1. **Spring.** Accept `X-Craves-Shift-Credential` on `POST /api/v1/rider/trips/{tripId}/{action}`, but only for the credential's own rider and only that rider's active trip. `FleetTripController` resolves the rider from the credential when there is no JWT.
2. **Security test.** Update `FleetShiftCredentialSecurityTest`'s allow-list to three routes.
3. **APIM.** Add a policy kind `trip`: Bearer or credential, multipart up to 10 MB.
   - Use it for `rider-post-trips-tripId-action` in `infra/apim/rider-fleet/routes.txt`.
   - Add `trip-policy.xml`.
   - Update `scripts/apim/tests/test_rider_fleet_apim.py`.
4. **Contract.** Add the credential to that operation's security in `rider-v1.yaml`.
5. **Person.** After the merge, run `scripts/apim/configure-rider-fleet-apim.sh` with `CONFIRM_APIM_WRITE=true`, then the status script.

**Prove it:** the security test, the APIM tests, and a database test showing a credential can't move another rider's trip.

**Done (agent part), behind `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED`, off:** `FleetTripController` takes the credential on both step handlers (JSON and the photo) only while the setting is on, through `FleetShiftService.tripIdentity`: the rider of a live shift who isn't deactivated, and only their trip in progress or one that ended during this shift (so a retried step gets its first answer); anything else is 404 `TRIP_NOT_FOUND`, an ended shift 401. `WebSecurityConfiguration` opens `POST /trips/*/*` without a JWT only while it is on; without the credential the controller still requires a RIDER JWT. Gateway: the `trip` policy (`trip-policy.xml`) for `rider-post-trips-tripId-action`; the configure and status scripts accept the credential on it. Contract: the operation's security lists the credential. Proved by `FleetTripCredentialDatabaseTest`, `FleetTripCredentialControllerTest`, `FleetTripCredentialSecurityTest` (the walk with the setting on: only `/locations`, `/devices` and the trip steps answer), `FleetShiftCredentialSecurityTest` (setting off: still only two), and `test_rider_fleet_apim.py`. **Still open (people):** the security review; then, after the merge, run `scripts/apim/configure-rider-fleet-apim.sh` with `CONFIRM_APIM_WRITE=true` (or the configure pipeline) and the status script; switch the setting on only when an app with the native outbox (P2-02) ships.

### P2-02a Native outbox in the Kotlin service
**Who:** agent. **Blocked by:** P2-01.

**Do:**
1. Add `RiderOutbox.kt` in `android/app/src/rider/java/com/cravesapp/`. It writes `filesDir/rider/outbox.json` with the platform `AtomicFile`, using the schema in blueprint C2. Only the service thread writes.
2. **What it sends.**
   - It sends in order per trip, with the shift credential and the existing idempotency keys.
   - **When:** after every successful `/locations`, and on `ConnectivityManager.NetworkCallback.onAvailable`.
   - **Backoff:** 2 s, doubling up to 60 s.
3. **What it stores.**
   - The OTP is sealed with an Android Keystore AES-GCM key.
   - Photos stay in `filesDir/rider-photos`.
4. **Module and event.**
   - `RiderOnlineModule.enqueue(json)` resolves only after the entry is on disk.
   - `pending(tripId)` returns the queued entries.
   - The event `riderOutboxChanged` tells JS when the queue changes.

**Prove it:** the CI APK build, plus PHONE-TESTS §3 with the app swiped away: every step arrives.

**Done (agent part):** `RiderOutbox.kt` keeps `filesDir/rider/outbox.json` through `AtomicFile` (blueprint C2's schema in the JS queue's field names, plus `elapsedMs`, `boot` and `otpSealed`), seals the OTP with a Keystore AES-GCM key (24 h, E1), leaves photos in `rider-photos` until answered, and sends in order per trip with each step's key, exactly as `liveRiderApi.tripAction` does: with the app's token while JS runs, else the shift credential, after every successful `/locations`, on `NetworkCallback.onAvailable` (default network, while the service runs) and from the job; backoff 2 s doubling to 60 s. The rules (`RiderOutboxCore.kt`: verdicts, backoff, the tap's age, one pass in order per trip) are pure Kotlin and proved by `RiderOutboxCoreTest` (`./gradlew testRiderReleaseUnitTest`, run by the APK workflow). Module: `outboxEnqueue` (saved, then a pass, in one go, so no other pass sends the step between), `outboxFlush`, `outboxState` (the plan's `pending`, from memory), `outboxDefer`, `outboxImport`, `outboxDismissRefusal`; event `riderOutboxChanged` for passes native ran itself. The health report adds the outbox to `queuePending`. Server gate: `GET /me` `features.nativeTripOutbox` mirrors `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED`. **Still open (people):** PHONE-TESTS §3's native-outbox runs (swiped away; reboot, app not opened).

### P2-02b The app uses the native outbox
**Who:** agent. **Blocked by:** P2-02a.

**Do:**
1. In live builds, `tripQueue.ts` uses the native module behind the same `TripActions` interface. Mock builds keep the JS queue.
2. On first start, move the existing `rider.queue.v2` entries, and their secure-store OTPs, into native, then delete them.

**Prove it:** Jest with a fake native module (move, then send), and the airplane test.

**Done (agent part):** live builds go native once `GET /me` says `features.nativeTripOutbox` (`RiderRuntime` calls `tripQueue.setNativeOutbox`); mock builds and older servers keep the JS queue. `tripQueue` is now a facade over both queues with the same interface: a trip's steps stay in the queue that holds them, so their order never splits, and steps left in the outbox after the switch goes off still go, with the app's token. The move (`offlineQueue.moveAll`) hands over every rider's entries with each OTP back from the secure store, and their refusals, then empties the JS queue (the key is `rider.queue.v1`, not the plan's v2); a failed move keeps everything in JS. Refusals read the same in both queues (`appApiErrorFromStatus`, `lockedAtZero`). Proved by `nativeTripQueue.test.ts`, `tripQueue.native.test.ts` (move, then send), `offlineQueue.test.ts` and `RiderRuntime.test.tsx`. **Still open (people):** the airplane test (PHONE-TESTS §3) with the setting on.

### P2-02c Send after a kill or a reboot
**Who:** agent. **Blocked by:** P2-02a.

**Do:**
1. Add a persisted `JobScheduler` job with a network constraint. It flushes the outbox when the service isn't running.
2. Add `RECEIVE_BOOT_COMPLETED` to the rider manifest only.
3. On Android 14+, upload photos with a user-initiated data-transfer job (`RUN_USER_INITIATED_JOBS`). Schedule it while the photo screen is open.

**Prove it:** PHONE-TESTS §3 with a force stop, then a reboot. Steps arrive after the reboot without the app being opened, on phones whose OEM allows jobs. Record any that don't.

**Done (agent part), steps 1 and 2:** `RiderOutboxJob` is persisted, needs any network, backs off from 30 s and is scheduled whenever a step waits; it sends with the shift credential, so it works after a reboot while the shift lasts. `RECEIVE_BOOT_COMPLETED` and `ACCESS_NETWORK_STATE` are in the rider manifest only (the APK workflow now also keeps `RECEIVE_BOOT_COMPLETED` out of `src/main`). A force stop cancels the job (Android): steps then go when the app opens, so §3 run 6 records what a force stop does on each phone. **Not done, step 3:** the Android 14 user-initiated photo job; it must start while the app is visible, carries its own notification and adds a permission declaration, and the regular job, the service and the app already send photo steps. Add it only if §3 shows photo steps waiting after a kill on Android 14+.

### P2-03 Unsent fixes kept on disk
**Who:** agent.

**Do:**
1. Ship the server part first: accept up to 20 fixes per call (`MAX_FIXES`, the contract's `maxItems`), and raise the APIM location policy limit from 16 KB to 32 KB if the tests show it's needed.
2. In Kotlin, keep unsent fixes in `fixes.json`, thinned to one per 30 s with at most 120 kept. Drain 20 per call.

**Prove it:** `FleetLocationApiDatabaseTest` with 20 fixes, and an airplane test showing the trip track has no gap.

**Done (agent part):** the server takes 20 fixes a call (`MAX_FIXES`, the contract's `maxItems`) and says so in every answer (`maxFixes`), so a new app never sends an old server more than 5; 20 fixes are about 4 KB, well inside the gateway's 16 KB, which stays. Kotlin keeps unsent fixes oldest first, the first 20 as they come, then one per 30 s, 120 at most, drops any over an hour old (the server's cap), sends `maxFixes` a call oldest first, and keeps them in `filesDir/rider/fixes.json` while some wait (this shift's only, gone once sent or when the shift ends). A fix kept across a reboot is aged by the wall clock. Proved by `FleetLocationIngestDatabaseTest` (20 kept fixes tracked in order, 21 refused), `FleetLocationApiDatabaseTest.twentyKeptFixesGoInOneCallWithinTheStatementBudget` and `RiderOutboxCoreTest` (an hour offline on a trip keeps 120, 30 s apart). **Still open (people):** the airplane test's track check (PHONE-TESTS §3).

### P2-04 Server-set idle polling
**Who:** agent. **Only if** receipts show FCM rings on time for fewer than 92% of 200+ offers on a phone brand (blueprint C1).

**Do:**
1. Add `dispatch_policy.idle_poll_seconds`, default 10, allowed 5–30.
2. `/locations` returns it as `nextPollSec`.
3. Kotlin uses it for the idle upload period.

**Prove it:** a database test, and receipts showing the p95 recovered.

**Done (agent part), as a setting rather than a `dispatch_policy` column:** the dispatch policy is versioned and published with 14 days' notice to riders, which a technical polling period shouldn't wait for. `CRAVES_FLEET_IDLE_POLL_SECONDS` (default 10, kept within 5 to 30) comes back on every `/locations` answer as `nextPollSec`, and the app uses it for the idle upload period, so phones follow a change within one call without a new app. Default 10 changes nothing; lowering it is still for when the receipts show the need. Proved by `FleetLocationIngestDatabaseTest`, `FleetLocationServiceTest` (the 5 to 30 clamp) and `RiderOutboxCoreTest`.

### P2-05 Chef handover stops the watchdog
**Who:** agent, with the order-service owner's agreement.

**Do:**
1. **order-service.** `markHandedOver` publishes a handover event on the existing delivery-event path.
2. **integration-service.**
   - Store the handover time on the trip (a migration).
   - The watchdog never hands back a trip after it.

**Prove it:** `FleetDispatchJobsDatabaseTest`: a handed-over AT_PICKUP trip that is silent for 10 minutes stays with the rider.

**Done (agent part):** order-service's `POST /chef/orders/{id}/handed-over` now goes through `ChefReadyForPickupService.markHandedOver`, which writes `ORDER_HANDED_OVER` (`{orderId, chefSubOrderId, handedOverAt}`, one per order by the outbox's event key) to the existing domain-event outbox, and only while `ORDER_HANDED_OVER` is in `CRAVES_DOMAIN_EVENT_ENABLED_TYPES`, so nothing waits unpublished (which would raise `OUTBOX_BLOCKED_EVENT_TYPE` alerts). integration-service reads it on the subscription it already has (`DeliveryServiceBusProcessors`) and stores `trip.chef_handed_over_at` (V168) on the order's trip before pickup; the watchdog never hands back such a trip (`FleetDispatchJobs.HANDS_BACK`), and its kitchen alert says the food is with the rider. Proved by `FleetDispatchJobsDatabaseTest.aTripTheChefHandedOverStaysWithItsSilentRider` and `ChefHandoverEventTest` (order-service; written only while enabled). **Still open (people), in this order:** (1) deploy integration-service from main with this change (until then an `ORDER_HANDED_OVER` reaching it would be read as a chef acceptance and dead-lettered); (2) deploy order-service from main with it; (3) check that the `integration-service-chef-accepted` subscription's rule lets `ORDER_HANDED_OVER` through (Azure portal or `az servicebus topic subscription rule list`), and add it if the rule lists event types; (4) add `ORDER_HANDED_OVER` to order-service's `CRAVES_DOMAIN_EVENT_ENABLED_TYPES`, keeping every type already there (unset means `CHEF_ACCEPTED_ORDER`). If dispatch is live by then, give riders 14 days' notice before (4) (rule 9). Also agree the change with the order-service owner, as planned.

### P2-06 Ops tools
**Who:** agent, one PR per tool. Each needs a console page in `apps/customer-web-next` and an admin endpoint.
- **(a)** Shift health on the rider page: last seen, silences, battery per hour, exit reason. **Done:** the rider page's shifts show when the phone last called (flagged after 180 s on an open shift), the longest silence and how many passed 60 s, and the phone's last report (battery, charging, battery saver, can ring, battery per unplugged hour, last exit reason, queued steps); a Recent offers table shows the last 20 offers with the push result and how soon, and by which channel, the phone rang (blueprint C6). Proved by `FleetRiderHealthDatabaseTest` and the console vitests (`riders.vitest.ts`, `rider-health.vitest.ts`).
- **(b)** Pay adjustments with a reason. **Done:** "Adjust a trip's pay" on the console's Rider payouts page (`POST /trips/{id}/pay-adjustments`, payments admins): one pay line of a credited trip, taken back or paid more, at most ₹10,000, never TDS, as the line's next revision with the reason the rider sees. Taken back is debt recovered from future pay at the weekly cap; paid more is pending 24 hours with TDS. The rider's recent offers and the support issue show the trip ID it asks for. Proved by `FleetEarningsDatabaseTest`, `FleetMoneyAdminSecurityTest`, `payout-contract.vitest.ts` and `payouts.vitest.ts`.
- **(c)** Acknowledge and resolve support issues. **Done:** the console's new Rider support page lists issues by state, flags those past acknowledge-by or fix-by, and acknowledges and fixes them with what was done (V167 keeps who did each and the resolution; audited); fixing releases pay the issue held. It also lists the last 7 days of SOS presses with a map link and marks a press whose alert email did not go (`alertedAt`). Proved by `FleetSupportDatabaseTest`, `FleetSupportControllerTest`, `support-contract.vitest.ts` and `support.vitest.ts`.
- **(d)** Cancel a payout file that hasn't been sent. **Done:** `POST /payout-batches/{id}/cancel` for a CREATED or APPROVED file, with a reason and the admin's check that it was not uploaded: a weekly file's payouts and recoveries go and the date can be made again; a daily file's withdrawals wait for the next one. Proved by `FleetPayoutsDatabaseTest`, `FleetMoneyAdminSecurityTest` and `payouts.vitest.ts`.
- **(e)** Record a bank reversal after a payout. **Done:** `POST /payout-batches/{id}/payouts/{payoutId}/reverse` on a PAID payout: FAILED with the bank's reason and the UTR kept, the money back in the balance, the account paused, and a full reversal of the paid journal. Proved by `FleetPayoutsDatabaseTest`, `FleetMoneyAdminSecurityTest` and `payouts.vitest.ts`.
- **BUILD decision 9, the slot part.** **Done:** cancelling a slot that has started ends it now instead, so it settles like any ended slot and the guarantee covers the time worked. Proved by `FleetSlotDatabaseTest`.
- **(f)** Give a held trip to another rider. **Done:** before pickup, behind `CRAVES_FLEET_RIDER_HANDOVER_ENABLED` (off; on once order-service from the same release is live and the contract migration has dropped the old one-trip-per-order constraint, in its own later PR, because older images need it). The first trip ends as a release and is replaced (V166); the order carries on in a new trip for the second rider, and the delivery job follows it with a Craves-rider-to-Craves-rider handoff that order-service now accepts. Proved by `FleetOpsDatabaseTest`, `FleetSchemaDatabaseTest`, and order-service's `DeliveryStatusHandoffTest` and `DeliveryStatusEventValidatorTest`.
- **(g)** The offline-OTP check queue (E4). **Done:** "Delivery codes to check" on the console's Trips page (`GET /code-checks`); ops records what the customer said (`POST /trips/{id}/code-check`): delivered with full pay, or failed with the pay held. Proved by `FleetOpsDatabaseTest`, `FleetOpsSecurityTest` and `trips.vitest.ts`.

**Prove it:** for each, an admin database test, `FleetAdminSecurityTest` roles, and a console vitest.

### P2-07 Play internal testing
**Who:** a person, plus an agent for the build changes. **Blocked by:** E8.

**Do:**
1. **Person.** In Play Console, create the app `com.cravesapp.rider` with Play App Signing. Fill in:
   - the Data safety form;
   - the foreground-service declaration, with a video of going online;
   - the privacy policy;
   - the content rating.

   Then publish to the internal track (`RELEASE.md`).
2. **Agent.** `rider-apk.yml` builds an AAB for Play.
3. **Forced updates.** Keep using `minAppVersion` plus a link to the Play listing; don't add an in-app update library.
4. **Play Integrity (optional).** It is logged only, and needs the new `com.google.android.play:integrity` dependency. State the case in the PR: it's a fraud signal for rooted or emulated phones, at the cost of a library and an API quota.

**Prove it:** pilot riders install from the internal track, and Play vitals show crash and ANR rates.

**Done (step 2):** a live manual run on `main` also builds the bundle, from the same Gradle call as the APK, and checks it is signed and ARM only. It is uploaded as the **craves-rider-aab** artifact with the mapping file (`RELEASE.md`, each pilot release). Steps 1 and 4 are open; step 3 needs nothing new. The first CI run proves the bundle step.

### P2-08 Telugu and Hindi
**Who:** agent, plus native speakers and the lawyer.

**Do:**
1. Fill `strings/te.ts` and `strings/hi.ts`. Both are copies of English today.
2. Move the Kotlin texts (`RiderOffers.kt:37-39`, the service messages) to `src/rider/res/values/strings.xml`, with `values-te` and `values-hi` translations.
3. A native speaker signs off each language. The lawyer signs off the terms text.

**Prove it:** a Jest check that every key exists in all three languages, and a screen pass in each language.

**Done (agent part), hidden until reviewed:**
- **Translations.** `te.ts` and `hi.ts` hold full Telugu and Hindi for every rider screen. They are plain and polite, with Western digits. Craves, OTP, UPI and the phone's own menu names stay in English, and the Hindi uses no first-person verb that needs the rider's gender.
- **Only reviewed languages reach riders.** A language reaches riders only once it is in `REVIEWED_LANGUAGES` (`strings/StringsProvider.tsx`, empty now). Until then, live builds show English and hide the language pickers (sign-up, Profile, Terms). A rider's earlier pick stays saved, and sign-up sends the language shown. Demo builds offer all three, for the review.
- **Native words.** The offer, trip-cancelled and offline notifications, their channel names, the "You're online" notice, the test ring and the service's messages are in `src/rider/res/values/strings.xml`, with `values-te` and `values-hi`. `RiderText.kt` reads them in the language JS passes (`setLanguage`), never the phone's own, so native follows the app.
- **Server words in Telugu or Hindi.** The phone writes the offer notification from the offer itself instead of the server's English, and a stop shows the phone's own "Your shift has ended". An offer from `/locations` now also rings with its pay and route, as an FCM one does, instead of "Tap to see the offer."
- **Proved by:**
  - `strings.test.ts`: the same keys, lists, parameters and printed arguments as English, and every text translated in its own script.
  - `StringsProvider.test.tsx`: a live build stays English and tells native.
  - screensA's chips test: a demo build turns Telugu.
  - `RiderTextTest`: the pay in a notification.
  - The Kotlin type check: every resource name exists.

**Not translated:**
- Words the server writes: rate-card lines, document names and reasons, notices ops writes, stop reasons.
- Dates and times (2 May, 12:42 pm).

**Still open (people):**
1. A native speaker of each language does PHONE-TESTS §4; an agent makes the corrections.
2. The lawyer signs off the terms, appeal and notice words.
3. In a release, add the language to `REVIEWED_LANGUAGES`. Riders who already picked it get it then.

Also tell the lawyer: `rider_terms_acceptance.language` records the language saved at sign-up. Earlier builds let riders choose te or hi there while every screen was in English.

### P2-09 Photo retention and the DPDP notice
**Who:** agent, plus the lawyer. **Blocked by:** E6. **Must be live before:** 13 May 2027.

**Do:**
1. A daily job deletes, unless flagged or disputed:
   - selfie blobs older than 30 days;
   - delivery photos older than 90 days.
2. Add an in-app privacy notice with the lawyer's text, and record when each rider accepted it.

**Prove it:** a database test for the delete rules, and a screen test for the notice.

**Done (agent part), both off:**
- **Photo retention, behind `CRAVES_FLEET_PHOTO_RETENTION_ENABLED`.** `FleetPhotoRetention` runs daily at 03:10 IST on its own fleet thread. It deletes selfies 30 days after the shift started and delivery photos 90 days after the delivery, 500 at a time, file first and then its reference. The rest stays:
  - flagged: a selfie ops rejected;
  - disputed: the trip's pay is on hold, or held and not credited yet, or a support issue about the trip isn't fixed.

  A file that can't be deleted keeps its reference for the next run and raises an alert. While the setting is off, the job only logs how many are due, so ops sees the numbers first.
- **Privacy notice, behind `CRAVES_FLEET_PRIVACY_NOTICE_VERSION` and `CRAVES_FLEET_PRIVACY_NOTICE_URL` (empty).**
  - `GET /me` carries `privacyNotice {version, url, accepted}` while both are set.
  - The app shows the notice before anything else, so a PENDING rider reads it before sending documents. It never interrupts a shift. The lawyer's text opens on the web in the language on screen (`{language}` in the URL).
  - `POST /privacy-notice/accept` records the version, language and time (V169 `rider_privacy_acceptance`). A PENDING rider may call it, and any other version is 409 `NOTICE_CHANGED`.
- **Proved by:**
  - `FleetPhotoRetentionDatabaseTest` (what goes, what stays, a failed delete, off) and `FleetPrivacyNoticeDatabaseTest`;
  - `FleetRiderApiDatabaseTest` (a PENDING rider gets through security);
  - `gate.test.ts`, the screen tests in screensA, `riderApi.live.test.ts`, and `test_rider_fleet_apim.py` (the new route).

**Still open (people):**
1. The lawyer agrees the periods and writes the notice in English, Telugu and Hindi.
2. Publish the text, then set the two notice settings.
3. Republish the rider APIM (the configure script or pipeline, then the status script): the new route is in `routes.txt`.
4. Switch retention on after a week of the "due" counts in the logs.

Live before 13 May 2027.

### P2-10 Replace the 12-hour wake lock
**Who:** agent. **Must be done before:** any Play rollout beyond internal testing.

**Do:**
1. Drive uploads from location callbacks, holding a short timed wake lock (at most 10 s) per upload. Remove `holdWakeLock` (`RiderOnlineService.kt:268-275`).
2. Measure battery per online hour before and after, on the same phones.

**Prove it:** PHONE-TESTS §1 still passes, battery per hour is no worse, and Play vitals show no excessive wake locks.

**Done (agent part), behind `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED`, off:** uploads now go when a location batch arrives (the fused provider wakes the phone for each; idle fixes come at least as often as uploads are due) and on the timer as a backup, one timer at a time, each upload under a short wake lock released after the call (20 s at most: the call's own 15 s timeout and its answer, not the plan's 10 s). While the server's `/locations` answer says `callbackUploads: true`, phones release the shift-long lock; when it doesn't, they hold it (taking it again if it had been dropped), so the same APK runs both ways for the battery comparison on the same phones, and old APKs keep their lock. Proved by `FleetLocationIngestDatabaseTest` (the answer both ways) and the Kotlin type check. **Still open (people):** PHONE-TESTS §1 run both ways on the same phones, then switch it on before any Play rollout.

### P2-11 Thin the trip track (only if needed)
**Who:** agent. **Only if:** `trip_track` passes about 5 GB.

**Do:** After 7 days, keep one fix per 10 s per trip.

**Prove it:** a database test on a seeded partition.

### P2-12 Open the trip after a restart without signal (done)
**Why:** found while writing P1-15. After a force stop or a reboot with no signal, the app couldn't start: the session check and `GET /rider/me` need the server (`RiderNavigator.tsx`, `useRiderSession.ts`), so it showed "Something went wrong". Steps tapped before the restart were kept, but the rider couldn't tap new ones until there was signal. **Who:** agent. **Blocked by:** nothing.

**Done:**
1. `state/riderSnapshot.ts` keeps the last `RiderMe`, Home and the trip in progress, encrypted with `expo-secure-store` because the trip has the customer's contact details. The trip is dropped once it ends, and everything at sign-out. A start without signal seeds the query cache from a snapshot under a day old.
2. The rider's live session treats a start that failed for lack of signal, with the refresh credential still saved, as signed in. It checks the session again every 60 s (each check renews the refresh token, so not more often on a weak link) and whenever the app comes back to the front; queued steps go as soon as the phone reaches Craves; once signed in again it refetches and sends the queued steps. A refused session (expired or revoked) goes to sign-in. The customer and chef apps keep today's behaviour.

**Proved by:** `RiderApp.live.test.tsx` (a restart with no network opens the trip on the step its queued step leads to; the step reaches the server once the signal is back) and `riderSnapshot.test.ts`; `PHONE-TESTS.md` §3 no longer needs "Try again".

### Phase 2 done when
- 50 riders online with zero lost steps over a week.
- p95 sync within 30 s of the signal returning, even with the app swiped away.
- Offer-to-ring targets still met.
- Retention jobs running.
- On the Play internal track with Telugu and Hindi.

---

## Phase 3: efficiency

**Entry:** Phase 2 done.

**P3-01 Battery target.** Set a target per online hour from Phase 1–2 data, and meet it on a 4 GB and a 3 GB phone. Levers, one PR each, each measured:
- lower location priority when the rider is stationary and waiting;
- fewer trip uploads when the screen is off.

**P3-02 Cold start stays ≤ 2 s.**
1. Profile with Perfetto.
2. Load the non-Home screens lazily.
3. Remove startup work that Home doesn't need.
4. Re-run `PERF.md` §1.

**P3-03 APK size alert (done).** In `rider-apk.yml`, compare the APK size with the last `main` build and warn when it grows more than 5% (DoorDash practice, R8 E5). Every run prints the size and the change; above 5% it raises a workflow warning and says so in the PR comment, without failing the build. The size from each run on `main` is kept in the Actions cache for the next runs (`RELEASE.md`). It is live once one run on `main` has set the first size.

**P3-04 Pilot health page (done).** `GET /api/v1/admin/fleet/pilot-health` (`FleetPilotHealth`, trip readers) runs every named query of `services/integration-service/src/main/resources/fleet/pilot_health.sql`, each in its own read-only transaction with a 15 s limit and at most 200 rows, and reports a failing query without stopping the others. The console's Riders & fleet → Rider pilot health page shows each as a table with its description. Proved by `FleetPilotHealthDatabaseTest` (read-only, a writing query refused), `FleetPilotHealthTest`, `FleetOpsSecurityTest` and `health.vitest.ts`.

**P3-05 Baseline profile.** Only for Play installs; side-loaded APKs don't use it (R8). Build it after the move to Play, and measure cold start before and after.

**P3-06 Batching and road-ETA ranking.** Only if the triggers in blueprint C7 fire. The trigger queries are in `pilot_health.sql` (`batching_candidates`, `rider_busy_share`, `pickup_detour`; done); design only when they fire.

**Road ranking: the switch is built, off** (`CRAVES_FLEET_ROAD_RANKING_ENABLED`), so turning it on when `pickup_detour` fires needs no release. Among the 5 nearest by straight line, offers go to the 3 nearest by road. The blueprint's 3 calls would only reorder the same 3 riders, who all get the offer at once. Pickup pay keeps the straight line, as the terms say. Once dispatch is live, switching it on changes who gets offers: give riders 14 days' notice first (rule 9). Proved by `FleetDispatchDatabaseTest.roadRankingOffersTheRidersNearestByRoadAndPaysByTheStraightLine`. Batching stays unbuilt until its trigger fires.

**Phase 3 done when:** the battery target is met on both phones, cold start is ≤ 2 s, the size alert is live, and the health page replaces the manual queries.
