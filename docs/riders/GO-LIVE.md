# Rider pilot go-live

How a person takes the rider fleet from "merged" to **one pilot zone live**: allow-listed riders get real orders from allow-listed kitchens, and Borzo and Pidge still take every order a rider doesn't accept in time. Nothing here is done by an agent: people run each command and press each console button. Details of every flag, table and endpoint: `BACKEND.md`.

Production since 29 Oct 2026 is subscription 34eefd95, one resource group per service (`docs/runbooks/production-environment.md`). A merge to `main` deploys each service it changes, so steps 1 to 3 need nothing run by hand. The commands below run in Azure Cloud Shell (Bash) as a subscription owner.

Until step 6, customers, chefs, Borzo and Pidge see no change: dispatch is `off`.

## 0. Before you start (once)

- [ ] **Make the repository private** (PLAN P0.1). It now holds payout, KYC and dispatch code.
- [x] **Decide the integration-service pool.** Decided (blueprint E3): 8 connections, with the Container App's maximum replicas at 1, because referral checkouts open a second transaction. The repo defaults say so (P1-16). Since 29 Oct integration-service has its own Postgres (`pg-craves-integration-prod`, 859 connections) and runs 2 to 10 replicas, which the fleet jobs tolerate (they lock per trip), so nothing needs changing.
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

The console (`ca-craves-admin-prod`) deploys itself with each merge that changes it. It has Riders, Fleet trips & dispatch, Rider banner (slots removed in 1.3.4), **Rider pilot setup**, Rider pilot health, Rider support and Rider payouts. Until step 5 these pages show an error, because the fleet API exists only once `CRAVES_FLEET_ENABLED` is on.

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
- `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` to `false`.

It leaves test mode as it is. Decided on 1 Nov 2026: production runs with test mode off (`CRAVES_FLEET_TEST_MODE=false`), so, as with Swiggy and Zomato, any approved rider near a kitchen can get its orders. With test mode on, only the riders and kitchens listed under Rider pilot setup → Pilot zone can.

On 30 Oct the fleet was already on (the move copied the settings), so the plan may have nothing to change. Dispatch is still `off`, so no order goes to a rider yet. Open **Rider pilot setup**: it should show dispatch Off, no rate card, and test mode off.

## 6. Set up the pilot in the console

