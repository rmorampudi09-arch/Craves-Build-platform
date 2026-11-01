# Rider pilot go-live

How a person takes the rider fleet from "merged" to **one pilot zone live**: allow-listed riders get real orders from allow-listed kitchens, and Borzo and Pidge still take every order a rider doesn't accept in time. Nothing here is done by an agent: people run each command and press each console button. Details of every flag, table and endpoint: `BACKEND.md`.

Production since 29 Oct 2026 is subscription 34eefd95, one resource group per service (`docs/runbooks/production-environment.md`). A merge to `main` deploys each service it changes, so steps 1 to 3 need nothing run by hand. The commands below run in Azure Cloud Shell (Bash) as a subscription owner.

Until step 6, customers, chefs, Borzo and Pidge see no change: dispatch is `off`.

## 0. Before you start (once)

- [ ] **Make the repository private** (PLAN P0.1). It now holds payout, KYC and dispatch code.
- [x] **Decide the integration-service pool.** Decided (blueprint E3): 8 connections, with the Container App's maximum replicas at 1, because referral checkouts open a second transaction. The repo defaults say so (P1-16). Live settings override the repo, so on `ca-craves-integration-prod` set `SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE=8` if it is set, and max replicas to 1 (`az containerapp update -g rg-craves-integration-prod -n ca-craves-integration-prod --max-replicas 1`).
- [ ] **Have the business inputs ready:**
  - the rate card numbers;
  - the pilot zone: which kitchens and riders;
  - the rider support phone and WhatsApp group;
  - the ops leads' emails;
  - the insurance line;
  - the CA's TDS answer. TDS stays off until then.
- [ ] **Do the outside set-ups** in "Accounts and listings" below: the Firebase rider app and the APK secrets are needed before step 7.

## 1. Deploy the services (no behaviour change)

Nothing to run by hand: a merge to `main` deploys each service it changes (10 % canary, then 100 %, with automatic rollback if the new revision is unhealthy). The fleet needs order-service V41, notification-service V8, user-chef-service V20, auth-service V20 and integration-service V152 onwards, all on `main` since before the move.

## 2. Gateway

After a merge that changes `infra/apim/rider-fleet`, once that merge's integration-service revision is live, a subscription owner runs the configure line in `infra/apim/rider-fleet/README.md` ("Release") in Cloud Shell. It publishes `api/v1/rider` and `api/v1/admin/fleet` on `api.craves.in` and probes every route for 401; the same README has the read-only status line and the rollback. Last run: 31 Oct 2026, 90 routes, none failed.

Until a release's new routes are published they answer 404: for example "Share a copy of my data" in the app shows an error.

## 3. Ops console

The console (`ca-craves-admin-prod`) deploys itself with each merge that changes it. It has Riders, Fleet trips & dispatch, Rider slots & banner, **Rider pilot setup**, Rider pilot health, Rider support and Rider payouts. Until step 5 these pages show an error, because the fleet API exists only once `CRAVES_FLEET_ENABLED` is on.

## 4. Wire the runtime (`scripts/riders/rider_pilot_runtime.py`)

In Azure Cloud Shell (Bash), as a subscription owner, get `main` once per session:

```bash
D=$(mktemp -d) && git clone -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform "$D" && az account set -s 34eefd95-1a19-416f-b9df-92b326500615
```

The tool refuses any other subscription. Without `--apply` it changes nothing: it prints the plan, writes it to `rider-pilot-runtime.json`, and ends with the `--apply --expected-source-sha <commit>` to add to the same line.

