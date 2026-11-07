# Craves Rider: building and shipping the APK

How the rider app (`com.cravesapp.rider`) is built, signed and sent to phones. Sources: `.github/workflows/rider-apk.yml`, `apps/mobile/android/app/build.gradle`, project doc `rider-app/RIDER-PLAYBOOK.md` §6 and `rider-app/research/R8-rider-app-engineering.md` §6.

## What the workflow builds

The "Craves Rider APK" workflow runs on pull requests that touch `apps/mobile/**` and by hand (Actions → Craves Rider APK → Run workflow).

- **Signed release APK**, `assembleRiderRelease`.
- **ARM only:** `arm64-v8a` and `armeabi-v7a`. No x86 code; rider phones are ARM.
- **R8 on**, for this build only: the workflow passes `-PcravesRiderMinify=true`. The customer build never passes it and is unchanged. Keep rules are in `android/app/proguard-rules.pro`. R8 runs in compatibility mode (`-Pandroid.enableR8.fullMode=false`) until a clean phone pass on an R8 build.
- **versionCode = the workflow run number** (`-PcravesVersionCode`), so every build installs over the last one and Play accepts every upload.
- **versionName** is set in the rider flavor (`1.2.0`, the customer app keeps `1.0`) and must equal `RIDER_APP_VERSION` in `src/features/rider/riderConfig.ts`: the app sends it to the server, which compares it with `minAppVersion`, and a step fails the build when the two differ. For a release, raise both in one commit; once the APK is on the phones, pin `minAppVersion` to it (`GO-LIVE.md`, stage wire). Riders below it are blocked only between shifts.
- A check step fails the build unless the APK is signed, its versionCode is the run number, its native code is ARM only, and R8 wrote a mapping.
- The artifact **craves-rider-apk** (kept 14 days) holds `craves-rider-<mode>-<sha>.apk` and `craves-rider-<mode>-<sha>-mapping.txt`. On a pull request, a comment gives the file name, the versionCode, the mode and the size.
- **Play bundle:** a live manual run on `main` also runs `bundleRiderRelease` in the same Gradle call (same R8 output, key and versionCode). A check fails the build unless the `.aab` is signed and ARM only. The rider bundle keeps every language (no language splits), because the app shows the language the rider picked, not the phone's; the customer bundle is unchanged. The artifact **craves-rider-aab** (kept 14 days) holds `craves-rider-live-<sha>.aab` and the same mapping file.
- **Size watch:** every run compares the APK with the size kept by the last run on `main` (in the Actions cache) and prints the change. Above 5% it raises a warning and the PR comment says to check what grew: usually a new dependency, a big asset or an extra ABI. It never fails the build. Runs on `main`, mock or live, set the size the next runs compare with; until one has run, the note says so.
- **Sign-in code from the SMS:** the rider flavor declares `play-services-auth-api-phone` (SMS User Consent API, `RiderSmsCodeModule`), which Firebase Auth already puts in the APK, so the size stays put. It needs no SMS permission and no change to MSG91's template; a phone without Google Play services types the code.

Keep the mapping file of every build you hand out: it turns a crash stack trace from that build back into real class names. For a Play upload, upload it in Play Console as the deobfuscation file.

## One-tap install (the newest live build)

After every live manual run on `main`, the job **ship-rider-app** replaces the APK on the pre-release **delivery-app-latest**, so one link always installs the newest live build:

`https://github.com/rmorampudi09-arch/Craves-Build-platform/releases/download/delivery-app-latest/craves-delivery-app.apk`

- **Once per phone:** open `craves.in/rider` (the QR on the rider flyers), which redirects to this link, and add it to the home screen (Chrome ⋮ → Add to home screen). The first install asks to allow "Install unknown apps" for Chrome, and Chrome may say the file type can be harmful; choose Download anyway. The repository is public, so no GitHub sign-in is needed.
- **Every new build:** tap the icon, then Install. It updates over the last build because the signing key never changes.
- The release's title and notes name the build (version, versionCode, commit, run); the run summary prints the link. The tag `delivery-app-latest` stays on the commit where it was first made: read the notes, not the tag. Earlier builds and every mapping file stay in the run artifacts for 14 days.
- Why the names avoid "rider": one repository secret's value is `rider` (the build summary shows the package as `com.cravesapp.***`). GitHub hides a secret's value wherever it appears in logs and summaries, and drops any job output that contains it. So the job finds the APK, bundle and mapping in the downloaded artifacts instead of being told their names, and the tag and file name leave the word out so the printed link stays readable.

The step needs nothing to set up. The job has its own token (`contents: write` for the release, `id-token: write` for Play); the build job, which also runs for pull requests, stays read-only.

### Updates are required

Beside the APK, ship-rider-app writes `craves-delivery-app.json` (`{"versionName":"1.3.4","versionCode":57}`), served at `craves.in/rider/version`. A live app from 1.3.4 on reads it with `/me` (at most every 10 minutes) and takes the higher of it and the server's `minAppVersion` as the minimum.

