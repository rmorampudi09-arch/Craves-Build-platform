# Craves Rider: performance and accessibility pass on low-end phones

A person runs this on two phones before riders get a build: one with **4 GB** RAM and one with **3 GB** (the floor riders' phones should meet). Fill in the tables at the end. Gradle and R8 run only in CI, so this pass is also the first proof that the R8 build behaves.

## Set-up (both phones)

1. Install the **live** release APK from CI (`craves-rider-live-<sha>.apk`, R8 on; see `RELEASE.md`). Never measure a debug build: it runs JS without bytecode precompilation and is much slower. Write down the versionCode from the PR comment.
2. Sign in as the test rider, accept the terms, finish Phone setup. For the Earnings check the rider needs **at least 200 trips this week** on the test backend (the mock build has only about 45, so it can't do this check).
3. Restart the phone, wait 2 minutes, close other apps. Battery above 50%, battery saver off, mobile data on.
4. Turn on USB debugging and check `adb devices` lists the phone. Leave animations on.
5. Write down: model, RAM, Android version, OEM skin.

The package is `com.cravesapp.rider`; the activity is `com.cravesapp.MainActivity`.

## 1. Cold start under 2 s

```sh
adb shell am start -W -S -n com.cravesapp.rider/com.cravesapp.MainActivity
```

`-S` stops the app first, so each start is cold. Read **TotalTime** (ms to the first frame). Run it 5 times, pressing Home in between, and take the median.

To see when Home itself is ready, record one start with a timestamp overlay. In one terminal run `adb shell screenrecord --bugreport /sdcard/start.mp4`, then run the `am start` command above in another. Stop the recording with Ctrl-C and run `adb pull /sdcard/start.mp4`. Step through the video. Write down the overlay time from the first frame of the app to the frame where Home shows today's earnings and **Go online**.

**Pass:** median TotalTime under 2000 ms. Also record the "Home ready" time; if it is over 2 s, add a note.

## 2. An offer shows within 300 ms of arriving

The app logs every offer when it arrives: logcat tag `CravesRiderOffer`, line `offer <id> first via <fcm|locations>`. That log line is the "received" time. The Offer screen's first frame is the "shown" time. Perfetto puts both on one timeline.

1. Save this as `offer.cfg`:

   ```
   buffers { size_kb: 65536 fill_policy: RING_BUFFER }
   data_sources { config { name: "android.log" android_log_config { filter_tags: "CravesRiderOffer" } } }
   data_sources { config { name: "android.surfaceflinger.frametimeline" } }
   data_sources { config { name: "linux.ftrace" ftrace_config { atrace_categories: "gfx" atrace_categories: "view" atrace_apps: "com.cravesapp.rider" } } }
   duration_ms: 30000
   ```

2. With the app open on Home and the rider **online**, start the trace:
   `cat offer.cfg | adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/offer.pftrace`
3. Within 30 s, have dispatch (test mode) send one offer to the rider.
4. `adb pull /data/misc/perfetto-traces/offer.pftrace` and open it at https://ui.perfetto.dev.
5. Find the `offer … first via …` line in the Android logs track. In the app's frame timeline, find the first frame after it that draws the Offer screen: the first long `Choreographer#doFrame` on the main thread after the log line, then its frame in "Actual Timeline". **Shown − received** is the time from the log line to the end of that frame.
6. Repeat for 10 offers. Record each one and its channel.

Without Perfetto, a rougher check: `adb logcat -v epoch -s CravesRiderOffer` gives the received time, and `adb shell screenrecord --bugreport` gives the shown time from the overlay.

**Pass:** every one of the 10 offers is shown within 300 ms of its log line. For any that aren't, write down the time and what the phone was doing.

## 3. 200 Earnings rows scroll with under 5% janky frames

1. Open **Earnings** → **This week**. Scroll to the bottom once so all 200+ rows have loaded (the list loads 20 at a time), then go back to the top.
2. Reset the frame counters: `adb shell dumpsys gfxinfo com.cravesapp.rider reset`
3. Fling through the whole list to the bottom and back to the top at a steady pace. A finger works; for a repeatable run, use about 20 of these each way (coordinates for a 1080 × 2400 screen):
   `adb shell input swipe 540 1900 540 500 150` (down the list) and `adb shell input swipe 540 500 540 1900 150` (back up)
4. Read the result: `adb shell dumpsys gfxinfo com.cravesapp.rider` → **Total frames rendered** and **Janky frames: N (x%)**. For per-frame detail, `adb shell dumpsys gfxinfo com.cravesapp.rider framestats`, or a Perfetto trace with the `gfx` and `view` categories while scrolling.
5. Do it 3 times and take the worst run.

**Pass:** janky frames under 5% in the worst of 3 runs. Also check by eye that no row shows blank for more than a moment.

## 4. Font scale 1.3

1. `adb shell settings put system font_scale 1.3` (or Settings → Display → Font size), then reopen the app.
2. Go through: sign-in (number and code), Terms, Home offline and online, Go online, Offer, each trip step (to kitchen, at kitchen with the code, to customer, deliver with the OTP boxes, customer not answering), Trip complete, Earnings, Trip pay, Payouts, SOS, Notice, Profile, Help.
3. On each: no text cut off or overlapping, the pay and the order code still fit, the bottom action is fully visible and tappable, and nothing needs sideways scrolling.
4. Reset: `adb shell settings put system font_scale 1.0`

**Pass:** no screen with cut-off or overlapping text or an action out of reach. List any that fail, with a screenshot.

## 5. TalkBack

Turn on TalkBack (Settings → Accessibility → TalkBack). Use swipe right to move through items, and double-tap to press.

- [ ] Every button and icon says what it does. SOS says "SOS, emergency help". The header's status chip reads as text ("Offline", "Online · waiting for orders").
- [ ] Focus moves top to bottom on each screen and ends with the bottom action (before the tab bar on Home, Earnings and Profile).
- [ ] Offer: the pay, distances and route are read. The time left is announced only at 30, 20, 10 and 5 seconds, not every second. Accept and Decline can be reached and pressed.
- [ ] Trip steps: the step bar reads "Trip step N of 4". The order code is read clearly enough to match with the chef.
- [ ] Deliver: the 4 OTP boxes are one field, read digit by digit. A wrong code ("Wrong code. N tries left.") and the lock message are announced.
- [ ] Money is read as rupees. Earnings rows read the route, time, amount and badge in one go.
- [ ] SOS: Call Craves ops and Call 112 can be reached first.
- [ ] Phone setup: each check's state (done or not) is read.

**Pass:** every box ticked on both phones. Note anything read wrongly or skipped.

## Results

Build: versionCode ______ · commit ______ · date ______ · tested by ______

| | 4 GB phone | 3 GB phone |
|---|---|---|
| Model, RAM, Android, skin | | |

| Check | Target | 4 GB result | 3 GB result | Pass? |
|---|---|---|---|---|
| Cold start, median TotalTime of 5 | < 2000 ms | | | |
| Cold start, Home ready (recorded) | note if > 2 s | | | |
| Offer shown after its log line, worst of 10 | < 300 ms | | | |
| Offers by channel (fcm / locations) | record | | | |
| Earnings, janky frames, worst of 3 runs (200+ rows) | < 5% | | | |
| Font scale 1.3: screens with problems | none | | | |
| TalkBack: boxes not ticked | none | | | |

Offer timings, one row per offer:

| # | Channel | Received (log) | Shown (frame) | Shown − received (ms), 4 GB | Shown − received (ms), 3 GB |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

Keep the Perfetto traces, the gfxinfo output and the screen recordings with the results.
