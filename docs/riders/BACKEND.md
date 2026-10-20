# Rider backend (integration-service, package `in.craves.integration.fleet`)

The rider fleet runs inside integration-service with its own schema, `fleet_schema`, in the integration database. Plan: project doc `rider-app/PLAN.md`. Contracts: `contracts/openapi/rider-v1.yaml` (rider app) and `contracts/openapi/admin-fleet-v1.yaml` (ops console).

## Flags

Environment flags only switch code paths on. All are off by default.

| Variable | What it switches on |
|---|---|
| `CRAVES_FLEET_ENABLED` | Every fleet bean: admin API, policy readers, test mode, storage, the RIDER role client, the fleet scheduler pool, the daily export job, slot settlement, and dispatch (the fleet stage, the `craves_fleet` adapter, the dispatch tick). Off means no fleet bean or job exists (`FleetConfigurationTest`). |
| `CRAVES_FLEET_RIDER_API_ENABLED` | The rider API under `/api/v1/rider` (needs `CRAVES_FLEET_ENABLED` too). |
| `CRAVES_FLEET_LOCATION_INGEST_ENABLED` | `POST /api/v1/rider/locations` and the daily `trip_track` partition job (needs the two flags above too). |
| `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` | Reserved for payout execution (P4). |

Other settings (`craves.fleet.*` in `application.yml`):

| Variable | Default | Use |
|---|---|---|
| `CRAVES_FLEET_TEST_MODE` | `true` | Dispatch touches only allow-listed riders and kitchens. |
| `CRAVES_AUTH_INTERNAL_BASE_URL`, `CRAVES_INTERNAL_SERVICE_KEY` | empty | RIDER grant and revoke in auth-service. Until both are set, no call is made and the log says `FLEET_ROLE_CLIENT_OFF`. |
| `CRAVES_STORAGE_ENDPOINT_VALUE`, `CRAVES_STORAGE_DOCUMENTS_CONTAINER` | empty, `documents` | The private container user-chef-service uses for KYC files. Rider files go under `riders/`. |
| `CRAVES_BANK_DATA_ACTIVE_KEY_ID`, `CRAVES_BANK_DATA_KEYS_JSON` | empty | The chef bank-details keys; payout accounts are encrypted with them. |
| `CRAVES_FLEET_SUPPORT_PHONE` | empty | Rider support line in `/me` and the terms. Set it before turning the rider API on. |
| `CRAVES_FLEET_SUPPORT_WHATSAPP_URL` | empty | The riders' WhatsApp group (`/me`). |
| `CRAVES_FLEET_MIN_APP_VERSION` | `1.0.0` | Blocks going online between shifts; `rider.min_app_version` overrides it per rider. |
| `CRAVES_FLEET_INSURANCE_LABEL` | empty | Insurance line on the rider's profile; claims go to the support line. |
| `CRAVES_USER_CHEF_INTERNAL_BASE_URL` | empty | user-chef-service root, for the drop's road distance (`POST /internal/v1/maps/road-distance`). Unset: straight line × 1.3. |
| `CRAVES_FLEET_ORDER_BASE_URL` | empty | order-service root, for the customer's delivery code (`POST /internal/v1/orders/{id}/delivery-code/verify`). Unset: OTP delivery answers 503 `OTP_UNAVAILABLE`. |
| `CRAVES_NOTIFICATION_INTERNAL_BASE_URL` | empty | notification-service root, for offer pushes (`/internal/v1/push/realtime`) and ops alerts (`/internal/v1/ops-alerts`). Unset: offers reach the app on `/locations` only; alerts are `CRAVES_ALERT` log lines. |

All three use `CRAVES_INTERNAL_SERVICE_KEY` (`X-Craves-Internal-Secret`, or `X-Craves-Internal-Key` for notification-service), have explicit timeouts, and are never retried: a code check could count a wrong code twice, and an offer push outlives its offer.

