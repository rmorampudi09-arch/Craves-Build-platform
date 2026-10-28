# Craves Rider: native online service, offer ringing and the trip-step outbox

Kotlin in `apps/mobile/android/app/src/rider/java/com/cravesapp`, rider flavor only. The customer app (`com.cravesapp`) gets none of it.

| File | Job |
|---|---|
| `RiderOnlineService.kt` | Foreground service (type `location`): fixes, uploads, stop handling, the saved shift credential |
| `RiderOffers.kt` | Offers from both channels: dedupe, ringing, the pending offer, notification channels |
| `RiderMessagingService.kt` | FCM data messages (`type=OFFER`) and token changes |
| `RiderOnlineModule.kt`, `RiderOnlinePackage.kt` | The `CravesRiderOnline` native module, registered in the rider `FlavorPackages` |
| `RiderEvents.kt` | Sends events to JS through `RCTDeviceEventEmitter` when JS is running |
| `RiderOutbox.kt`, `RiderOutboxCore.kt`, `RiderOutboxJob.kt` | The trip-step outbox (P2-02): the file, the sends, the rules (JVM-tested) and the persisted job |

JS side: `src/features/rider/native/riderOnlineService.ts` uses the module in live builds (`CRAVES_RIDER_API_MODE=live`) when `NativeModules.CravesRiderOnline` exists. Mock builds, Jest and the customer app use the JS loop against the mock server.

## Interfaces agreed with the backend

### Location upload

- `POST {apiBaseUrl}/api/v1/rider/locations`
- Header `X-Craves-Shift-Credential: <shiftCredential>`. Native code sends no JWT.
- Body `{"fixes": [{"lat", "lng", "accuracyM", "at", "mock", "ageMs"}]}`, oldest first, as many as the last answer's `maxFixes` (20; 5 until a server says), `at` in ISO-8601 UTC (`2026-10-20T10:15:30.123Z`). `ageMs` (app 1.1.0) is `SystemClock.elapsedRealtime()` minus the fix's `elapsedRealtimeNanos`, worked out when the call is built (a fix kept across a reboot falls back to the wall clock): the server times the fix as its clock minus `ageMs`, so the phone's wall clock doesn't matter. An empty `fixes` array is sent when there is no fix yet: the call is also the heartbeat and the second offer channel.
- Unsent fixes (P2-03): kept oldest first, the first 20 as they come, then one per 30 s (the newest kept fix gives way to the next unless 30 s apart), 120 (about an hour) at most; a fix over an hour old is dropped, as the server caps a fix's age there. While some wait they are also in `filesDir/rider/fixes.json` (`AtomicFile`, with the shift's expiry so another shift's are dropped), so a kill leaves no gap in the trip's track; the file goes once all are sent and when the shift ends.
- `mock` is `Location.isMock()` on Android 12+ and `isFromMockProvider()` before.
- `health` (app 1.1.0), at most once a minute, until a 2xx takes it: `batteryPct` and `charging` (`BatteryManager`), `powerSave`, `canRing` (notifications on and the `rider_offers` channel still at high importance), `drainPct` and `unpluggedMin` (counted only while unplugged, since the service started), `queuePending` and `queueOldestAgeS` (the JS queue's from `setQueueStats`, plus the native outbox's), and `lastExitReason` once after each start (`ActivityManager.getHistoricalProcessExitReasons`, Android 11+, e.g. `LOW_MEMORY at 2026-10-27T09:12:03.000Z`).
- `offerReceipts` (app 1.1.0): every offer's first arrival, from either channel, as `{offerId, channel, ageMs}` with `ageMs` from `SystemClock.elapsedRealtime()` worked out when the call is built. At most 10 are kept; they are forgotten after a 2xx, so a failed call sends them again. The server keeps the first arrival of each of the rider's own offers (`trip_offer.rang_at`, `rang_channel`).
- Response `LocationBatchResponse` `{offers: Offer[], activeTrip?: {tripId, step, version}, stop?: boolean, stopReason?: string, maxFixes?: number, nextPollSec?: number}`:
  - `maxFixes` (1 to 20) is how many fixes the next call carries; `nextPollSec` (5 to 30, P2-04) is the idle upload period, 10 s when absent;
  - `callbackUploads: true` (P2-10) drops the shift-long wake lock; absent, the phone holds it (and takes it again if it had dropped it);
  - every offer goes through the offer dedupe (channel `locations`); offers the server no longer lists stop ringing;
  - a new `activeTrip` (tripId or version changed) emits `riderTripChanged`; a trip whose step isn't DELIVERED, FAILED or CANCELLED switches to trip mode;
  - `stop: true` ends the shift with `stopReason` as the message.