- **Raising versionName forces the update:** every older app shows "Please update the app before your next shift" with an **Update now** button that opens `craves.in/rider`. Never during a shift or a trip (`domain/gate.ts`).
- **A rebuild with the same versionName forces nothing.** Raise the version only when riders must move to it.
- The file is written only after the APK upload succeeds, so no app asks for a version the link can't give yet.
- If the file can't be read (offline, GitHub or craves.in down), the server's `minAppVersion` alone applies. `CRAVES_FLEET_MIN_APP_VERSION` on integration-service stays the hard control, and the only one that reaches apps older than 1.3.4.

## Mock or live

| Build | API mode |
|---|---|
| Manual run | The `api_mode` input: `live` (default; only from `main`) or `mock` |
| Pull request | The repo variable `CRAVES_RIDER_API_MODE` (`mock` or `live`); `mock` when it isn't set |

- **mock:** demo data inside the app. No Firebase sign-in, no calls to the Craves API, a "Demo data" tag in the header and the demo controls (long-press the status chip). It is its own app, `com.cravesapp.rider.demo` named "Craves Rider Demo" (`-PcravesRiderDemo=true`), installed beside the real one, so a demo APK can never replace or pass for the rider app; the workflow fails a live APK whose package isn't `com.cravesapp.rider`. The live APK has no demo data, demo hints or demo panel at all.
- **live:** phone sign-in with the MSG91 OTP from auth-service (then a Firebase session, as the web does) and the Craves API at `https://api.craves.in` (`CRAVES_API_BASE_URL`). A live build fails early without `RIDER_GOOGLE_SERVICES_JSON` or `RIDER_KEYSTORE_BASE64`.

Any other value fails the build. To switch pull request builds to live, set the variable in Settings → Secrets and variables → Actions → Variables. To get the live APK riders install, run the workflow by hand on `main` (`api_mode` is `live` by default); a live run on any other branch stops, because that APK talks to production. The mode is baked into the APK: switching means installing the other APK.

## Secrets and variables

| Name | Kind | Needed for | What it is |
|---|---|---|---|
| `RIDER_GOOGLE_SERVICES_JSON` | secret | live (mock uses a placeholder for `com.cravesapp.rider.demo`) | The rider app's `google-services.json` from Firebase (package `com.cravesapp.rider`). Firebase says this file isn't secret; it is a secret here only so it stays out of the repo. |
| `RIDER_KEYSTORE_BASE64` | secret | live; mock uses a cached throwaway key without it | The rider signing keystore, base64 (`base64 -w0 rider.keystore`). |
| `RIDER_KEYSTORE_PASSWORD` | secret | with the keystore | The keystore password, also used as the key password. |
| `RIDER_KEY_ALIAS` | secret | with the keystore | The key alias (`rider` when unset). |
| `CRAVES_RIDER_API_MODE` | variable | pull request builds | `mock` or `live`. |
| `RIDER_PLAY_WIF_PROVIDER` | variable | the Play upload (optional) | The Workload Identity provider, `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`. Not a secret. |
| `RIDER_PLAY_SERVICE_ACCOUNT` | variable | the Play upload (optional) | The service account Play trusts, `<name>@<project>.iam.gserviceaccount.com`. No key file is ever made. |
| `RIDER_PLAY_RELEASE_STATUS` | variable | the Play upload (optional) | `draft` (default: waits for Start rollout after the phone check) or `completed` (rolls out to the internal testers at once). |

**Never change the rider signing key.** The app binds each rider to one phone by `ANDROID_ID` (`X-Craves-Installation-Id`), and Android gives each signing key a different `ANDROID_ID`. A build signed with another key can't install over the old one, and after a reinstall every rider's phone counts as new and needs ops approval again. That is why live builds refuse to run without the keystore secret. Keep a copy of the keystore and its password in the company password manager, not only in GitHub. The decoded key is written to the runner's temp folder, never to the Actions cache.

### "App not installed as package conflicts with an existing package"

Android shows this when the phone already has a `com.cravesapp.rider` it can't update with this APK. Three causes, all fixed by uninstalling the old copy once (the rider signs in again; trip steps still waiting on that phone are lost, so do it between trips):
- **Another signing key.** An APK built before the live key secret existed, or one built on a laptop (`riderDebug` uses the debug key). Each run of "Craves Rider APK" prints its key in the run summary ("signing key SHA-256 …"): every live build must show the same one.
- **An older build over a newer one.** The version code is the workflow's run number, and many phones (Xiaomi, Oppo, Vivo) show this same message for a downgrade. Share the newest live APK only.
- **The demo app is separate** (`com.cravesapp.rider.demo`, "Craves Riders Demo") and never conflicts with the real one.

To see which it is with adb: `adb shell dumpsys package com.cravesapp.rider | grep -E "versionCode|signatures"`, then `adb uninstall com.cravesapp.rider` and `adb install craves-rider-live-<sha>.apk`.

## Review builds: Firebase App Distribution

For reviewers and the team, not for riders on the live pilot.