Operational values live in versioned tables, not variables: `dispatch_policy` (seeded `2026-10-v1`, mode `off`, offers 40 s, fleet stage 60 s, radius 5 km as a placeholder; V154/V155 add pickup detour 130%, per-order overhead ₹5, cost-guard premium ₹10, Pidge stage 600 s) and `rate_card` (seeded draft `2026-10-v1`; V154 adds the event fees: ₹20 cancellation at the kitchen, ₹9 a km to return food, a 10-minute unreachable wait). The added values are draft business inputs with declared ranges, like the rest.

## Tables (`fleet_schema`, migration V152)

| Table | Holds |
|---|---|
| `rider` | One row per rider ops adds: KYC name, phone (unique), language, status, linked identity, vehicle, min app version. |
| `rider_device` | Phones; one `BOUND` per rider, a new one waits in `PENDING_APPROVAL`. |
| `rider_document` | Uploaded document photos, reviewed by hand: status, expiry, rejection reason, reviewer. No Aadhaar type exists. |
| `rider_payout_account` | UPI ID or bank account set in person: encrypted like chef bank details, keyed fingerprint (unique among current accounts), masked copy. |
| `rider_status_event` | Append-only due-process history: kind, reason, evidence, deadline or review date, appeal phone, approver, status before and after. |
| `rate_card` | Versioned rider pay with declared ranges; publishing needs 14 days' notice. |
| `dispatch_policy` | Versioned dispatch mode, offer and stage seconds, radius, with declared ranges. |
| `rider_terms_acceptance` | Which terms version each rider accepted, and when. |
| `test_mode_rider`, `test_mode_kitchen` | Test-mode allow-lists. |
| `rider_slot` | Ops-assigned slots with zone and rest point (Home's next slot). |
| `ops_banner` | Messages for Home, such as a rain warning. |
| `rider_shift` | Shifts: hashed shift credential (12 h at most), selfie and its review, seconds in the zone. One open shift per rider. |
| `rider_position_latest` | One latest fix per rider. |
| `trip_track` | On-trip fixes, partitioned by IST day (see below). |
| `trip` | One per chef sub-order (unique), with order code, kitchen, drop, distances and locked pay. |
| `trip_offer` | Offers with locked pay; one `ACTIVE` offer per rider and one `ACCEPTED` per trip. |
| `trip_event` | Trip steps, unique per trip and idempotency key. |
| `trip_stage` | The dispatch chain; one `OPEN` stage per trip. |
| `rider_earning` | Pay lines, unique key `fleet-trip-pay/{tripId}/{component}/{revision}`, net = gross − withheld. |
| `rider_payout_instruction` | Weekly payouts and daily withdrawals with UTRs. |
| `rider_withdrawal_day` | One withdrawal per rider per IST day. |
| `support_issue` | Problems riders report, with acknowledge-by and fix-by times. |
| `sos_event` | SOS presses with the last fix. |
| `admin_audit` | Append-only trail of every ops action; mutations also keep their Idempotency-Key and first response. |
| `rider_slot_settlement` (V154) | One per finished slot: online in-zone seconds, the guarantee, trip pay in the slot and the top-up; `credited_at` is set by the money phase. |
| `chef_ready` (V155) | The chef's ready time per sub-order, kept even when it arrives before the trip. |

V154 also adds the trip's final pay (`final_pay_lines`, `final_pay_paise`, `pay_held`, `hold_reason`, `pay_finalized_at`) and the slot's own `guaranteed_per_hour_paise` and `status`; V153 adds the slot's own `in_zone_seconds`. V155 adds `trip.accepted_at` and registers `craves_fleet` in `delivery_schema.delivery_provider`, inactive, so a rider's delivery job can reference it while routing never quotes it.

Money is BIGINT paise. The migration is re-runnable because database tests drop `payment_schema` and migrate again.

### New `trip_track` partitions

V152 creates a default partition and one partition per IST day for the 8 days from the day it runs. While location ingest is on, `FleetLocationService.createTrackDays` creates the next 7 days a minute after start-up and every 6 hours (fleet pool), never today. A failure logs `CRAVES_ALERT alert=TRIP_TRACK_PARTITION_FAILED`. By hand:

```sql
CREATE TABLE IF NOT EXISTS fleet_schema.trip_track_20261028 PARTITION OF fleet_schema.trip_track
  FOR VALUES FROM ('2026-10-28 00:00+05:30') TO ('2026-10-29 00:00+05:30');
```

If fixes for that day already landed in `trip_track_default`, the statement fails: move those rows out of the default partition first, then create the day.

## Endpoints

Rider API (`/api/v1/rider`, rider API flag): every route needs the RIDER role except `GET /me` (any signed-in user), `GET /profile` and `POST /documents` (any signed-in user with a rider row, so a PENDING rider, who has no RIDER role until activation, can send documents; others get 403 `NOT_A_RIDER`), and `POST /devices` and `POST /locations` (a RIDER JWT or the shift credential).

| Route | Does |
|---|---|
| `GET /me` | Any signed-in user. Links the rider whose phone matches the JWT `phone_number` on the first call; otherwise `NOT_RIDER`. Status, reason, notice, terms versions, min app version, support contacts. |
| `GET /profile` | Latest document per type, vehicle, masked payout account, insurance. PENDING riders too (no RIDER role needed). |
| `GET /home` | `online` and `shiftStartedAt` (an open shift whose credential still works), `activeTripId` (trip in progress), the running or next booked slot with its own guaranteed hourly pay and rest point, `zoneName` and `slotEndsAt` while a slot runs, and the ops banner until its `until`. Earnings fields are zero until P4. |
| `POST /documents` | Multipart `type` (DL, RC, INSURANCE, PUC, PAN, BANK) and `photo` (JPG, PNG or PDF, 10 MB); stored PENDING. PENDING riders too. |
| `GET /terms` | The rate card in force (else the next published one, else the draft, with `draft: true`), in the rider's language. |
| `POST /terms/accept` | Accepts the current version; any other is 409 `TERMS_CHANGED`. |
| `POST /shift/start` | Goes online: multipart `selfie` (JPEG, 5 MB) and header `X-Craves-Installation-Id`. Returns `{shiftCredential, expiresAt}` once. Refusals below. |
| `POST /shift/end` | Goes offline: closes the open shift and revokes its credential. 204 even when nothing is open. |
| `POST /devices` | `{installationId, fcmToken, appVersion, model}`, with a RIDER JWT or the shift credential. 204 for the bound phone; 409 `DEVICE_NOT_BOUND` for another. See "Phones". |
| `POST /locations` | Location ingest flag. Header `X-Craves-Shift-Credential` (the native service) or a RIDER JWT. Up to 5 fixes; answers offers, the trip and a stop signal. See "Location ingest". |
| `POST /offers/{offerId}/accept` | One conditional update decides the winner: 200 Trip; 409 `OFFER_TAKEN` to the rider who lost; 409 `ORDER_CANCELLED` once the order is cancelled; 410 `OFFER_EXPIRED` after 40 s or once the fleet stage closed; the winner's repeat gets the trip again. |
| `POST /offers/{offerId}/decline` | 204. Free, no reason, changes nothing else. |
| `GET /trips/active` | The trip in progress, or 204. |
| `POST /trips/{tripId}/{action}` | `arrived-pickup`, `food-not-ready`, `picked-up`, `arrived-drop`, `delivered`, `failed`; see the trip steps below. |

Offer and trip POSTs need an `Idempotency-Key` (the app sends `rider-{action}-{offerId or tripId}-{riderId}[-{attempt}]`).

### Shifts and the shift credential

`POST /shift/start` checks, in this order, and answers `{code, message}`:

| Status | Code | When |
|---|---|---|
| 403 | `RIDER_NOT_ACTIVE` | The rider is not ACTIVE. |
| 409 | `DEVICE_NOT_BOUND` | The header is missing or is not the rider's bound phone (see `POST /devices`). |
| 403 | `APP_UPDATE_REQUIRED` | The bound phone's `appVersion` is below `minAppVersion` (`rider.min_app_version`, else `CRAVES_FLEET_MIN_APP_VERSION`). 403, not 426: 426 means an HTTP protocol upgrade. Checked only here, so a running shift is never cut off. |
| 403 | `DOCUMENTS_EXPIRED` | The driving licence, RC, insurance or PUC has no VERIFIED copy whose `expires_on` is today (IST) or later; a missing expiry counts as expired. The message names them. |
| 422 | `SELFIE_INVALID` | Not a JPEG, empty, or over 5 MB. |
| 409 | `SHIFT_OPEN` | A shift is open on another phone. |

The selfie goes to `riders/<riderId>/selfies/<shiftId>.jpg` with review state PENDING (the console's selfie queue). The credential is 32 random bytes, base64url; only its SHA-256 (hex) is stored in `rider_shift.credential_hash`. It expires 12 hours after the shift started (the table's CHECK). A second start from the same phone while its shift is open (the app lost the credential) rotates the credential of that shift and keeps the first selfie. A shift past its 12 hours, or whose credential ops revoked by approving another phone, is closed at the next start (`ended_at` = expiry or revocation).

Admin fleet API (`/api/v1/admin/fleet`, fleet flag), scoped admin roles per `admin-fleet-v1.yaml`; the legacy ADMIN role gets nothing. Mutations need an `Idempotency-Key` (a replay returns the first result; the same key with another body is 409 `IDEMPOTENCY_KEY_REUSED`), and every action is audited.

| Route | Does |
|---|---|
| `GET /riders`, `POST /riders`, `GET /riders/{id}` | List (newest first, search by name or last phone digits), create a PENDING rider, detail. |
| `GET /riders/{id}/documents/{documentId}/content` | The file, audited as a read. |
| `POST .../documents/{documentId}/approve`, `/reject` | Review by hand; a rejection carries the reason the rider sees. Approve takes `{expiresOn}` (the date printed on it), required for DRIVING_LICENCE, VEHICLE_RC, VEHICLE_INSURANCE and PUC (422 `EXPIRY_REQUIRED`); `/shift/start` needs all four verified and unexpired. |
| `PUT /riders/{id}/vehicle` | `{label, regNumber}` (2 to 60 characters; an Indian or BH-series plate, spaces and dashes ignored) → `{label, regNumberMasked}`, what the rider's profile shows. |
| `POST /riders/{id}/devices/{deviceId}/approve` | Binds the new phone, replaces the old one and revokes its shift credential. |
| `PUT /riders/{id}/payout-account` | Set in person. Holder name must match the KYC name (422 `HOLDER_NAME_MISMATCH`); the account must not belong to another rider (409 `PAYOUT_ACCOUNT_NOT_UNIQUE`). |
| `POST /riders/{id}/status-events` | The two tracks below. |
| `GET /selfie-reviews`, `GET /shifts/{id}/selfie`, `POST /shifts/{id}/selfie/approve`, `/reject` | Go-online selfie review; a rejection never ends a shift or blocks anyone. |
| `GET /banner`, `PUT /banner`, `DELETE /banner` | The zone banner on every rider's Home: `{tone: info or warning, text (1 to 160), until}`. PUT shows it from now until `until` (at least a minute ahead) and ends any earlier one; DELETE ends it (204 even when none shows); GET answers it or 204. Reads: operations, support and audit admins; changes: operations. |
| `GET /audit` | The trail, newest first, optionally for one rider. |
| `GET /exports/rider-joins-exits?date=` | CSV of joins and exits on one IST date, for the government portal. |
| `GET /slots?from&to&riderId`, `POST /slots`, `POST /slots/{id}/cancel` | Ops-assigned slots (`FleetSlotController`): 409 `SLOT_OVERLAP`; 422 `GUARANTEE_OUT_OF_RANGE` outside the current rate card's declared range, `SLOT_END_NOT_AFTER_START`; 409 `SLOT_NOT_BOOKED`. Audited and idempotent. |

### Due process (two tracks)

- `SAFETY_PAUSE`: the rider is SUSPENDED now; `reviewBy` must be within 72 hours.
- `NOTICE`: changes nothing for 7 days; `deadline` at least 7 days ahead; the rider keeps working and sees the notice.
- `RESTORE`: back to ACTIVE. From PENDING it activates the rider (the rider must have signed in once) and grants RIDER in auth-service.
- `DEACTIVATE`: only after a safety pause, or once an open notice's deadline has passed; revokes RIDER. Nothing deactivates automatically.

Every event records the reason, the evidence summary, the approver and the appeal phone (required except for RESTORE). The table's CHECKs hold the 7-day and 72-hour limits too.

### Payout accounts

The full number (or UPI ID) is stored only as `BankDataCipher` stores chef bank details: AES-256-GCM with the versioned bank-data keys. Uniqueness uses a keyed HMAC of `UPI:<id>` or `BANK:<first 4 of IFSC>:<number>`, so the same account at another branch of the same bank still matches. Rotating the active bank key changes new fingerprints, so re-fingerprint current accounts when rotating.

Name match: the holder name matches the KYC name when both have the same words, in any order, after removing accents, case, punctuation and the titles Mr, Mrs, Ms, Miss, Shri, Smt, Kumari and Dr. Initials are words, so "R Kumar" does not match "Ravi Kumar".

### Publishing a rate card or dispatch policy

`FleetPolicyStore.publishRateCard` and `publishDispatchPolicy` refuse a version that starts less than 14 days after publishing or has a value outside the declared ranges (those of the newest published version; a first version uses its own). The admin contract has no publish endpoint yet, so this is service code only; the table's CHECK also refuses fewer than 14 days.

### Phones

One bound phone per rider. `installationId` is the rider app's Android `ANDROID_ID`; the `rider_device` id is a name-based UUID of the rider id and the installation id, so the installation id itself is never stored and needs no column.

- The rider's first installation is BOUND. The same installation again updates `fcm_token`, `app_version`, `model` and `last_seen_at`.
- Any other installation is stored PENDING_APPROVAL and answered 409 `DEVICE_NOT_BOUND` (validation problems are 400 `VALIDATION_FAILED`). A REPLACED phone that registers again goes back to PENDING_APPROVAL.
- Ops approves it with `POST /api/v1/admin/fleet/riders/{riderId}/devices/{deviceId}/approve`: it becomes the one BOUND phone, the old one REPLACED, and an open shift's credential is revoked (the old phone gets a stop on its next `/locations`).
- With the shift credential instead of a JWT, the rider is the credential's (it must be live: not ended, revoked or expired, else 401).

Push (P3) sends offers to the BOUND phone's `fcm_token`. `/shift/start` requires its header `X-Craves-Installation-Id` to be the BOUND phone, and compares the BOUND phone's `app_version` with `minAppVersion`.

### Location ingest

`POST /api/v1/rider/locations` body `{fixes: [{lat, lng, accuracyM, at, mock}]}`, 0 to 5 fixes (more is 400; an empty list is the heartbeat).

- **Who.** With `X-Craves-Shift-Credential` the shift is the one whose `credential_hash` matches (unknown: 401 `SHIFT_CREDENTIAL_INVALID`). Without it, a JWT with the RIDER role and the rider's open shift (none: a stop). Spring Security lets only this route and `POST /devices` through without a JWT; `FleetShiftCredentialSecurityTest` walks every rider and admin route with only a credential and only these two answer.
- **Fixes.** Fixes with impossible values, from before the shift started or more than 5 minutes ahead of the database clock are dropped. Only fixes newer than the stored latest fix of this shift are used, so a resent batch writes nothing twice. `at` is the phone's fix time, so a phone whose clock runs more than 5 minutes fast sends no usable fixes (its heartbeat, offers and stop still work); riders should keep automatic time on.
- **Writes.** `rider_position_latest`: the newest fix wins (one row per rider, with its `mock` flag, `shift_id` and `trip_id` = the trip in progress, else null). `trip_track`: every new fix, with its `mock` flag, only while the rider has a trip in progress (ASSIGNED to AT_DROP). `rider_slot.in_zone_seconds` and `rider_shift.in_zone_seconds`: see the zone model.
- **Answer.** `{offers, activeTrip?, stop?, stopReason?}`. `offers`: the rider's ACTIVE `trip_offer` rows not yet expired, as rider-v1 Offers built by `FleetTripModels.offer`, the one mapping the offer push uses too: `expiresInSec` counted by the database clock (rounded up), `kitchenArea`, `customerLocality` and `itemsCount` (left out while 0) from the trip, `payLines` from `trip_offer.pay_lines` (`[{component, label, amountPaise}]`), and `estMinutes` = (pickup m + drop m) / 333 rounded up, + 5. `activeTrip`: the trip in progress as `{tripId, step, version}`, the step a rider-v1 TripStep (`FleetTripModels.step`: ASSIGNED is TO_KITCHEN, AT_PICKUP is AT_KITCHEN, anything that never reached the rider is CANCELLED); when it has ended, or ops gave it to another rider, it is reported once more with its final step (CANCELLED for a reassignment) so the app leaves trip mode.
- **Stop.** `{offers: [], stop: true, stopReason}` and the shift is closed, nothing else written, when: the rider is not ACTIVE; the shift was ended (`/shift/end`); its credential was revoked (ops approved another phone); or its 12 hours are up.

**Zone model.** P1 has no zone geometry: `rider_slot` holds a zone name and a time window, `dispatch_policy` only a radius. So the gap between two consecutive non-mock fixes of the shift counts while one of the rider's BOOKED slots is running, clipped to that slot and at most 60 seconds per gap (a phone that sleeps longer gets 60). It is added to that slot's `in_zone_seconds` (what the guarantee settles on) and to the shift's (the console's shift list), in one statement; a slot that settled meanwhile keeps its settled seconds. The position is not checked against the zone. Upgrade: add zone geometry (centre and radius) when ops draws the pilot area and test each fix against it.