- 401 or 403: the credential is dead. The service forgets it, stops, and reports `OFFLINE` with a message.
- Network error or other non-2xx: fixes are kept (thinned as above) and sent on the next tick; status `ERROR`, "No internet. Retrying."
- OkHttp (4.9.2, from React Native): connect, read and write timeouts 10 s, call timeout 15 s.

| | Idle | On a trip |
|---|---|---|
| Location priority | `PRIORITY_BALANCED_POWER_ACCURACY` | `PRIORITY_HIGH_ACCURACY` |
| Fix interval | 10 s | 3 s |
| Upload (and max batch delay) | every 10 s (`nextPollSec`, 5 to 30) | every 15 s |

### FCM offer push

notification-service sends a **data-only** message (no `notification` payload), high priority, TTL = seconds left on the offer, with data keys:

| Key | Value |
|---|---|
| `type` | `OFFER` |
| `offerId` | the offer id |
| `offer` | the Offer object exactly as in `contract.ts`, as a JSON string |
| `title`, `body` | the notification text |

The app always posts a visible notification on channel `rider_offers` (high importance, ringtone and vibration). FCM deprioritises later high-priority pushes from apps that don't.

`type=GO_ONLINE` (app 1.1.0) comes when the shift is open but the phone stopped calling: unless the service is running again, the app posts "You're offline" / "Tap to go back online and get orders." on channel `rider_trip` (default importance); the tap opens the app and Home resumes the saved shift. The notice goes as soon as the service runs again, whether the rider tapped it or opened the app another way.

When a location call reports the rider's trip as `CANCELLED` (ops, the customer or the watchdog ended it), the service posts "Trip cancelled" / "Open Craves Rider to see what's next." on `rider_trip`, once per change, so the rider knows with the screen off; the tap opens the app (app 1.1.0).

`onNewToken` emits `riderFcmToken` for JS and, when a shift is saved, also sends `POST /api/v1/rider/devices` itself with the shift credential (`installationId` ANDROID_ID, the token, `BuildConfig.VERSION_NAME`, `Build.MODEL`), so a token that changes while JS isn't running still reaches the server.

### API base URL

`apiBaseUrl` comes from JS (`getRuntimeConfig().apiBaseUrl`, from react-native-config `CRAVES_API_BASE_URL`, origin only) as a `start()` argument.

## Native module `CravesRiderOnline`