1. In Firebase, open the rider Android app (`com.cravesapp.rider`) → App Distribution, and make a group such as `reviewers` (up to 200 testers a group, 500 a project).
2. Download the APK from the run's artifact and upload it, or from a terminal:
   `firebase appdistribution:distribute craves-rider-mock-<sha>.apk --app <rider Firebase app id> --groups reviewers --release-notes "<PR or change>"`.
   The workflow doesn't upload by itself yet. To automate it, use keyless Workload Identity Federation (`google-github-actions/auth`), not a stored service-account key.
3. **Builds expire after 150 days and invites after 30.** Re-invite anyone who didn't accept in time.
4. App Distribution installs count as sideloaded: Play Integrity gives them at most `MEETS_DEVICE_INTEGRITY` on Android 13+ and reports them as unlicensed. The app only logs integrity, so review builds still work.
5. Don't add the App Distribution in-app update SDK: it is beta and Play may treat it as a policy violation.

## The live pilot: Play internal testing

Riders on the live pilot install from Play's internal testing track.

- Up to **100 testers**, who must have Google accounts. Builds reach them within minutes.
- **Play Integrity works there:** Play installs get full verdicts, so integrity results mean something.
- Play updates the app for them, and the in-app updates API works (Play installs only).

**Before the first upload (start now):**

1. **Developer verification.** Register Craves as an organisation in Play Console. It needs a **D-U-N-S number, which can take up to 28 days**. Verification also keeps sideloaded and App Distribution installs working once Android enforces it (2027).
2. Create the app `com.cravesapp.rider` and turn on **Play App Signing**. Choose to **use the existing rider key** (upload it with the tool Play Console offers) instead of a key Google makes. Then Play installs and App Distribution or APK installs have the same signature and the same `ANDROID_ID`, so a rider can move between them without ops approving their phone again.
3. Fill in the app content forms Play asks for: privacy policy, data safety, and the foreground service (location) and location declarations (project doc `rider-app/research/R4-fleet-software-android.md` §4).

**Each pilot release:**

1. Play needs an Android App Bundle (`.aab`), not an APK. Run the workflow by hand on `main` with `api_mode` `live` (the default): the run's **craves-rider-aab** artifact holds `craves-rider-live-<sha>.aab` and its mapping file. The APK from the same run is the same build, for a phone check before the upload.
2. Play Console → Testing → Internal testing → Create new release → upload the `.aab` and its mapping file (as the deobfuscation file) → release notes → roll out. With the Play upload set up (below), the run does this itself: the release waits as a draft, and after the phone check you press **Start rollout**.
3. The versionCode must be higher than the last upload. The run number always grows, but it restarts at 1 if the workflow is renamed or re-created; then pass a higher number (for example the run number plus 1000).
4. Add riders to the testers list by Google account email and send them the opt-in link. They install "Craves Rider" from Play.
5. Before telling riders, run the checks in `PHONE-TESTS.md` and `PERF.md` on the build Play serves.

**The Play upload, set up once (keyless):** the job signs in with Workload Identity Federation, so there is no key file to leak or rotate.

1. Upload the **first** bundle by hand as in step 2: Play's API cannot make an app's first release.
2. In the Google Cloud project behind the rider Firebase app, enable the **Google Play Android Developer API** and the **IAM Service Account Credentials API**.
3. Make a service account, for example `rider-play-upload`, with no project roles.
4. Make a Workload Identity pool and an OIDC provider for `https://token.actions.githubusercontent.com`, mapping `google.subject=assertion.sub`, `attribute.repository=assertion.repository` and `attribute.ref=assertion.ref`, with the condition `assertion.repository == 'rmorampudi09-arch/Craves-Build-platform' && assertion.ref == 'refs/heads/main'`, so only runs on `main` of this repository can sign in.
5. On the service account, give **Workload Identity User** (`roles/iam.workloadIdentityUser`) to `principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/<pool>/attribute.repository/rmorampudi09-arch/Craves-Build-platform`.
6. In Play Console → Users and permissions, invite the service account's email, give it the app Craves Rider only, with **Release to testing tracks**.
7. Set the variables `RIDER_PLAY_WIF_PROVIDER` and `RIDER_PLAY_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions → Variables). The next live run sends the bundle and its mapping; until both are set, the step is skipped and the run summary says so.

## After an R8 build changes the keep rules

Gradle and R8 run only in CI, so the first R8 build is what proves the rules. If it fails with "Missing class", R8 writes the rules it wants to `android/app/build/outputs/mapping/riderRelease/missing_rules.txt`; check them and add them to `proguard-rules.pro`. Then on a phone, with a live R8 build:

- sign in by phone (the MSG91 SMS code), and see no "Demo data" tag (react-native-config's `BuildConfig` survived);
- go online: the "You're online" notification appears and the rider shows as seen on the ops console (the rider native modules and OkHttp);
- get an offer by push with the app closed (Firebase Messaging) and by the location call (Play services location);
- finish a trip with the OTP and with the photo.