**Statement budget.** One call runs at most 5 statements, inside one transaction:

1. read the shift, rider, latest position, trip in progress, previous trip and running slot, locking the shift row (`FOR UPDATE OF s`, so two calls for one shift run one after the other);
2. upsert `rider_position_latest`;
3. one multi-row `trip_track` insert, only on a trip;
4. add to the running slot's and the shift's `in_zone_seconds`, only when there is time to add;
5. read the offers.

A stop runs statement 1 and one shift update. `FleetLocationApiDatabaseTest.twoHundredCallsStayWithinFiveStatementsEach` counts every statement over 200 calls on a trip, in a slot, with an offer open (5 fixes each). The PLAN's load target, 20 calls a second for 10 minutes, is 12,000 calls: at most 5 × 12,000 = 60,000 statements (100 a second), plus each call's BEGIN and COMMIT, on one pooled connection per call for a few milliseconds.

EXPLAIN (Postgres 16, 2,000 riders, 62,000 shifts, 200,500 trips and offers, 42,000 slots) shows an index for every table: `rider_shift_credential_hash_key` (the credential, cast to `CHAR(64)` so the unique index applies), `rider_identity_id_key` and `rider_shift_one_open` (JWT), `rider_position_latest_pkey`, `rider_pkey`, `trip_one_active_per_rider`, `trip_pkey`, `rider_slot_rider`, `trip_offer_one_active_per_rider` and `rider_shift_pkey` for the updates; the upsert resolves on `rider_position_latest_pkey`, and the track insert goes straight to the day's partition.