1. **status** (read only): `python3 "$D/scripts/riders/rider_pilot_runtime.py" --stage status`. It lists every setting of the five services; secret values are compared, never printed. A secret kept in Key Vault is read from the service's vault (`kv-crv-<service>-34eefd`), which needs Key Vault Secrets User on it.
2. Fix each "TO DO" line in Azure. These are people steps, because they touch secrets:
   - **Shared internal secret.** integration-service `CRAVES_INTERNAL_SERVICE_KEY` must equal:
     - order-service `CRAVES_INTERNAL_SERVICE_KEY`;
     - notification-service `CRAVES_INTERNAL_SERVICE_KEY`;
     - user-chef-service `CRAVES_INTERNAL_SERVICE_SECRET`;
     - auth-service `CRAVES_INTERNAL_SERVICE_SECRET`.

     Each should be a secret reference.
   - **MSG91 phone OTP** (how riders sign in, the same as the web): auth-service `CRAVES_CENTRAL_OTP_ENABLED=true`, `MSG91_AUTHKEY` (a secret reference) and `CRAVES_MSG91_OTP_TEMPLATE_ID`.
   - **Firebase:** notification-service `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, which the customer pushes already use.
   - **Document storage:** integration-service `CRAVES_STORAGE_ENDPOINT_VALUE`, the same private storage connection user-chef-service uses for chef KYC files, as a secret reference.
   - **Bank keys:** integration-service `CRAVES_BANK_DATA_KEYS_JSON` and `CRAVES_BANK_DATA_ACTIVE_KEY_ID`. If they are missing, run the chef bank runtime release first.
   - **Warnings only:**
     - ACS email on notification-service, needed for SOS and queue alerts;
     - `OLA_MAPS_API_KEY` on user-chef-service, for road distance;
     - `CRAVES_LEDGER_POSTING_ENABLED` on integration-service, so rider pay is credited.
3. **wire**, with the real phone and emails (optionally `--support-whatsapp-url` and `--insurance-label "…"`):

   ```bash
   python3 "$D/scripts/riders/rider_pilot_runtime.py" --stage wire --support-phone +91XXXXXXXXXX --ops-alert-emails "ops@craves.in" --min-app-version 1.2.0
   ```

   Read the plan, then run the same line with the `--apply --expected-source-sha …` it prints. This sets the four internal base URLs and the support settings on integration-service, and turns on `CRAVES_REALTIME_PUSH_ENABLED` and `CRAVES_OPS_ALERT_EMAILS` on notification-service. Each app must come back healthy, or its old values are put back.

## 5. Switch the fleet on (still no orders)

`python3 "$D/scripts/riders/rider_pilot_runtime.py" --stage enable`, then the same line with the `--apply …` it prints. It sets these on integration-service:
- `CRAVES_FLEET_ENABLED`, `CRAVES_FLEET_RIDER_API_ENABLED` and `CRAVES_FLEET_LOCATION_INGEST_ENABLED` to `true`;
- `CRAVES_FLEET_TEST_MODE` to `true`, which makes the pilot zone;
- `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` to `false`.

On 30 Oct the fleet was already on in test mode (the move copied the settings), so the plan may have nothing to change. Dispatch is still `off`, so no order goes to a rider yet. Open **Rider pilot setup**: it should show dispatch Off, no rate card, and test mode on.

## 6. Set up the pilot in the console

1. **Offer rules, then the rate card.**
   1. **How orders are offered.** Under Dispatch, choose `shadow`, keep the other values, and under "How orders are offered" enter the rules. The recommended rules are in `DISPATCH.md` §7: run the replay on the pilot area first (`REPLAY.md`, "Comparing offer rules").

      | Field | Recommended |
      |---|---|
      | Riders who see an order at once | 1 |
      | Rounds of offers | 3 |
      | Fair band | 1.5 km |
      | Time a rider has to accept | 30 seconds |
      | Time Craves riders get before Borzo | 120 seconds |

      Save. Do this before the rate card: until one is published, riders have no terms, so the rules start at once. After that, every change to them needs a start at least 14 days away. Shadow offers nothing, and with no pilot kitchens yet it plans nothing. To keep the old rules (3 at once, nearest first), skip this step.
   2. **The rate card.** Under Rate card → New draft, enter the real numbers, their allowed ranges and the English summary. Telugu and Hindi lines wait for a native speaker's sign-off.
   3. **Publish it.** The first card takes effect at once. Every later card needs its start at least 14 days after publishing, and riders see it in the app as "New terms from …" until then.
2. **Riders.** One application, one decision (`FLOWS.md`).
   1. The rider installs the live APK (step 7), signs in with their phone and applies in the app: about them, the
      vehicle, the document photos, the payout account. (Riders → Add rider is only for someone at the office who can't
      apply in the app; they still sign in and finish there.)
   2. In Riders → To review, open the rider, mark each document Looks good (with its expiry date) or Needs a fix (with a
      reason), and the payout account Confirm or Return. Then press **Approve and activate**, or **Send fixes**: the rider
      sees exactly what to send again, and the application comes back to To review once they have. Confirming the payout
      account needs a platform admin, or an operations admin who is also a payments admin.
   3. Approval activates the rider (the RIDER role) and, while test mode is on, adds them to the pilot riders. If no rate
      card is published yet, the page says so; the rider waits on "Pay rates are on the way" until it is.
3. **Pilot zone.** In Rider pilot setup → Pilot zone, add each pilot kitchen by its chef ID. (Riders approved in one
   step are already there; add a rider approved before this release by hand.)

   Only orders from these kitchens are offered, and only to these riders.
4. **Shadow.** Dispatch is already `shadow` from step 1.1; if you skipped that, choose `shadow` now and save, keeping the rules. Dispatch only logs `FLEET_SHADOW` lines saying who would have been offered and at what pay. Read those lines for a day of real orders.
5. **Live.** Choose `live` and confirm. A published rate card must be in force. Keep the rules from step 1.1: changing them now needs a start 14 days away.
   - Offers ring on the pilot riders' phones. Each offer says why it came to the rider (`DISPATCH.md` §2).
   - An order no rider accepts within the fleet stage goes to Borzo, then Pidge, then the ops queue, exactly as before.
6. **Moving a rider's trip to another rider (optional).** Ops can give a trip before pickup to another rider only once order-service from the same release is live and the contract migration's PR (the one that drops `trip_chef_sub_order_id_key`) is merged and deployed. Then set `CRAVES_FLEET_RIDER_HANDOVER_ENABLED=true` on integration-service (an app setting, like the flags in step 5). Until then, Reassign offers Borzo, Pidge or cancel for a rider's trip, as before.

## 7. The rider APK

1. Register the rider app in Firebase and add the GitHub secrets (see "Accounts and listings").
2. Run the GitHub workflow "Craves Rider APK" by hand on `main`. `api_mode` is `live` by default, and a live run anywhere but `main` stops.
3. Install `craves-rider-live-<sha>.apk` from the run's artifact, or share it through Firebase App Distribution or Play internal testing (`RELEASE.md`).
4. Run the phone tests in `PHONE-TESTS.md` before the first live order.
5. Drill SOS and support once with a pilot rider: press SOS in the app, check the ops lead gets the email with the full phone and a map link, and that the console's Rider support page shows the press as emailed. Then report a problem from the app, and acknowledge and fix it on the same page.

A mock APK, from a pull request or a manual run with `mock`, shows "Demo data" on every screen and never talks to Craves.

## 8. Switches that stay off until their check

The pilot goes live without these. Each is off and waits for a check that a person makes; turn one on only after its check passes. Details are in the plan item.

| Switch | When it is on | Turn it on when | Plan |
|---|---|---|---|
| `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED` | Trip steps may use the shift credential, so the app (this release) keeps them in its native outbox, which sends them after a swipe, a kill or a reboot. | The security review is done and the rider APIM runs this release (step 2, again if it was published before), which adds the `trip` policy. Then run PHONE-TESTS §3's native-outbox rows. | P2-01, P2-02 |
| `CRAVES_FLEET_CALLBACK_UPLOADS_ENABLED` | Phones drop the shift-long wake lock and upload when a location batch arrives. | PHONE-TESTS §1 has run both ways on the same phones and battery per hour is no worse. Before any Play rollout beyond internal testing. | P2-10 |
| `CRAVES_FLEET_PRIVACY_NOTICE_VERSION` and `CRAVES_FLEET_PRIVACY_NOTICE_URL` | Riders read and accept the privacy notice before anything else, never mid-shift. `{language}` in the URL becomes `en`, `te` or `hi`. | The lawyer's text is published at the URL and the rider APIM runs this release (the accept route). Then PHONE-TESTS §5. Before 13 May 2027. | P2-09 |
| `CRAVES_FLEET_PHOTO_RETENTION_ENABLED` | The daily job deletes selfies after 30 days and delivery photos after 90, except flagged or disputed ones. | The lawyer agrees the periods, and a week of `FLEET_PHOTO_RETENTION` log lines shows the due counts you expect. Before 13 May 2027. | P2-09 |
| `ORDER_HANDED_OVER` in order-service's `CRAVES_DOMAIN_EVENT_ENABLED_TYPES` | The chef's "handed over" keeps the trip with its rider: the watchdog never hands it back. | integration-service and then order-service run this release, and the `integration-service-chef-accepted` subscription lets the event through. **Add** it to the list and keep every type already there; unset means `CHEF_ACCEPTED_ORDER`, so then set `CHEF_ACCEPTED_ORDER,ORDER_HANDED_OVER`. | P2-05 |
| `CRAVES_FLEET_RIDER_HANDOVER_ENABLED` | Ops can give a trip before pickup to another rider. | Step 6.6. | P2-06 (f) |
| `CRAVES_FLEET_ROAD_RANKING_ENABLED` | Of the 5 nearest riders by straight line, the 3 nearest by road get the offer. Pickup pay still uses the straight line, as the terms say. | The `pickup_detour` query on Rider pilot health fires. | P3-06 |
| `CRAVES_FLEET_IDLE_POLL_SECONDS` (default 10, kept within 5 to 30) | How often an idle online phone calls in, which also rings offers FCM missed. | Lower it only if the offer receipts show late rings on a brand. | P2-04 |
| Telugu and Hindi (`REVIEWED_LANGUAGES` in the app: a new APK) | Riders can pick the language, and notifications follow it. | PHONE-TESTS §4 signs the language off. | P2-08 |
| `CRAVES_FLEET_RIDER_CHOICES_ENABLED` | Riders can take a 5 to 60 minute break while online, set the farthest ride to a kitchen and to a customer they want offers for, and head home for an hour hearing only of orders that take them nearer home (`DISPATCH.md` §4). | The gateway runs this release (step 2 again: it adds `/shift/pause`, `/shift/resume`, `/preferences`, `/home-spot` and `/shift/heading-home`), and the lawyer has read the wording. Then PHONE-TESTS §6, steps 3, 4 and 6. | P4-02, P5-01 |
| `CRAVES_FLEET_ENGINE_MODE` (`off`, `shadow`, `live`) | The fleet engine (Phase 5) hears every rider and order. In shadow it only compares its rankings with dispatch's; live, dispatch asks it first and ranks riders itself when it doesn't answer within 300 ms. Both need road ranking off: with `CRAVES_FLEET_ROAD_RANKING_ENABLED` on, dispatch leaves the engine out. | §9. | P5-02, P5-03 |
| `CRAVES_FLEET_ENGINE_JOINT` | With the engine live, orders asked at the same moment near each other are shared out together, so more of them get a rider. | `jointChanged` (orders whose riders sharing out together would change, against first come; counted in shadow and live) is 5% or more of peak orders for two weeks (the query in §9, step 6), and riders had 14 days' notice (*legal*: it changes who gets offers). | P5-02 |
| `CRAVES_FLEET_ETA_MODE` (`off`, `shadow`, `live`) and `CRAVES_FLEET_ETA_MODEL_VERSION` | The travel-time model (Phase 5): live, the offer shows the model's minutes and the chef's "rider arrives at" uses them. Riders are ranked by its minutes only where the dispatch policy's "rank by travel time" rule says so (an offer rule, below). Shadow only logs what it would change. | §10. | P5-07 |
| Offer rules (in the dispatch policy, not a switch) | How many riders see an order at once, the rounds, fair turns (`DISPATCH.md` §2 and §3), and from Phase 5 whether riders are ranked by travel time (§10, step 6). | Before the first rate card, set them at once (step 6.1.1). After it, only with a start at least 14 days away: the console asks for one, and riders see the new rules under Terms meanwhile. Change them only when the pilot-health queries in `DISPATCH.md` §7 say so. | P4-01 |

- **Notice first.** Once dispatch is live, road ranking changes who gets offers, and `ORDER_HANDED_OVER` changes when a trip is taken away. Give riders 14 days' notice before any of them (*legal*; WORKPLAN rule 9). The offer rules enforce their own notice. Rider choices only add freedoms, but tell riders before turning them on.
- **How to set one** (Cloud Shell, as in §4): `az containerapp update -g rg-craves-integration-prod -n ca-craves-integration-prod --set-env-vars NAME=value` (order-service: `-g rg-craves-order-prod -n ca-craves-order-prod`). Wait for the new revision to be healthy, then run the runtime tool's **status** stage (§4): it lists every switch above. Run status again after that service's next release, to see the setting stayed. To undo, set it back to `false`, or remove a notice setting with `--remove-env-vars NAME`.

## 9. The fleet engine (Phase 5)

The engine (`services/fleet-engine`, `SCALE.md`) keeps every online rider in Redis and ranks riders for orders by the same rules as dispatch, in milliseconds and in parallel per map block. Postgres stays the record: dispatch still makes every offer, and one ACTIVE offer per rider still holds. Each step needs the one before, and before each one, Used Memory Percentage on the cache is under 50% (`infra/fleet-engine/README.md`, "Before you start"). Road ranking stays off throughout. The engine logs `NAME key=value` lines, like the other services.

The pilot doesn't need the engine. Its deploy files (`azure-pipelines-fleet-engine.yml`, `infra/fleet-engine`) and the app names below still name the old production: port them to the production of 29 Oct before step 2.

1. **integration-service with Phase 5** (step 1 deploys it). The mode stays unset, so the engine is off and nothing changes.
2. **Deploy the engine** with `azure-pipelines-fleet-engine.yml`, by `infra/fleet-engine/README.md`. Its `FLEET_ENGINE_STARTED` line must show `redisShards=1`. With more shards, stop here (`SCALE.md`, "When to grow").
3. **Shadow.** `az containerapp update -g rg-craves-integration-prod -n ca-craves-integration-prod --set-env-vars CRAVES_FLEET_ENGINE_MODE=shadow`. Riders and offers don't change. Watch:
   - integration-service logs `FLEET_ENGINE_FEED pings=... failed=0 dropped=0` each minute while riders are online;
   - the engine logs `FLEET_ENGINE_STATS` each minute, each figure for that minute, with `riderEvents` above 0 while riders are online;
   - for each order dispatch ranks, in each round, the engine logs `FLEET_ENGINE_SHADOW` with `agree=same`, `agree=same_set` (the same riders in another order) or `agree=differ`.
4. **Shadow passes** after 7 days and at least 100 ranked orders, when all of these hold:
   - `differ` is under 2% of orders;
   - each `differ` you look at has an explanation, such as a rider whose phone went quiet between the two rankings;
   - `failed` and `dropped` stay 0;
   - Used Memory Percentage on the cache stays under 50%.

   This Log Analytics query counts the outcomes per day, one per order (its first round):
   ```kusto
   ContainerAppConsoleLogs_CL
   | where ContainerAppName_s == "ca-craves-fleet-engine-prodlow" and Log_s has "FLEET_ENGINE_SHADOW"
   | extend agree = extract('agree=([a-z_]+)', 1, Log_s), round = toint(extract(' round=([0-9]+)', 1, Log_s))
   | where round == 1
   | summarize orders = count() by agree, day = bin(TimeGenerated, 1d)
   ```
5. **Live**, once the dispatch policy is live: set the mode to `live`. The rules and the riders who get offers stay what shadow showed. Live only makes ranking faster and stops two orders asked at once from choosing the same rider. So it needs no notice, but tell riders it is running. Watch:
   - `FLEET_ENGINE_STATS` `replyP99Ms` under 50;
   - `FLEET_ENGINE_FALLBACK` lines: a few a day at most;
   - `FLEET_ENGINE_FOUND_NOBODY`: none, otherwise go back to shadow and look.
6. **Joint** (`CRAVES_FLEET_ENGINE_JOINT=true`) only by its row in §8: it changes who gets offers. The engine counts `jointChanged` in shadow and live alike, so the two weeks can run before or after step 5. This query gives its share of the orders ranked at the lunch and dinner peaks, per day:
   ```kusto
   ContainerAppConsoleLogs_CL
   | where ContainerAppName_s == "ca-craves-fleet-engine-prodlow" and Log_s has "FLEET_ENGINE_STATS"
   | where hourofday(datetime_add('minute', 330, TimeGenerated)) in (12, 13, 14, 19, 20, 21)
   | extend requests = tolong(extract(' requests=([0-9]+)', 1, Log_s)), changed = tolong(extract(' jointChanged=([0-9]+)', 1, Log_s))
   | summarize requests = sum(requests), changed = sum(changed) by day = bin(TimeGenerated, 1d)
   | extend percent = round(100.0 * changed / requests, 1)
   ```
7. **Stop:** set the mode to `off`. With its next revision, integration-service no longer writes to Redis and dispatch ranks riders itself, as before Phase 5. `CRAVES_ALERT alert=FLEET_ENGINE_PAUSED` means live dispatch stopped asking for 30 s after five failures and ranked riders itself meanwhile; look at the engine's log.

## 10. The travel-time model (Phase 5)

The model predicts the minutes a rider needs to reach the kitchen, and from the kitchen to the customer, from Craves's own delivered trips (`DISPATCH.md` §2, "The travel-time model"; `ml/fleet-eta/README.md`). It needs no new service: integration-service (step 1) already has V174, which keeps model versions in `fleet_schema.eta_model`, and the fleet engine (§9) reads the same version from Redis. It works with or without the engine.

1. **Wait for data.** Training needs at least 500 delivered legs: a few weeks of live pilot trips.
2. **Train and publish a version** (a person with a read-only and an admin database login; `ml/fleet-eta/README.md`, steps 1 to 4). `python -m fleet_eta train` writes no model, so there is nothing to publish, unless it beats today's rule on trips and riders it never trained on. It prints `FLEET_ETA_VERDICT minutes=… ranking=…`: the ranking verdict says whether the version may also decide who hears first.
3. **Shadow for a week.** On integration-service, set `CRAVES_FLEET_ETA_MODEL_VERSION=<the version>` and `CRAVES_FLEET_ETA_MODE=shadow`, as the switches in §8. Nothing riders or chefs see changes. Watch:
   - `FLEET_ETA_LOADED version=… ranking=…` once after the revision starts. `CRAVES_ALERT alert=FLEET_ETA_MODEL_MISSING` or `FLEET_ETA_MODEL_REFUSED` means the version isn't in the table or can't be read: dispatch keeps today's rule.
   - `FLEET_ETA_SHADOW … same=` per order: how often the model would ask someone else first.
4. **Live:** set `CRAVES_FLEET_ETA_MODE=live`. The offer card's "About N min" and the chef's arrival time then come from the model. Who hears first doesn't change, so no notice is needed for this step; `FLEET_ETA_SHADOW` keeps logging.
5. **Before ranking by it,** all of these:
   - the version's ranking verdict is `better` (`FLEET_ETA_LOADED … ranking=better`);
   - the rider app release that words the rule is on riders' phones (P5-07: "soonest first" in Terms and on offers; an older app shows the Terms' summary of the change but no reason line);
   - the lawyer has read the wording (*legal*).
6. **Rank by travel time:** in the console, Rider pilot setup → Dispatch, tick "Rank by travel time" and save with a start at least 14 days away (the console asks for one). Riders see it under Terms as an upcoming rule meanwhile (Telangana s.13(2); WORKPLAN rule 9). From that start, the riders who can reach the kitchen soonest hear first, the offer says so, and with the engine live it ranks with the same version. If no live version may rank, riders are ranked by distance and `CRAVES_ALERT alert=FLEET_ETA_NOT_RANKING` appears: publish a version that passes, or schedule the rule off.
7. **Each month,** check the model on the last month's trips (`python -m fleet_eta evaluate`, `DISPATCH.md` §8). If it no longer beats today's rule, retrain it, and publish and shadow the new version the same way.
8. **Stop:** set the mode to `off`, or the version back to the previous one. Old versions stay in the table. Ranking falls back to distance at once; the policy rule stays until a new version, with notice, takes it out.

## Stopping

| What | How | Effect |
|---|---|---|
| Stop new offers now | Rider pilot setup → **Stop dispatch now** | Immediate, no restart. Running trips finish. Scheduled dispatch versions are withdrawn. Borzo and Pidge take every order. |
| Remove one rider or kitchen | Rider pilot setup → Pilot zone → Remove | Immediate. |
| Switch the whole fleet off | After stopping dispatch and letting trips finish, in Cloud Shell (§4): `python3 "$D/scripts/riders/rider_pilot_runtime.py" --stage disable`, then the same line with the `--apply …` it prints | The rider API and the console's fleet pages go away. Wiring is kept, so **enable** brings it back. |
| Take the gateway routes away | The rollback line in `infra/apim/rider-fleet/README.md` (Cloud Shell) | The app and console get 404. |
| Take the fleet engine out | integration-service `CRAVES_FLEET_ENGINE_MODE=off` (§9); then, if wanted, delete its app (`infra/fleet-engine/README.md`) | With the new revision, dispatch ranks riders itself, as before Phase 5. Nothing is lost: Postgres has everything. |
| Stop ranking by the travel-time model | integration-service `CRAVES_FLEET_ETA_MODE=off` (§10) | With the new revision, riders are ranked by distance again (an alert says so while the policy still asks for travel time), and offers show minutes at 20 km/h. |

## Accounts and listings

| Where | What to do | Needed for |
|---|---|---|
| **MSG91** (your existing account) | Riders sign in with the same phone OTP as the web: the app calls auth-service, which sends the SMS by MSG91 and checks the code. Nothing new is needed if web sign-in works today: the same auth key, the same DLT-registered sender ID and the same approved OTP template. Check the template's wording suits riders too (it should just say "<code> is your Craves verification code"); if you want a rider-specific text, register a new DLT template and put its MSG91 template ID in `CRAVES_MSG91_OTP_TEMPLATE_ID` (it is one setting for all phone sign-ins). Keep enough SMS credit for the pilot riders. | Rider sign-in |
| **Firebase** (the same project as the customer app, the one auth-service's `FIREBASE_PROJECT_ID` names) | Add an Android app with package `com.cravesapp.rider` and download its `google-services.json` into the GitHub secret `RIDER_GOOGLE_SERVICES_JSON`. Firebase does not send rider SMS: after the MSG91 code is checked, auth-service gives the app a Firebase sign-in token, and Firebase Messaging rings offers. No SHA fingerprints are needed for this. | Sign-in session, offer pushes |
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
