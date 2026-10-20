# Craves Rider: native online service and offer ringing

Kotlin in `apps/mobile/android/app/src/rider/java/com/cravesapp`, rider flavor only. The customer app (`com.cravesapp`) gets none of it.

| File | Job |
|---|---|
| `RiderOnlineService.kt` | Foreground service (type `location`): fixes, uploads, stop handling, the saved shift credential |
| `RiderOffers.kt` | Offers from both channels: dedupe, ringing, the pending offer, notification channels |
| `RiderMessagingService.kt` | FCM data messages (`type=OFFER`) and token changes |
| `RiderOnlineModule.kt`, `RiderOnlinePackage.kt` | The `CravesRiderOnline` native module, registered in the rider `FlavorPackages` |
| `RiderEvents.kt` | Sends events to JS through `RCTDeviceEventEmitter` when JS is running |

JS side: `src/features/rider/native/riderOnlineService.ts` uses the module in live builds (`CRAVES_RIDER_API_MODE=live`) when `NativeModules.CravesRiderOnline` exists. Mock builds, Jest and the customer app use the JS loop against the mock server.

## Interfaces agreed with the backend

### Location upload

- `POST {apiBaseUrl}/api/v1/rider/locations`
- Header `X-Craves-Shift-Credential: <shiftCredential>`. Native code sends no JWT.
- Body `{"fixes": [{"lat", "lng", "accuracyM", "at", "mock"}]}`, at most 5 fixes, `at` in ISO-8601 UTC (`2026-10-20T10:15:30.123Z`). An empty `fixes` array is sent when there is no fix yet: the call is also the heartbeat and the second offer channel.
- `mock` is `Location.isMock()` on Android 12+ and `isFromMockProvider()` before.
- Response `LocationBatchResponse` `{offers: Offer[], activeTrip?: {tripId, step, version}, stop?: boolean, stopReason?: string}`:
  - every offer goes through the offer dedupe (channel `locations`); offers the server no longer lists stop ringing;
  - a new `activeTrip` (tripId or version changed) emits `riderTripChanged`; a trip whose step isn't DELIVERED, FAILED or CANCELLED switches to trip mode;
  - `stop: true` ends the shift with `stopReason` as the message.
- 401 or 403: the credential is dead. The service forgets it, stops, and reports `OFFLINE` with a message.
- Network error or other non-2xx: fixes are kept (the newest 5) and sent on the next tick; status `ERROR`, "No internet. Retrying."
- OkHttp (4.9.2, from React Native): connect, read and write timeouts 10 s, call timeout 15 s.

| | Idle | On a trip |
|---|---|---|
| Location priority | `PRIORITY_BALANCED_POWER_ACCURACY` | `PRIORITY_HIGH_ACCURACY` |
| Fix interval | 10 s | 3 s |
| Upload (and max batch delay) | every 10 s | every 15 s |

### FCM offer push

notification-service sends a **data-only** message (no `notification` payload), high priority, TTL = seconds left on the offer, with data keys:

| Key | Value |
|---|---|
| `type` | `OFFER` |
| `offerId` | the offer id |
| `offer` | the Offer object exactly as in `contract.ts`, as a JSON string |
| `title`, `body` | the notification text |

The app always posts a visible notification on channel `rider_offers` (high importance, ringtone and vibration). FCM deprioritises later high-priority pushes from apps that don't.

### API base URL

`apiBaseUrl` comes from JS (`getRuntimeConfig().apiBaseUrl`, from react-native-config `CRAVES_API_BASE_URL`, origin only) as a `start()` argument.

## Native module `CravesRiderOnline`

| Method | Does |
|---|---|
| `start(shiftCredential: string \| null, expiresAtMs: number, apiBaseUrl: string)` | Saves the credential and starts the service. `expiresAtMs` is `Date.parse(ShiftStart.expiresAt)`. A null credential resumes the saved shift (the app reopened while the server says online). Rejects `LOCATION_PERMISSION`, `NO_SHIFT` (nothing saved or expired; also emits `OFFLINE` with a message) or `START_FAILED` |
| `stop()` | Forgets the credential and stops the service. JS then calls `POST /shift/end`, which revokes it on the server |
| `testRing()` | Posts a test notification on `rider_offers` (phone setup) |
| `lastFix()` | The latest fix, or null |
| `getFcmToken()` | The FCM token from `FirebaseMessaging.getToken()`, which keeps the current token itself. Rejects `FCM_TOKEN` in demo builds with the placeholder Firebase config |
| `getPendingOffer()` | The offer whose notification opened the app, or one that arrived while JS wasn't running; null once expired. Read once |