## Dispatch chain (P3)

`dispatch_policy` mode governs it; with no published policy in force, or mode `off`, nothing below happens for a new order and Borzo and Pidge run exactly as before.

1. The delivery command (`DeliveryCommandWorker`) asks `DeliveryProviderRouter.fleetStage` first. `FleetDispatcher` (the `FleetStage` bean) plans: the chef from the checkout's finance quote (`payment_schema.finance_issued_snapshot`; unknown chef: no fleet), test mode, the drop's road distance, eligible riders (ACTIVE, open shift, no active trip or open offer, a real fix received in the last 45 s, inside the policy radius), pay per rider and the cost guard (locked pay + overhead ≤ the next courier's live quote + premium; no quote: riders may go). `shadow` logs `FLEET_SHADOW` and stops there.
2. `live`: one transaction creates the trip (`SEARCHING`, order code `#` + the first 8 characters of the sub-order id), the fleet stage (`trip_stage` seq 1, deadline = fleet stage seconds) and offers to the 3 nearest at once (one ACTIVE offer per rider; pay, rate card version and both distances locked). Each offer is pushed with TTL = seconds left. The command waits (provider wait) and looks again at least every 10 s; Borzo's 120-second window has not started.
3. The fleet stage closes on an accept (in the accept's own transaction: delivery job `craves_fleet`, `COURIER_ASSIGNED` with the rider card, command completed) or, at its deadline or once no offer is open, by a conditional update on the same stage row; then the next stage opens (`BORZO` for 120 s when the timed policy is ready, else `PIDGE` for the Pidge stage seconds) and routing books as before. A late accept finds the stage closed: 410.
4. The dispatch tick (`FleetDispatchJobs`, every 5 s on the fleet pool) expires offers, moves `BORZO` to `PIDGE` at its deadline and closes a stage when its courier is assigned. A Pidge stage past its deadline, a courier who cancelled, or an uncertain create (never retried) goes to `OPS_QUEUE` with an ops alert `FLEET_DISPATCH_QUEUE`.
5. Watchdog: an accepted rider with no location received for 90 s before pickup loses the trip (`CANCELLED`, pickup-leg pay held for ops), ops gets `FLEET_RIDER_LOST`, the next stage opens and the tick books Borzo or Pidge through the router and hands the delivery job over with `handoffFromProviderId: craves_fleet`. CANCELLED is never published for it. order-service accepts that hand-over only from a rider before pickup (its projection `craves_fleet` with the trip id, status `COURIER_ASSIGNED`, `COURIER_TO_PICKUP` or `AT_PICKUP`) to Borzo or Pidge, clears the rider card the chef sees, and the customer's delivery code goes with it (shown only for `craves_fleet`). A later Borzo to Pidge hand-over counts only couriers of that Borzo delivery, not the rider before it. Deploy order-service with this change before any policy goes `live`.

6. Cancellation: integration-service hears that the customer or the chef cancelled only as the refund order-service then requests (`payment_schema.refund` for the sub-order). From then on an accept is refused with 409 `ORDER_CANCELLED` ("This order was cancelled. Watch for the next one."), and the next tick ends the trip through `FleetTripService.cancel`, the adapter's cancel path: open offers withdrawn, every open stage closed (so no courier is booked or queued by the tick), and a rider already on the trip paid for the state reached, not held. The delivery command of an order cancelled before any rider took it books nobody and fails until its retries run out. A Borzo or Pidge courier already booked is not cancelled: no order has that path yet.

`craves_fleet` (`CravesFleetAdapter`) is inactive in the catalog: routing never quotes or creates it. `track()` maps the trip to the pipeline (below); `cancel()` ends a trip as in step 6, with the pay rule for its state.

## Trip steps and statuses

| Trip state | App step | Delivery status published | Reached by |
|---|---|---|---|
| `SEARCHING` | (offer) | none | fleet stage open |
| `ASSIGNED` | `TO_KITCHEN` | `COURIER_ASSIGNED` + rider card | accept |
| `AT_PICKUP` | `AT_KITCHEN` | `AT_PICKUP` | `arrived-pickup` (and `food-not-ready`, no status) |
| `PICKED_UP` | `PICKED_UP` | `PICKED_UP`, then `IN_TRANSIT` from tracking once a real fix arrives after pickup | `picked-up` |
| `AT_DROP` | `AT_DROP` | `AT_DROPOFF` | `arrived-drop` |
| `DELIVERED` | `DELIVERED` | `DELIVERED` | `delivered` (OTP, or photo) |
| `FAILED` | `FAILED` | `FAILED` | `failed` after pickup |
| `CANCELLED` | `CANCELLED` | `CANCELLED`, unless another stage took the order | order cancelled, ops cancel, watchdog |

Each step is idempotent (a repeated key, or a step already taken, returns the trip), in order (else 409 `STEP_CONFLICT`; an ended trip is 409 `TRIP_NOT_ACTIVE`), and moves `trip.version`. The rider card is the first name and initial ("Ravi K.") and the rider's phone (no relay exists yet); no photo URL. `sealed` is false: orders have no sealed flag yet.

- The free wait runs from the later of the arrival inside the kitchen zone (a real fix under 2 minutes old within 300 m, checked at `arrived-pickup` and again at `food-not-ready`) and the chef's ready time, and stops at `picked-up`.
- `delivered` `{method: OTP, otp}` asks order-service once per attempt: 422 `OTP_INVALID` with `attemptsLeft` 4 to 1, then 423 `OTP_LOCKED` from the fifth wrong code on. A repeated key gets its first answer without asking again.
- `delivered` multipart `{method: PHOTO, callsMade, photo}` needs two calls and the unreachable wait since `arrived-drop`, or an OTP lock. The photo goes to `riders/{riderId}/trips/{tripId}/`; the pay is held for ops.
- `failed {reason, note}` after pickup: `CUSTOMER_UNREACHABLE` (at the drop, after the wait) is full pay; `WRONG_ADDRESS`, `CUSTOMER_REFUSED`, `UNSAFE` are full pay plus the return. Held for ops.

Pay (`FleetPay`): base + drop km after the base km + pickup km after the free km (straight line × detour) + waiting after the free minutes, pro rata, in paise. Cancelled riding to the kitchen: pickup leg; at the kitchen: cancellation fee + pickup leg + waiting; after pickup: full + return. Every paid end stores the lines on the trip and publishes `FleetTripPayFinalized`; the money phase writes the ledger.

## Slots

Ops books a rider into a zone with a guaranteed hourly minimum inside the rate card's declared range. Home shows the next booked slot and its guarantee. Each minute (`FleetSlotService.settleDue`, fleet pool) a finished slot settles once: top-up = max(0, guarantee × online in-zone hours − trip pay that finished in the slot) into `rider_slot_settlement`. In-zone seconds are the slot's own counter (see the zone model), so a shift that runs across several slots pays each slot only for its own minutes. Declines never enter it.

## Daily export

`RiderJoinsExitsExport` writes yesterday's CSV to `riders/exports/rider-joins-exits-YYYY-MM-DD.csv` at 00:20 IST on the fleet pool, only while `CRAVES_FLEET_ENABLED`. JOINED is a move to ACTIVE from PENDING (or a rejoin from DEACTIVATED); EXITED is a deactivation.

## Test mode for one rider and one kitchen

1. Keep `CRAVES_FLEET_TEST_MODE=true` (the default) and set `CRAVES_FLEET_ENABLED=true`, `CRAVES_FLEET_RIDER_API_ENABLED=true` and `CRAVES_FLEET_LOCATION_INGEST_ENABLED=true` (dispatch offers only to riders whose real fix arrived in the last 45 s, through `/locations`).
2. Ops creates the rider in the console (`POST /riders`); the rider signs in to the app once so `/me` links them; ops activates them with `RESTORE`.
3. Allow-list both, by SQL on the integration database:

```sql
INSERT INTO fleet_schema.test_mode_rider (rider_id, note) VALUES ('<rider id>', 'pilot test rider');
INSERT INTO fleet_schema.test_mode_kitchen (chef_id, note) VALUES ('<chef identity id>', 'pilot test kitchen');
```

Dispatch asks `FleetTestMode.riderAllowed` and `kitchenAllowed` before it offers a trip, so nobody else is touched. The kitchen is known only for orders checked out with the finance quote (`finance_issued_snapshot`).

4. Set `CRAVES_USER_CHEF_INTERNAL_BASE_URL`, `CRAVES_FLEET_ORDER_BASE_URL` and `CRAVES_NOTIFICATION_INTERNAL_BASE_URL`.
5. Dispatch needs a published `dispatch_policy` version in force. A person publishes one with mode `shadow` first (it only logs `FLEET_SHADOW`); `live` only once the order-service that accepts the `craves_fleet` hand-over (above) is deployed. Publishing needs 14 days' notice and values inside the declared ranges. Agents never change the mode.
6. The rider goes online (P2), the allow-listed kitchen accepts an order, and the offer rings within the fleet stage.