1. **Offer rules, then the rate card.**
   1. **How orders are offered.** Under Dispatch, choose `shadow` and save. Since 1 Nov 2026 the values are built in (`DISPATCH.md` §7; since 11 Nov 2026 they are the owner's riders-first rule): the console shows them and asks only for the mode, and the API fills in any value it isn't sent.

      | Field | Built in |
      |---|---|
      | Riders who see an order at once | 1 |
      | Rounds of offers | No limit: riders are asked again |
      | Fair band | 1.5 km |
      | Time a rider has to accept | 20 seconds |
      | Time Craves riders get before Borzo | 300 seconds (5 minutes) |

      These hand out an order one rider at a time, a short window each, then the next rider (DoorDash, Wolt and Gojek publish this; Swiggy and Zomato assign automatically), and keep it with Craves riders for the whole 5 minutes before Borzo is asked. Save. Do this before the rate card: until one is published, riders have no terms, so the rules start at once. After that, every change to them needs a start at least 14 days away. Shadow offers nothing; it only logs who would have been offered.
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
3. **Pilot zone (only while test mode is on).** In Rider pilot setup → Pilot zone, add each pilot kitchen by its chef ID.
   (Riders approved in one step are already there; add a rider approved before this release by hand.) Then only orders
   from these kitchens are offered, and only to these riders. With test mode off, skip this step.
4. **Shadow.** Dispatch is already `shadow` from step 1.1; if you skipped that, choose `shadow` now and save, keeping the rules. Dispatch only logs `FLEET_SHADOW` lines saying who would have been offered and at what pay. Read those lines for a day of real orders.
5. **Live.** Choose `live` and confirm. A published rate card must be in force. Keep the rules from step 1.1: changing them now needs a start 14 days away.
   - Offers ring on the pilot riders' phones. Each offer says why it came to the rider (`DISPATCH.md` §2).
   - An order no rider accepts within the fleet stage goes to Borzo, then Pidge, then the ops queue, exactly as before.
6. **Moving a rider's trip to another rider (optional).** Ops can give a trip before pickup to another rider only once order-service from the same release is live and the contract migration's PR (the one that drops `trip_chef_sub_order_id_key`) is merged and deployed. Then set `CRAVES_FLEET_RIDER_HANDOVER_ENABLED=true` on integration-service (an app setting, like the flags in step 5). Until then, Reassign offers Borzo, Pidge or cancel for a rider's trip, as before.

## 7. The rider APK

1. Register the rider app in Firebase and add the GitHub secrets (see "Accounts and listings").
2. Run the GitHub workflow "Craves Rider APK" by hand on `main`. `api_mode` is `live` by default, and a live run anywhere but `main` stops.
3. Install `craves-rider-live-<sha>.apk` from the run's artifact, or share it through Firebase App Distribution or Play internal testing (`RELEASE.md`).
4. Run the phone tests in `PHONE-TESTS.md` before the first live order. From app 1.3.0, Phone setup asks each rider to let offers show over the lock screen (Android 14+): a Play release needs the `USE_FULL_SCREEN_INTENT` declaration in Play Console. Offers ring until answered or until they expire, with Craves's own sound. Once riders have 1.3.0, set `CRAVES_FLEET_MIN_APP_VERSION=1.3.0` on integration-service. App 1.3.1 checks each selfie for one clear face on the phone and fixes Phone setup rows that stayed red (battery, precise location); once riders have it, set 1.3.1 instead. App 1.3.2 leaves a trip that was cancelled or taken away, reads sign-in codes with no tap once §11 is done, and brings the new splash and the Craves Riders name and icon; once riders have it, set 1.3.2.
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
| `CRAVES_FLEET_OPS_ASSIGN_PUSH_ENABLED` | The rider ops gave an order to hears their phone ring at once, not on the next location call. | Every pilot rider has the app build that rings on `TRIP_ASSIGNED` (the first build after 1.4.1; an older app drops the push, so the phone stays silent as today). Then PHONE-TESTS §2's "Ops gives an order" checks. | R22 item 15 |
| `CRAVES_FLEET_DOUBLE_HOLD_ALERT_ENABLED` | Every 5 minutes integration-service looks for an order a rider and a courier (or a second rider) both hold and logs `CRAVES_ALERT alert=FLEET_DOUBLE_HOLD`. It only reads. | The `FLEET_DOUBLE_HOLD` rule of `infra/monitoring/silent-failure-alerts.bicep` is deployed, so the line reaches a person. Before the first live order. | 1-12 |
| `CRAVES_FLEET_ROAD_RANKING_ENABLED` | Of the 5 nearest riders by straight line, the 3 nearest by road get the offer. Pickup pay still uses the straight line, as the terms say. | The `pickup_detour` query on Rider pilot health fires. | P3-06 |
| `CRAVES_FLEET_IDLE_POLL_SECONDS` (default 10, kept within 5 to 30) | How often an idle online phone calls in, which also rings offers FCM missed. | Lower it only if the offer receipts show late rings on a brand. | P2-04 |
| Telugu and Hindi (`REVIEWED_LANGUAGES` in the app: a new APK) | Riders can pick the language, and notifications follow it. | PHONE-TESTS §4 signs the language off. | P2-08 |
| `CRAVES_FLEET_RIDER_CHOICES_ENABLED` | Riders can take a 5 to 60 minute break while online, set the farthest ride to a kitchen and to a customer they want offers for, and head home for an hour hearing only of orders that take them nearer home (`DISPATCH.md` §4). | The gateway runs this release (step 2 again: it adds `/shift/pause`, `/shift/resume`, `/preferences`, `/home-spot` and `/shift/heading-home`), and the lawyer has read the wording. Then PHONE-TESTS §6, steps 3, 4 and 6. | P4-02, P5-01 |
| `CRAVES_FLEET_ENGINE_MODE` (`off`, `shadow`, `live`) | The fleet engine (Phase 5) hears every rider and order. In shadow it only compares its rankings with dispatch's; live, dispatch asks it first and ranks riders itself when it doesn't answer within 300 ms. Both need road ranking off: with `CRAVES_FLEET_ROAD_RANKING_ENABLED` on, dispatch leaves the engine out. | §9. | P5-02, P5-03 |
| `CRAVES_FLEET_ENGINE_JOINT` | With the engine live, orders asked at the same moment near each other are shared out together, so more of them get a rider. | `jointChanged` (orders whose riders sharing out together would change, against first come; counted in shadow and live) is 5% or more of peak orders for two weeks (the query in §9, step 6), and riders had 14 days' notice (*legal*: it changes who gets offers). | P5-02 |
| `CRAVES_FLEET_ETA_MODE` (`off`, `shadow`, `live`) and `CRAVES_FLEET_ETA_MODEL_VERSION` | The travel-time model (Phase 5): live, the offer shows the model's minutes and the chef's "rider arrives at" uses them. Riders are ranked by its minutes only where the dispatch policy's "rank by travel time" rule says so (an offer rule, below). Shadow only logs what it would change. | §10. | P5-07 |
| `CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER` and `CRAVES_MSG91_RIDER_OTP_TEMPLATE_ID` (auth-service) | Sign-in codes are limited per caller's address; riders' codes fill in with no tap. | §11. | R16 items 6 and 14 |
| `CRAVES_DELIVERY_READY_CORRECTION_ENABLED` | A kitchen that usually taps "ready" late gets its riders later by its middle lateness, 0 to 15 minutes, from 10 orders in 14 days; the chef's ready tap still starts the search at once. | Two to four weeks of `ready_vs_promise` (Rider pilot health) show kitchens late by minutes. | R16 10 |
| `CRAVES_FLEET_UNHEARD_NEXT_RIDER_SECONDS` (default 0, off; 15 when on) | With rounds, an offer whose phone hasn't reported ringing 15 s after it went out no longer holds up the order: the next rider hears too, the first offer stays open until it expires, and the first rider to accept gets it (`DISPATCH.md` §2, "A phone that doesn't ring"). | `offer_outcomes` shows over 20% of offers expiring unanswered for two weeks, and `offer_to_ring` / `first_channel` show phones that never rang; every rider is on app 1.1.0 or later (`CRAVES_FLEET_MIN_APP_VERSION` 1.1.0: older apps send no ring receipts); riders had 14 days' notice (*legal*: it changes who hears of an order). To undo, set it to 0. | R16 16 |
| `CRAVES_FLEET_OFFER_EXPIRY_WAKE_ENABLED` | When a rider lets an offer run out, the next rider is asked as it runs out, not up to 5 s later (`DISPATCH.md` §2). Who hears, in what order and for how long stay the same, and the same rider is still asked again only 5 s after their time ran out. | Any time dispatch is live: it needs no notice to riders and no app release. Afterwards `FLEET_OFFERED … round=` lines for an order should follow its last offer's end within a second. To undo, set it to false. | `DISPATCH.md` §2 |
| `CRAVES_FLEET_RING_RECEIPT_ENABLED` | The phone tells the server an offer reached it as it rings (`POST /offers/{offerId}/rang`), not with its next location call up to 10 s later. Who hears, in what order and for how long stay the same; nothing new is stored and nothing is counted per rider. | After the merge's revision is live and a subscription owner has published the new route (the configure line in `infra/apim/rider-fleet/README.md`). It needs no notice to riders; phones on app 1.4.1 or earlier keep reporting with their location call. Then run `PHONE-TESTS.md` §9 on the 4 test phones. To undo, set it to false: the app's call fails silently and receipts ride on the location call again. | `BACKEND.md` "Offer receipts"; `PHONE-TESTS.md` §9 |
| `CRAVES_FLEET_GPS_RULE` (`off`, the default; `shadow`; `enforce`) | `enforce`: a rider hears of an order only with a fix under 60 s old and accurate to 250 m, on top of today's rule (`DISPATCH.md` §1, "A fresher, more accurate fix"). `shadow`: nobody's offers change; each look that would leave a rider out logs `FLEET_GPS_RULE` with counts. | 1. Set `shadow` any time dispatch is live (no notice, no app release). 2. After a week with riders on shift, read the `FLEET_GPS_RULE mode=shadow` lines: `stale`, `inaccurate` and `both` against `passing`. If more than about 1 look in 10 would leave a rider out, don't enforce: find out why first (phones standing still that send no new fix, coarse fixes indoors; PHONE-TESTS). 3. Until riders are live `enforce` may start at once; from go-live, give riders 14 days' notice with the rule worded in the app first. 4. Set `enforce`, and watch `fleet_stage_outcomes` for more orders reaching Borzo. To undo, set `off`: the next look is today's rule. | `DISPATCH.md` §1; R22 9 |
| `CRAVES_FLEET_NO_SUPPLY_FAST_PATH_ENABLED` (default false) and `CRAVES_FLEET_NO_SUPPLY_SETTLE_SECONDS` (default 3) | An order nobody was asked about, with no rider on shift in range at all, goes to Borzo about 3 s after dispatch instead of after 5 minutes. An order any rider could still hear of keeps its 5 minutes. | Before real riders are live: any time. Once they are: only after the owner has decided the wording and notice (riders are told "Borzo only after 5 minutes"; 14 days unless the owner or the lawyer says otherwise). Afterwards `fleet_stage_outcomes` shows `NO_SUPPLY`. To undo, set it to false. | `DISPATCH.md` §2, "No rider in range" |
| Search rings (no variable: a dispatch policy version with `ring_1_m`, `ring_1_seconds`, `ring_2_m`, `ring_2_seconds`; all 0, off, in every version) | Riders nearer the kitchen are asked first: within 2 km for the first 100 s, within 3.5 km until 200 s, then the whole 5 km (the values proposed). A ring with no free rider in it is passed over at once. The same fair order, 20 s each, one at a time, the same riders asked again. | Off. Before real riders are live: any time, by a new policy version with ring values (not from the console), after the replay shows pickup distance down and food wait not up. Once riders are live: first the owner's wording in the rider app ("How you get orders"), then 14 days' notice through that policy version; the table refuses less. To undo, a version with all four at 0 (notice again), or the emergency stop. | `DISPATCH.md` §2, "Search rings" |
| `CRAVES_FLEET_STAGE_SWEEPER` (`off`, the default; `shadow`; `on`) | An order whose next dispatch look never came (a lost Service Bus message) is found within about 15 s and its delivery command is sent a new message, instead of its offers stopping. `shadow`: found and logged only. Nobody's offers change. | After V197 is applied. 1. Set `shadow` for a week while dispatch is live and count `FLEET_SWEEPER_CAUGHT` lines: about none an hour is healthy; many means late or lost messages on the `delivery-command` queue. 2. Set `on`. No notice to riders and no app release. To undo, set it to `off`. | `BACKEND.md` "Dispatch chain" step 5a |
| `CRAVES_FLEET_DISPATCH_POLICY_CACHE_SECONDS` (default 0, off; 5 when on) | Each server reads the dispatch policy at most every 5 s instead of on every look at every waiting order. The emergency stop, a new version and a withdrawal then take up to 5 s to reach every server; offers made in those seconds follow the policy before. | Ops accept that the stop takes up to 5 s, and many orders wait for riders at once (the read is one small query a look, so there is little to gain before that). To undo, set it to 0. | `BACKEND.md`, "Dispatch chain" |
| Rain mode (Rider pilot setup → Rain mode) and `CRAVES_FLEET_RAIN_AUTO` | In rain: at least 45 s to accept, at most 2 rounds, the search 5 minutes earlier, the rate card's rain top-up on each offer; severe sends new orders straight to Borzo or Pidge (`DISPATCH.md`, "Rain mode"). With `CRAVES_FLEET_RAIN_AUTO=true` it also comes on by itself while rides to the door (at least 10, by at least 5 riders, in 30 minutes) run 1.3 times the model's minutes. | The gateway runs this release (step 2 again: `GET`/`PUT /rain-mode`). The owner sets the top-up, and a rate card carrying it, whose summary says what rain mode does, is published at least 14 days before rain mode's first use (*legal*). The automatic switch only once `CRAVES_FLEET_ETA_MODE=live` (§10). To stop: set the switch to Off (other servers follow within 30 s); for the automatic switch, `CRAVES_FLEET_RAIN_AUTO=false`. | R16 19 |
| `CRAVES_DELIVERY_FOOD_TIMED_DISPATCH_ENABLED` | Offers timed to the food (`DISPATCH.md` §9): the search starts when the free riders nearest the kitchen would reach it 2 minutes before the food (never earlier than 10 minutes before ready), and an order whose riders would be over 3 minutes early when it comes due waits for them. Acts only while `CRAVES_FLEET_ETA_MODE=live` with a version whose ranking passed and dispatch is live. | 500 delivered legs, a version whose ranking is `better` live (§10), `CRAVES_DELIVERY_READY_CORRECTION_ENABLED` on for two weeks, and `kitchen_wait` with most kitchens over 10 minutes at the median for two weeks. Then watch `FOOD_TIMED_DISPATCH`, `kitchen_wait` and `fleet_stage_outcomes` for a week. | R16 18 |
| `ORDER_READY_FOR_PICKUP` in order-service's `CRAVES_DOMAIN_EVENT_ENABLED_TYPES` | The chef's ready tap starts the search for a rider at once, instead of 10 minutes before the promised ready time, and the rider's free wait at the kitchen counts from the tap. | The owner says yes; then "Order events for dispatch" below. | R22 1a |
| `ORDER_CANCELLED` in order-service's `CRAVES_DOMAIN_EVENT_ENABLED_TYPES` | order-service tells integration-service a chef order was cancelled: nobody is booked, the rider's trip ends and the rider is told, and a booked Borzo or Pidge courier is cancelled (`BACKEND.md`). order-service writes it when the chef declines or does not answer in time, and when an unpaid checkout is cancelled. All three come before a courier is asked for, so until order-service has a cancel after acceptance the event only records the cancel. | The owner says yes; then "Order events for dispatch" below. Watch for `FLEET_COURIER_CANCEL_FAILED`: ops then cancel that courier by hand. | R16 11, R22 12 |
| Offer rules (in the dispatch policy, not a switch) | How many riders see an order at once, the rounds, fair turns (`DISPATCH.md` §2 and §3), and from Phase 5 whether riders are ranked by travel time (§10, step 6). | Before the first rate card, set them at once (step 6.1.1). After it, only with a start at least 14 days away: the console asks for one, and riders see the new rules under Terms meanwhile. Change them only when the pilot-health queries in `DISPATCH.md` §7 say so. | P4-01 |

- **Notice first.** Once dispatch is live, road ranking, the next rider past an unheard offer and rain mode change who gets offers and how, and `ORDER_HANDED_OVER` changes when a trip is taken away. Give riders 14 days' notice before any of them (*legal*; WORKPLAN rule 9). The offer rules enforce their own notice. Rider choices only add freedoms, but tell riders before turning them on.
- **How to set one** (Cloud Shell, as in §4): `az containerapp update -g rg-craves-integration-prod -n ca-craves-integration-prod --set-env-vars NAME=value` (order-service: `-g rg-craves-order-prod -n ca-craves-order-prod`). The apps keep their traffic on a named revision, so the new revision gets none until you move it: once it is healthy (`az containerapp revision list -g … -n … -o table`), run `az containerapp ingress traffic set -g … -n … --revision-weight <new>=100`, then `az containerapp revision deactivate -g … -n … --revision <old>`. Then run the runtime tool's **status** stage (§4): it lists every switch above. Run status again after that service's next release, to see the setting stayed. To undo, set it back to `false`, or remove a notice setting with `--remove-env-vars NAME`.

### Order events for dispatch (`ORDER_READY_FOR_PICKUP`, `ORDER_CANCELLED`)

These steps change production, so run them only on the owner's yes. No merge applies them: nothing in the repo sets `CRAVES_DOMAIN_EVENT_ENABLED_TYPES` or the subscription's rules, and the app's own default stays `CHEF_ACCEPTED_ORDER`.

1. **integration-service** runs a release with V176. An older one reads these events as chef acceptances and dead-letters them.
2. **Subscription rules.** List them:
   `az servicebus topic subscription rule list -g rg-craves-shared-prod --namespace-name sb-craves-prod-34eefd --topic-name craves-domain-events --subscription-name integration-service-chef-accepted -o table`.
   If they filter by event type (the documented rule is `event_type = 'CHEF_ACCEPTED_ORDER'`), add one rule for each event:
   `az servicebus topic subscription rule create -g rg-craves-shared-prod --namespace-name sb-craves-prod-34eefd --topic-name craves-domain-events --subscription-name integration-service-chef-accepted --name order-ready-for-pickup --filter-sql-expression "event_type = 'ORDER_READY_FOR_PICKUP'"`,
   and the same with `--name order-cancelled` and `"event_type = 'ORDER_CANCELLED'"`.
   A rule that lets through an event order-service does not publish yet changes nothing.
3. **Ready events already waiting.** order-service writes `ORDER_READY_FOR_PICKUP` on every ready tap, published or not, so rows may already be waiting (`OUTBOX_BLOCKED_EVENT_TYPE` reports them). Count them:
   `SELECT status, count(*), min(created_at) FROM order_schema.domain_event_outbox WHERE event_type = 'ORDER_READY_FOR_PICKUP' GROUP BY status;`
   Once the type is on, every `PENDING` row is published, oldest first, 20 every 5 s per replica. integration-service does nothing for an order whose search has already started, and dead-letters (after 5 tries) an event whose order has no delivery command. To leave the old rows out, mark them first:
   `UPDATE order_schema.domain_event_outbox SET status = 'DEAD', last_error = 'Skipped: written before ORDER_READY_FOR_PICKUP was enabled', updated_at = now() WHERE event_type = 'ORDER_READY_FOR_PICKUP' AND status IN ('PENDING', 'FAILED') AND created_at < now() - interval '2 hours';`
   `ORDER_CANCELLED` has no such rows: it is written only while it is on the list.
4. **The list.** Read order-service's current value (the runtime tool's **status** stage shows it) and add both types, keeping every type already there. Unset means `CHEF_ACCEPTED_ORDER`, so then set
   `CRAVES_DOMAIN_EVENT_ENABLED_TYPES=CHEF_ACCEPTED_ORDER,ORDER_READY_FOR_PICKUP,ORDER_CANCELLED` ("How to set one" above).
   To undo, set the old value back; a ready row written after that waits as in step 3.

