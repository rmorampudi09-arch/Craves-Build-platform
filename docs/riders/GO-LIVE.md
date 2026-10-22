# Rider pilot go-live

How a person takes the rider fleet from "merged" to **one pilot zone live**: allow-listed riders get real orders from allow-listed kitchens, and Borzo and Pidge still take every order a rider doesn't accept in time. Nothing here is done by an agent: people run each pipeline and press each console button. Details of every flag, table and endpoint: `BACKEND.md`.

Until step 6, customers, chefs, Borzo and Pidge see no change: every rider flag is off and dispatch is `off`.

## 0. Before you start (once)

- [ ] **Make the repository private** (PLAN P0.1). It now holds payout, KYC and dispatch code.
- [ ] **Decide the integration-service pool.** Today it is 4 connections. The recommendation is 8, with the Container App's maximum replicas at 1, because referral checkouts open a second transaction. Live settings such as `REFERRAL_DB_POOL_SIZE` override the repo.
- [ ] **Have the business inputs ready:**
  - the rate card numbers;
  - the pilot zone: which kitchens and riders;
  - the rider support phone and WhatsApp group;
  - the ops leads' emails;
  - the insurance line;
  - the CA's TDS answer. TDS stays off until then.
- [ ] **Do the outside set-ups** in "Accounts and listings" below: the Firebase rider app and the APK secrets are needed before step 7.

## 1. Deploy the services (no behaviour change)

From `main` at the merged commit, run each pipeline by hand in this order. Before each one, follow `docs/runbooks/live-runtime-safety.md`, and wait until the service is healthy before starting the next.

1. `azure-pipelines-order-service.yml`: V41, delivery code, order number in courier notes.
2. `azure-pipelines-notification-service.yml`: V8, realtime push and ops alerts (both off).
3. `azure-pipelines-user-chef-service.yml`: V20, road distance.
4. `azure-pipelines-auth-service.yml`: V20, the RIDER role.
5. `azure-pipelines-integration-service.yml`: V152 to V159 and the fleet package. All flags stay off, so no fleet bean or job starts.

## 2. Gateway

Run `azure-pipelines-rider-fleet-apim.yml` on `main` with `confirmProductionChange` ticked. It publishes `api/v1/rider` and `api/v1/admin/fleet` on `api.craves.in` and probes every route for 401. Check the result with `azure-pipelines-rider-fleet-apim-status.yml`. To undo it, run `azure-pipelines-rider-fleet-apim-rollback.yml`.

## 3. Ops console

Run `azure-pipelines-admin-dashboard.yml` by hand on `main` with:
- `deployProduction` ticked;
- `expectedReleaseSha` set to the merged commit;
- `regressionRunId` set to that commit's green "Exact-SHA complete regression evidence" run.

The console then has Riders, Rider trips, Rider slots & banner, Rider payouts and **Rider pilot setup**. Until step 5, these pages answer "The fleet service is unavailable", because the fleet API exists only once `CRAVES_FLEET_ENABLED` is on.

## 4. Wire the runtime (`azure-pipelines-rider-fleet-runtime.yml`)