| Method | Does |
|---|---|
| `start(shiftCredential: string \| null, expiresAtMs: number, apiBaseUrl: string)` | Saves the credential and starts the service. `expiresAtMs` is `Date.parse(ShiftStart.expiresAt)`. A null credential resumes the saved shift (the app reopened while the server says online). Rejects `LOCATION_PERMISSION`, `NO_SHIFT` (nothing saved or expired; also emits `OFFLINE` with a message) or `START_FAILED` |
| `stop()` | Forgets the credential and stops the service. JS then calls `POST /shift/end`, which revokes it on the server |
| `testRing()` | Posts a test notification on `rider_offers` (phone setup) |
| `lastFix()` | The latest fix, or null; its `ageMs` is the fix's age when read (JS adds the time since) |
| `setQueueStats(pending: number, oldestAtMs: number)` | The trip actions JS has waiting and the oldest one's `Date.now()`, for the health report (`tripQueue` calls it on every queue change) |
| `getFcmToken()` | The FCM token from `FirebaseMessaging.getToken()`, which keeps the current token itself. Rejects `FCM_TOKEN` in demo builds with the placeholder Firebase config |
| `getPendingOffer()` | The offer whose notification opened the app, or one that arrived while JS wasn't running; null once expired. Read once. JS's `pendingOffer()` also returns a `riderOffer` that came while no screen listened (the activity swiped away while online) |
| `outboxEnqueue(entryJson, optionsJson)` | Saves a trip step (`{riderId, tripId, action, key, body, occurredAt, fix}`; a key already queued is that step) and runs a pass in the same go; resolves `{entryId, results, needsAuth}` JSON. Options: `{riderId, accessToken (fresh, or null for the shift credential), apiBaseUrl}` |
| `outboxFlush(optionsJson)` | A pass: options as above plus `now` (no backoff) and `tripId` (that trip's steps skip their backoff); resolves `{results, needsAuth}` |
| `outboxImport(json)` | `{entries, refusals}` from the JS queue (P2-02b), the OTP in each body; sealed and saved as deferred |
| `outboxState()` | `{entries, refusals}` from memory, never a sealed code and never waiting for a send |
| `outboxDefer(entryId)` | The step is still waiting once the tap is over: it now counts as captured offline |
| `outboxDismissRefusal(tripId)` | The rider dismissed a refusal notice |

| Event | Payload |
|---|---|
| `riderOffer` | `{offer: string (Offer JSON), receivedAtMs: number, channel: "fcm" \| "locations"}` |
| `riderTripChanged` | `{tripId, step, version}` |
| `riderStatus` | `{state: "ONLINE" \| "OFFLINE" \| "ERROR", connected, lastFix?, message?}` after every upload and when the service stops. While offers can't ring (notifications off, or the `rider_offers` channel turned down) a successful upload reports `ERROR` "Turn on notifications to get orders." with `connected: true`; the server sends that phone no offers (`can_ring`), and Home's notifications warning shows (device state `notificationsEnabled` is the same check) |
| `riderFcmToken` | `{token}` |
| `riderOutboxChanged` | `{answer}`: a pass the outbox ran by itself (after an upload, on a new network, from the job), as `{results, needsAuth}` JSON. JS tells the trip screen about sent and refused steps, then reads the list again |

JS sends the token with `POST /api/v1/rider/devices` `{installationId, fcmToken, appVersion, model}` from `RiderRuntime` once the gate is ready and on every token change. A 409 `DEVICE_NOT_BOUND` shows "This phone isn't approved".

`installationId` is `Settings.Secure.ANDROID_ID`, from `CravesRiderDevice.getInstallationId()` (null if the phone has none; JS then registers nothing and sends no header). The server binds the first one; `POST /shift/start` sends it again as `X-Craves-Installation-Id`, and Go online shows the server's message on 409 `DEVICE_NOT_BOUND`. ANDROID_ID depends on the signing key: a build signed with another key looks like a new phone, so keep one rider signing key (see RELEASE.md).

The delivery photo (app 1.1.0): `CravesRiderDevice.keepPhoto(uri)` copies the camera's photo into `filesDir/rider-photos/<uuid>.jpg`, upright (EXIF rotation applied), the long edge at most 1600 px, JPEG quality 80, and resolves its `file://` URI; the queue sends that copy and `deletePhoto(uri)` removes it once the server has answered (sent or refused). `deletePhoto` only deletes inside `rider-photos`. If the copy can't be made or fully written, `keepPhoto` leaves no file and fails, and the camera's own photo is queued instead. A missing copy is never sent: the step becomes a refusal "Take the photo again" on screen.

## Trip-step outbox (P2-02)

**When.** Live rider builds use it once the server sets `features.nativeTripOutbox` on `GET /me`, which it does exactly while `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED` is on (trip steps take the shift credential, P2-01). Until then, and in mock builds, trip steps go through the JS queue (`tripQueue`, AsyncStorage). When it turns on, the JS queue moves in once (`moveAll`, then `outboxImport`), each OTP back from the secure store into its body, its refusals with it; a failed move keeps the JS queue, which goes on sending. A trip with steps in one queue keeps using that queue, so its steps stay in order; when the switch goes off, steps still in the outbox go with the app's token.

**Storage.** `filesDir/rider/outbox.json` through the platform `AtomicFile` (new file, then rename): `{"v":2,"entries":[...],"refusals":[...]}`. An entry is the JS queue's `QueueEntry` plus `elapsedMs` and `boot` (`SystemClock.elapsedRealtime` and `Settings.Global.BOOT_COUNT` at the tap, -1 for moved steps) and `otpSealed`. The customer's OTP never goes in the file: it is sealed with an AES-GCM key in the Android Keystore (alias `craves_rider_outbox`, Base64 of the 12-byte IV and the ciphertext) and let go after 24 hours (decision E1); if the Keystore can't seal it, it waits in memory only, as in the JS queue. The delivery photo stays in `filesDir/rider-photos` until the server answers, then goes. An unreadable file is renamed aside (`outbox.json.unreadable-<ms>`), never written over. At most 5 refusals, newest first, one per trip.

**Sends.** One thread sends, one step at a time, in order per trip, with the step's own `Idempotency-Key`, exactly as `liveRiderApi.tripAction` does (JSON, or multipart for a photo delivery; `ageMs` and the fix aged by the monotonic clock within the same boot, else by the wall clock). Passes run: when JS enqueues or flushes (with the app's fresh token, else the shift credential), after every upload that reached the server, on a new default network (`registerDefaultNetworkCallback`, while the service runs), and from `RiderOutboxJob`. Answers (`RiderOutboxCore.verdict`): a 2xx sends; no answer, 408, 429 or 5xx retries after 2 s doubling to 60 s; 401 stops the pass and counts nothing (JS renews its token and passes once more); 403 or 404 to the shift credential holds that trip for the app's token (the credential moves only this shift's trips); any other answer drops that rider's trip queue and keeps the refusal (not a wrong or locked code at the door, unless the step was deferred). A fault building a step never drops it: it waits, and the health report shows it waiting. Reads (`outboxState`) and dismissing a notice never wait behind a send; a tap waits behind a photo upload in progress, as in the JS queue.