Check in staging before production:

- **The ready tap moves `dispatch_at`.** A chef accepts an order with 30 minutes to prepare. `SELECT status, dispatch_at FROM delivery_schema.delivery_command WHERE chef_sub_order_id = '<chef order id>';` shows `SCHEDULED` and about 20 minutes ahead. The chef taps ready: within 10 s `dispatch_at` is the tap's time, the command leaves `SCHEDULED`, and the order's `ORDER_READY_FOR_PICKUP` row in `order_schema.domain_event_outbox` is `PUBLISHED`.
- **A chef's decline reaches integration-service.** A chef declines a paid order: its `ORDER_CANCELLED` outbox row is `PUBLISHED`, and `delivery_schema.order_cancelled` has the order with reason `CHEF_DECLINED`.
- **A cancelled order cancels its offer and its courier.** order-service cannot cancel an accepted order yet, so send the event by hand (Service Bus Explorer, topic `craves-domain-events`): the body of `services/order-service/src/test/resources/contracts/order-cancelled-v1.json` with a new `eventId` (also the message id) and the order's ids, custom properties `event_type=ORDER_CANCELLED` and `aggregateId=<chef order id>`, session id the chef order id. Do it once for an order with an open rider offer and once for one Borzo holds. Within 10 s: the order is in `delivery_schema.order_cancelled`; the rider's accept answers 409 `ORDER_CANCELLED`; the trip is `CANCELLED` with its offers withdrawn; `delivery_schema.courier_cancel` has the Borzo booking with `cancelled_at` set.

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