| Event | Payload |
|---|---|
| `riderOffer` | `{offer: string (Offer JSON), receivedAtMs: number, channel: "fcm" \| "locations"}` |
| `riderTripChanged` | `{tripId, step, version}` |
| `riderStatus` | `{state: "ONLINE" \| "OFFLINE" \| "ERROR", lastFix?, message?}` after every upload and when the service stops |
| `riderFcmToken` | `{token}` |

JS sends the token with `POST /api/v1/rider/devices` `{fcmToken, appVersion, model}` from `RiderRuntime` once the gate is ready and on every token change. A 409 `DEVICE_NOT_BOUND` shows "This phone isn't approved".

## Rules the code keeps

- **The shift credential never reaches JS.** It lives only in the app's private `SharedPreferences` (`craves_rider_shift`; `allowBackup` is off), so a sticky restart can resume. It is cleared on `stop()`, a 401/403, a stop code and expiry.
- **Offers: first arrival wins.** Dedupe is by `offerId` across FCM and `/locations`. Each first arrival is logged with tag `CravesRiderOffer` and the channel (`adb logcat -s CravesRiderOffer`), and the other channel's later arrival with the gap in ms. The JS event carries the channel too.
- **Countdown:** `expiresInSec` from the offer plus the receive time on the phone, never the phone clock against `expiresAt`. An offer with `expiresInSec <= 0` is dropped; the notification times out with the offer.
- **Ringing comes from the channel, not JS,** so it works with the screen off and the app closed. The notification tap opens the launcher activity with the offer in its extras.
- **No background-location permission.** The service starts from the Go Online tap (the app is in the foreground). After the phone kills it, a sticky restart may be refused on Android 12+; the shift stays saved and resumes the next time the app opens.
- **Wake lock.** A partial wake lock is held while online (until the credential expires at most); without it the upload timer stalls with the screen off.

## Permissions (rider manifest only)

`POST_NOTIFICATIONS`, `VIBRATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`, plus the services `.RiderOnlineService` (`foregroundServiceType="location"`, not exported) and `.RiderMessagingService` (`MESSAGING_EVENT`, not exported). `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `INTERNET` come from `src/main`. No `ACCESS_BACKGROUND_LOCATION`, no `USE_FULL_SCREEN_INTENT`.

The rider APK workflow fails if any rider-only permission appears in `src/main/AndroidManifest.xml`.

## Dependencies (rider only)

In `android/app/build.gradle`: `riderImplementation` `com.google.android.gms:play-services-location:21.3.0`, and `com.google.firebase:firebase-messaging` on the Firebase BOM that `@react-native-firebase/app` uses (`sdkVersions.android.firebase` in its package.json). The google-services plugin reads `android/app/src/rider/google-services.json` for rider variants; the APK workflow writes that file.

## How to test

- **Type check:** `/home/claude/tools/ktcheck apps/mobile/android/app/src/rider/java/com/cravesapp <okhttp stub>` in the agent workspace (stubs for play-services, Firebase and OkHttp; it checks no resources, manifest or Gradle). CI builds the real APK.
- **JS:** `npx jest src/features/rider/native src/features/rider/components` (both service paths, registration, 409, pending offer).
- **On a phone** (live build): see `docs/riders/PHONE-TESTS.md`. Useful commands:
  - `adb logcat -s CravesRiderOffer CravesRiderOnline`
  - `adb shell dumpsys deviceidle force-idle` (Doze), `adb shell dumpsys battery unplug`, `adb shell am set-inactive com.cravesapp.rider true`
  - `adb shell dumpsys activity services com.cravesapp.rider` (is the service running?)