**The job.** `RiderOutboxJob` is persisted (`RECEIVE_BOOT_COMPLETED`), needs any network, backs off from 30 s, and is scheduled whenever a step waits; it sends with the shift credential, so after a reboot steps go without the app being opened while the shift lasts. Without a saved shift it ends and the steps wait for the app. A force stop cancels it (Android); the steps then go when the app opens.

**Not done: the Android 14 user-initiated photo job** (`RUN_USER_INITIATED_JOBS`, WORKPLAN P2-02c step 3). It must be started while the app is visible and carry its own notification, and it adds a permission declaration. A photo delivery goes from the regular job, the service's passes and the app; add the user-initiated job only if PHONE-TESTS §3 shows photo steps waiting after a kill on Android 14+.

## Rules the code keeps

- **JS never stores the shift credential.** JS hands it from `POST /shift/start` straight to `start()`; it lives only in the app's private `SharedPreferences` (`craves_rider_shift`; `allowBackup` is off), so a sticky restart can resume. It is cleared on `stop()`, a 401/403, a stop code and expiry.
- **Offers: first arrival wins.** Dedupe is by `offerId` across FCM and `/locations`. Each first arrival is logged with tag `CravesRiderOffer` and the channel (`adb logcat -s CravesRiderOffer`), and the other channel's later arrival with the gap in ms. The JS event carries the channel too.
- **Countdown:** `expiresInSec` from the offer plus the receive time on the phone, never the phone clock against `expiresAt`. An offer with `expiresInSec <= 0` is dropped; the notification times out with the offer.
- **Ringing comes from the channel, not JS,** so it works with the screen off and the app closed. The notification tap opens the launcher activity with the offer in its extras.
- **No background-location permission.** The service starts from the Go Online tap (the app is in the foreground). After the phone kills it, a sticky restart may be refused on Android 12+; the shift stays saved and resumes the next time the app opens.
- **Wake lock.** Uploads go when a location batch arrives (the fused provider wakes the phone for each) and on a timer as a backup, each under a short partial wake lock (released after the call, 20 s at most). Until the server says `callbackUploads` (P2-10, `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED`, off), a partial wake lock is also held for the whole shift (until the credential expires at most), as before; turn it on only once PHONE-TESTS §1 passes both ways, and before any Play rollout (Play flags wake locks held 2 hours or more with the screen off).

## Permissions (rider manifest only)

`POST_NOTIFICATIONS`, `VIBRATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` (the persisted outbox job) and `ACCESS_NETWORK_STATE` (a job waiting for a network on Android 14+, and the network callback), plus the services `.RiderOnlineService` (`foregroundServiceType="location"`, not exported), `.RiderOutboxJob` (`BIND_JOB_SERVICE`, not exported) and `.RiderMessagingService` (`MESSAGING_EVENT`, not exported). `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `INTERNET` come from `src/main`. No `ACCESS_BACKGROUND_LOCATION`, no `USE_FULL_SCREEN_INTENT`.

The rider APK workflow fails if any rider-only permission appears in `src/main/AndroidManifest.xml`.

## Dependencies (rider only)

In `android/app/build.gradle`: `riderImplementation` `com.google.android.gms:play-services-location:21.3.0`, and `com.google.firebase:firebase-messaging` on the Firebase BOM that `@react-native-firebase/app` uses (`sdkVersions.android.firebase` in its package.json). The google-services plugin reads `android/app/src/rider/google-services.json` for rider variants; the APK workflow writes that file. Tests only: `testRiderImplementation` `junit:junit:4.13.2` for `src/testRider` (never in the APK).

## How to test

- **Type check:** `/home/claude/tools/ktcheck apps/mobile/android/app/src/rider/java/com/cravesapp <okhttp stub>` in the agent workspace (stubs for play-services, Firebase and OkHttp; it checks no resources, manifest or Gradle). CI builds the real APK.
- **JS:** `npx jest src/features/rider/native src/features/rider/components` (both service paths, registration, 409, pending offer); the outbox from JS: `npx jest src/features/rider/state src/features/rider/domain`.
- **The outbox's rules on the JVM:** `./gradlew testRiderReleaseUnitTest` (`src/testRider/.../RiderOutboxCoreTest.kt`); the APK workflow runs it with the build.
- **On a phone** (live build): see `docs/riders/PHONE-TESTS.md`. Useful commands:
  - `adb logcat -s CravesRiderOffer CravesRiderOnline`
  - `adb shell dumpsys deviceidle force-idle` (Doze), `adb shell dumpsys battery unplug`, `adb shell am set-inactive com.cravesapp.rider true`
  - `adb shell dumpsys activity services com.cravesapp.rider` (is the service running?)