## 11. Phone sign-in: limits per caller, and codes with no tap

The pilot doesn't need these. Each setting is off until set, so a deploy changes nothing. They are auth-service settings: set one as in §8 with `-g rg-craves-auth-prod -n ca-craves-auth-prod`, and undo it with `--remove-env-vars NAME`.

| Setting | Default | What it does |
|---|---|---|
| `CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER` | empty: the caller's address is unknown, so there is no per-IP limit | The header with the caller's address. In production: `X-Azure-SocketIP`, the address of the connection Front Door received. Never `X-Azure-ClientIP`: Microsoft notes the caller can overwrite it. Set without `CRAVES_CENTRAL_OTP_FORWARDING_IPS`, auth-service refuses to start. |
| `CRAVES_CENTRAL_OTP_FORWARDING_IPS` | empty | The web server's outbound addresses, comma-separated: today `20.198.84.102` (`docs/runbooks/production-environment.md`). Every web sign-in comes from there, so for these the address the web server sends in `X-Craves-Client-Ip` counts instead: the browser's `X-Azure-SocketIP` as Front Door gave it to the web server, the only header it forwards. Anyone else's `X-Craves-Client-Ip` is ignored. A value that isn't an IP address stops auth-service from starting, and so does removing this while the header is set: remove the header first. |
| `CRAVES_MSG91_RIDER_OTP_TEMPLATE_ID` | empty: riders get the usual template | The MSG91 template for rider sign-ins. With it, the rider app reads the code with no tap. |

