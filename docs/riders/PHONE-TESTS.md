# Craves Rider: phone tests for the online service and offer ringing

A person runs these on real phones. Use a **live** build (`CRAVES_RIDER_API_MODE=live`, real `RIDER_GOOGLE_SERVICES_JSON`) against the backend in test mode, with an allow-listed rider whose phone is approved. Write the results in the tables at the end.

## Before each phone

1. Install the APK from the PR's "craves-rider-apk" artifact.
2. Sign in, accept the terms, and finish **Phone setup** (all checks green, including autostart, battery "no restrictions" and "lock Craves in recent apps").
3. Charge to at least 80%, Wi-Fi off, mobile data on, location on.
4. Connect adb if you can and keep `adb logcat -s CravesRiderOffer CravesRiderOnline > <brand>.log` running.
5. Note the model, Android version and OEM skin (MIUI/HyperOS, ColorOS, Funtouch/OriginOS, realme UI, One UI).

## 1. Service survival: 4 hours (Xiaomi and Oppo; done when both pass)

1. Tap **Go online** (selfie). The "You're online" notification appears.
2. Lock the screen. Leave the phone still for 30 minutes.
3. Unlock, **swipe Craves Rider away** from recent apps, lock again.
4. Turn **battery saver on**. Leave the phone for the rest of the 4 hours, screen off, moving it now and then (a short walk or ride).
5. During the 4 hours, ops checks every 30 minutes on the ops console that the rider was **seen in the last 45 s** (or the backend's `rider_position_latest.updated_at`).
6. At 4 hours: the "You're online" notification is still there, and the backend has fixes with no gap longer than 60 s.
7. Tap **Go offline**. The notification goes away and uploads stop.

**Pass:** no gap over 60 s in the backend's fixes during the 4 hours, and the notification survived the swipe and battery saver. **Fail:** write down when uploads stopped and what the phone was doing.

Also try once per phone (record, not pass/fail):

- Reboot while online: the service doesn't come back on its own (no background location by design). Opening the app resumes it without a new selfie while the shift is valid.
- Force stop in Settings, then open the app: same as reboot.
- Airplane mode for 2 minutes, then off: uploads resume within 10 s and the fixes from the gap are not all lost (the newest 5 are kept).

## 2. Offer to ring: p95 under 5 s (Xiaomi, Oppo, Vivo, Realme, Samsung)

For each phone, send **20 offers** to the rider through dispatch in test mode. Mix the states:

| Offers | Phone state |
|---|---|
| 5 | App open, screen on |
| 5 | App in background, screen off |
| 5 | App swiped away, screen off, battery saver on |
| 5 | Doze forced: `adb shell dumpsys deviceidle force-idle` (screen off, unplugged) |

For each offer record:

- **Sent:** the server's send time (notification-service log, or the offer's created time).
- **Rang:** when the phone starts ringing (stopwatch or a video of the phone next to a clock synced to network time).
- **First channel:** `fcm` or `locations`, from logcat (`offer <id> first via <channel>`) or the app's offer event.
- **Second channel gap:** the `also via ..., N ms after ...` line, if any.

Checks on every phone:

- [ ] The phone rings (ringtone and vibration) and shows a heads-up notification, with the screen off too.
- [ ] Tapping the notification opens the app on the Offer screen with the right countdown.
- [ ] The same offer never rings twice when both channels deliver it.
- [ ] After accept or decline, the ringing stops by the next location call (within 15 s).
- [ ] An offer that expires stops ringing and its notification disappears.
- [ ] Phone setup's **Test ring** rings the same way.

**Pass:** p95 of (rang − sent) under 5 s over the 20 offers on each phone. If FCM misses and the location call delivers, that offer can take up to about 11 s; if p95 fails because of it, write how many offers came by `locations` first.

## Results

### Service survival

| Phone (model, Android, skin) | Date | Tester | Gaps over 60 s | Survived swipe | Survived battery saver | Pass |
|---|---|---|---|---|---|---|
| Xiaomi | | | | | | |
| Oppo | | | | | | |

### Offer to ring

| Phone (model, Android, skin) | Date | Tester | Offers | p50 (s) | p95 (s) | Max (s) | First by fcm | First by locations | Missed | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| Xiaomi | | | 20 | | | | | | | |
| Oppo | | | 20 | | | | | | | |
| Vivo | | | 20 | | | | | | | |
| Realme | | | 20 | | | | | | | |
| Samsung | | | 20 | | | | | | | |

Keep each phone's logcat file with the results.