1. Run it with stage **status**. It is read only, and the job output plus the `rider-pilot-runtime` artifact list every setting.
2. Fix each "TO DO" line in Azure. These are people steps, because they touch secrets:
   - **Shared internal secret.** integration-service `CRAVES_INTERNAL_SERVICE_KEY` must equal:
     - order-service `CRAVES_INTERNAL_SERVICE_KEY`;
     - notification-service `CRAVES_INTERNAL_SERVICE_KEY`;
     - user-chef-service `CRAVES_INTERNAL_SERVICE_SECRET`;
     - auth-service `CRAVES_INTERNAL_SERVICE_SECRET`.

     Each should be a secret reference.
   - **Firebase:** notification-service `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, which the customer pushes already use.
   - **Document storage:** integration-service `CRAVES_STORAGE_ENDPOINT_VALUE`, the same private storage connection user-chef-service uses for chef KYC files, as a secret reference.
   - **Bank keys:** integration-service `CRAVES_BANK_DATA_KEYS_JSON` and `CRAVES_BANK_DATA_ACTIVE_KEY_ID`. If they are missing, run the chef bank runtime release first.
   - **Warnings only:**
     - ACS email on notification-service, needed for SOS and queue alerts;
     - `OLA_MAPS_API_KEY` on user-chef-service, for road distance;
     - `CRAVES_LEDGER_POSTING_ENABLED` on integration-service, so rider pay is credited.
3. Run stage **wire** with `supportPhone`, `opsAlertEmails` and, optionally, `supportWhatsappUrl`, `insuranceLabel` and `minAppVersion`.
   1. First run it unticked, which only shows the plan.
   2. Then run it with **Apply** ticked and `expectedReleaseSha` set to the run's commit.

   This sets the four internal base URLs and the support settings on integration-service, and turns on `CRAVES_REALTIME_PUSH_ENABLED` and `CRAVES_OPS_ALERT_EMAILS` on notification-service. Each app must come back healthy, or its old values are put back.

## 5. Switch the fleet on (still no orders)

Run stage **enable** with Apply ticked. It sets these on integration-service:
- `CRAVES_FLEET_ENABLED`, `CRAVES_FLEET_RIDER_API_ENABLED` and `CRAVES_FLEET_LOCATION_INGEST_ENABLED` to `true`;
- `CRAVES_FLEET_TEST_MODE` to `true`, which makes the pilot zone;
- `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` to `false`.

Dispatch is still `off`, so no order goes to a rider yet. Open **Rider pilot setup**: it should show dispatch Off, no rate card, and test mode on.

## 6. Set up the pilot in the console

1. **Rate card.**
   1. Under Rate card → New draft, enter the real numbers, their allowed ranges and the English summary. Telugu and Hindi lines wait for a native speaker's sign-off.
   2. Publish it. The first card takes effect at once; every later card needs its start at least 14 days after publishing, and riders see it in the app as "New terms from …" until then.
2. **Riders.**
   1. In Riders → New rider, add each pilot rider.
   2. The rider installs the live APK (step 7), signs in with their phone and sends their documents.
   3. Ops approves the documents with their expiry dates, sets the vehicle, and sets the payout account in person.
   4. Ops activates the rider with **Restore**, which grants the RIDER role.
3. **Pilot zone.** In Rider pilot setup → Pilot zone:
   - add each pilot rider;
   - add each pilot kitchen by its chef ID.

   Only orders from these kitchens are offered, and only to these riders.
4. **Shadow.** Under Dispatch, choose `shadow` and save. Dispatch now only logs `FLEET_SHADOW` lines saying who would have been offered and at what pay. Read those lines for a day of real orders.
5. **Live.** Choose `live` and confirm. A published rate card must be in force.
   - Offers ring on the pilot riders' phones.
   - An order no rider accepts within the fleet stage goes to Borzo, then Pidge, then the ops queue, exactly as before.

## 7. The rider APK

1. Register the rider app in Firebase and add the GitHub secrets (see "Accounts and listings").
2. Run the GitHub workflow "Craves Rider APK" by hand on `main`. `api_mode` is `live` by default, and a live run anywhere but `main` stops.
3. Install `craves-rider-live-<sha>.apk` from the run's artifact, or share it through Firebase App Distribution or Play internal testing (`RELEASE.md`).
4. Run the phone tests in `PHONE-TESTS.md` before the first live order.

A mock APK, from a pull request or a manual run with `mock`, shows "Demo data" on every screen and never talks to Craves.

## Stopping

| What | How | Effect |
|---|---|---|
| Stop new offers now | Rider pilot setup → **Stop dispatch now** | Immediate, no restart. Running trips finish. Scheduled dispatch versions are withdrawn. Borzo and Pidge take every order. |
| Remove one rider or kitchen | Rider pilot setup → Pilot zone → Remove | Immediate. |
| Switch the whole fleet off | Runtime pipeline stage **disable**, after stopping dispatch and letting trips finish | The rider API and the console's fleet pages go away. Wiring is kept, so **enable** brings it back. |
| Take the gateway routes away | `azure-pipelines-rider-fleet-apim-rollback.yml` | The app and console get 404. |

## Accounts and listings

| Where | What to do | Needed for |
|---|---|---|
| **Firebase** (the same project as the customer app, the one auth-service's `FIREBASE_PROJECT_ID` names) | Add an Android app with package `com.cravesapp.rider`, and add the SHA-1 and SHA-256 of the rider signing key. Download its `google-services.json` into the GitHub secret `RIDER_GOOGLE_SERVICES_JSON`. Phone sign-in is already on for customers; riders use the same Firebase phone OTP, so Firebase sends the rider SMS. **No MSG91 or DLT template is needed for riders.** | Sign-in, offer pushes |
| **GitHub** (repo secrets) | `RIDER_KEYSTORE_BASE64`, `RIDER_KEYSTORE_PASSWORD`, `RIDER_KEY_ALIAS` for one fixed rider signing key. Keep the key safe and never change it: the phone binding depends on it. | Live APK |
| **Google Play Console** (when going beyond side-loaded APKs) | New app "Craves Rider" (`com.cravesapp.rider`) with Play App Signing; upload with the same key. Fill in the Data safety form (location, photos, phone number), the foreground-service location declaration with a short video of going online, the privacy policy URL and the content rating. Start on internal testing. | Store distribution |
| **Azure** | The secrets in step 4. ACS email for ops alerts (notification-service may already have it). | Wiring |
| **Ola Maps** | The existing `OLA_MAPS_API_KEY` must allow the Directions API. | Road distance |
| **Bank** | Bulk-payment (file upload) access on Craves' current account. The weekly rider payout file is uploaded by hand. Check the file format with the bank before the first payout. RazorpayX is not used. | Payouts |
| **Insurer** | A group accident cover for pilot riders. Put its one-line label in the wire stage and the claim phone in the support phone. | Rider profile, claims |
| **Telangana gig-worker rules** (your lawyer) | Aggregator registration under the state Act. The console's joins-and-exits CSV is the government-portal export. The lawyer also signs off the terms, the notice wording, the Telugu and Hindi text, and the white-plate bike question. | Legal |
| **CA** | The TDS section, rate and yearly threshold for rider pay, and a TAN if Craves doesn't have one. Then set `CRAVES_FLEET_TDS_*` in Azure. | Tax |
| **Support** | A phone line riders can call, and a WhatsApp group. | Wire stage |
| **Borzo, Pidge** | Nothing new. Riders only take orders first; the existing accounts take the rest. | Fallback |