**The limits.** They come on top of today's 100 codes a minute for everyone and 5 an hour per phone. A refused request counts nowhere and gets `429 OTP_RATE_LIMIT`, as today.
- Sending codes: 20 an hour per address, and 10 an hour per rider app install (the app sends its install ID from this release on; no setting needed).
- Checking codes: 60 an hour per address, and 30 an hour per install. A check refused here doesn't use up one of the code's 5 tries.
- An IPv6 address counts as its /64, the block one phone or home gets.
- The install limits are advisory: the install ID comes from the app, so a script can send a new one, or none, each time. They only slow an app that misbehaves; the address, phone and global limits are the ones a script can't get round.

**Turning on the per-IP limits safely.**
1. Set `CRAVES_CENTRAL_OTP_FORWARDING_IPS=20.198.84.102`, after checking it is still the web app's outbound address. On its own it changes nothing.
2. At a quiet hour, set `CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER=X-Azure-SocketIP`. Nobody can be refused before one address has asked for 20 codes in the hour, so its first minutes are safe for a check that needs it on (auth-service reads no address without it): an `X-Azure-SocketIP` a caller writes must never reach auth-service. From a computer that isn't the web server, ask for a code for a team phone, posing as the web server:

   ```bash
   curl -sS https://api.craves.in/api/v1/auth/otp/send -H 'Content-Type: application/json' \
     -H 'X-Azure-SocketIP: 20.198.84.102' -H 'X-Craves-Client-Ip: 192.0.2.10' \
     -d '{"phoneNumber":"<team phone, 10 digits>","countryCode":"91"}'
   ```

   Its `OTP_SEND` line must say `ipKnown=true viaForwarder=false`: Front Door put the computer's own address in the header. `viaForwarder=true` means the header as sent reached auth-service, so anyone could pose as the web server and choose their address: remove the setting at once, and leave it off until Front Door or the gateway overwrites that header. Then watch the `OTP_SEND` lines (one per code the limits let through; they hold no phone, address or install) for that first hour:
   - `ipKnown=true` on every line. `false` means the header doesn't reach auth-service: nothing is limited, so the setting does nothing.
   - `viaForwarder=true` on web sign-ins. If they show `false`, all web sign-ins share the web server's 20: remove the setting at once.
   - `ipSendsThisHour` mostly 1 or 2. A number that keeps climbing across different people means the header holds one shared address, not each caller's: remove the setting.

   ```kusto
   ContainerAppConsoleLogs_CL
   | where ContainerAppName_s == "ca-craves-auth-prod" and Log_s has "OTP_SEND"
   | extend ip = extract('ipKnown=([a-z]+)', 1, Log_s), web = extract('viaForwarder=([a-z]+)', 1, Log_s),
       sends = toint(extract('ipSendsThisHour=([0-9]+)', 1, Log_s))
   | summarize codes = count(), most = max(sends) by ip, web, hour = bin(TimeGenerated, 1h)
   ```
3. Keep watching `OTP_RATE_LIMIT` refusals for a week. People on one mobile network can share an address, and then they share its 20. If real riders or customers are refused, remove the setting.

The per-IP limit holds only for callers that come through Front Door: one that can reach the gateway directly can write its own `X-Azure-SocketIP`. The phone and global limits hold either way.

**Codes with no tap for riders.**
1. Get the app's hash: `scripts/riders/app-hash.sh <keystore file> <alias>`, with the rider signing keystore (GitHub secret `RIDER_KEYSTORE_BASE64`, decoded to a file) and its alias (`RIDER_KEY_ALIAS`). It prints 11 characters, such as `FA+9qCX9VSu`. The hash comes from the key the installed app is signed with, so Play App Signing must use the existing rider key (`RELEASE.md`, Play internal testing, step 2): then Play installs and APK installs share one hash and one template. If Play signs with a key of its own, Play installs have another hash (`scripts/riders/app-hash.sh --cert deployment_cert.der`, with the certificate from Play Console, App integrity) and need their own template; there is one `CRAVES_MSG91_RIDER_OTP_TEMPLATE_ID`, so the other installs would type the code.
2. Register a new, rider-only OTP template on DLT, at most 140 characters, whose fixed text ends with the hash on its own line. For example: "{#numeric#} is your Craves Rider sign-in code. It expires in 10 minutes." then a new line and the hash. The hash is fixed text, never a variable (it can contain `+` and `/`), and the code is tagged `#numeric#`, as in the usual template.
3. Once DLT approves it, add the same text in MSG91 as an OTP template with that DLT template ID.
4. Set `CRAVES_MSG91_RIDER_OTP_TEMPLATE_ID` on auth-service to the new MSG91 template ID (24 characters). Only the rider app sends `X-Craves-App: rider`, so only its sign-ins use the new template, and only they are told to read the code with no tap. The web and older rider apps keep the usual template and the one-tap Allow sheet.
5. Sign in on a rider phone with the live APK: the code fills in by itself, with no Allow sheet. If it doesn't (a wrong hash or text), the rider can still type the code: remove the setting, fix the template and try again. A demo or debug build has another hash.

## Stopping

| What | How | Effect |
|---|---|---|
| Stop new offers now | Rider pilot setup → **Stop dispatch now** | Immediate, no restart. Running trips finish. Scheduled dispatch versions are withdrawn. Borzo and Pidge take every order. |
| Remove one rider or kitchen | Rider pilot setup → Pilot zone → Remove | Immediate. |
| Switch the whole fleet off | After stopping dispatch and letting trips finish, in Cloud Shell (§4): `python3 "$D/scripts/riders/rider_pilot_runtime.py" --stage disable`, then the same line with the `--apply …` it prints | The rider API and the console's fleet pages go away. Wiring is kept, so **enable** brings it back. |
| Stop timing offers to the food | integration-service `CRAVES_DELIVERY_FOOD_TIMED_DISPATCH_ENABLED=false` (§8) | New orders start 10 minutes before ready again; an order already waiting starts when its wait ends. |
| Stop rain mode | Rider pilot setup → Rain mode → Off; and `CRAVES_FLEET_RAIN_AUTO=false` if it came on by itself | New rounds use the usual rules within 30 s; offers already sent keep their top-up. |
| Take the gateway routes away | The rollback line in `infra/apim/rider-fleet/README.md` (Cloud Shell) | The app and console get 404. |
| Take the fleet engine out | integration-service `CRAVES_FLEET_ENGINE_MODE=off` (§9); then, if wanted, delete its app (`infra/fleet-engine/README.md`) | With the new revision, dispatch ranks riders itself, as before Phase 5. Nothing is lost: Postgres has everything. |
| Stop ranking by the travel-time model | integration-service `CRAVES_FLEET_ETA_MODE=off` (§10) | With the new revision, riders are ranked by distance again (an alert says so while the policy still asks for travel time), and offers show minutes at 20 km/h. |

## Accounts and listings

| Where | What to do | Needed for |
|---|---|---|
| **MSG91** (your existing account) | Riders sign in with the same phone OTP as the web: the app calls auth-service, which sends the SMS by MSG91 and checks the code. Nothing new is needed if web sign-in works today: the same auth key, the same DLT-registered sender ID and the same approved OTP template. Check the template's wording suits riders too (it should just say "<code> is your Craves verification code"), and that its code variable is tagged `#numeric#` on DLT: since TRAI's 18 Nov 2025 direction, untagged variables are rejected once the logging period ends, which would stop every sign-in. Codes live 10 minutes (auth-service sends `otp_expiry=10`). Alert on SMS pumping in Log Analytics (auth-service): `MSG91 OTP verified` lines ÷ `MSG91 OTP accepted` lines per hour, falling under 0.3 for an hour with more than 30 sends. A rider-only template, for codes the app reads with no tap, has its own setting (§11). Keep enough SMS credit for the pilot riders. | Rider sign-in |
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
