# Rider backend

The Craves rider fleet lives in integration-service, package `in.craves.integration.fleet`, with its own schema, `fleet_schema`, in the integration database. Four other services carry small parts of it: auth-service (the RIDER role), notification-service (offer pushes and ops alerts), user-chef-service (road distance) and order-service (the customer's delivery code). Plan: project doc `rider-app/PLAN.md`. Contracts: `contracts/openapi/rider-v1.yaml` (rider app, with every error code per route) and `contracts/openapi/admin-fleet-v1.yaml` (ops console).

Nothing here changes what production does until a person turns it on: every flag is off by default, `dispatch_policy` is seeded in mode `off`, and test mode is on. The go-live runbook, from merge to a live pilot zone with every outside account to set up, is `GO-LIVE.md`.

## Deploy order

1. **order-service**: V41 (delivery code), the internal verify endpoint, the customer's `deliveryCode`, the order number in Borzo and Pidge notes, and acceptance of a Craves rider's order handed to Borzo or Pidge.
2. **notification-service**: V8 (the device's `app`), `/internal/v1/push/realtime` and `/internal/v1/ops-alerts`.
3. **user-chef-service**: V20 (road-distance cache) and `/internal/v1/maps/road-distance`.
4. **auth-service**: V20 (the RIDER role) and `/internal/v1/roles/rider/grant` and `/revoke`.
5. **integration-service**: V152 to V159 and the fleet package, all flags off.
6. **APIM** (`scripts/apim/configure-rider-fleet-apim.sh`), once integration-service answers: the gateway probes every route.

The first four only add code that nothing calls until integration-service does. Each service's controllers are in its `live-runtime-lock.txt`.

## Flags and settings

Environment flags only switch code paths on. All are off by default (integration-service, `craves.fleet.*`):

| Variable | What it switches on |
|---|---|
| `CRAVES_FLEET_ENABLED` | Every fleet bean: admin API, policy readers, test mode, storage, the RIDER role client, the fleet scheduler pool and its jobs, slot settlement, dispatch (the fleet stage, the `craves_fleet` adapter, the dispatch tick), the earnings ledger and payouts. Off means no fleet bean or job exists (`FleetConfigurationTest`). |
| `CRAVES_FLEET_RIDER_API_ENABLED` | The rider API under `/api/v1/rider` (needs `CRAVES_FLEET_ENABLED` too). |
| `CRAVES_FLEET_LOCATION_INGEST_ENABLED` | `POST /api/v1/rider/locations` and the daily `trip_track` partition job (needs the two flags above). Dispatch needs it: offers go only to riders whose phone called it in the last 45 s with a real fix under 3 minutes old. |
| `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` | Keep it false. Payouts are manual and RazorpayX is never called: no automated execution exists. The only reader is a guard in `FleetPayouts` that, when it is true, starts nothing and logs `CRAVES_ALERT alert=FLEET_PAYOUT_EXECUTION_REFUSED`. |

Other integration-service settings:

| Variable | Default | Use |
|---|---|---|
| `CRAVES_FLEET_TEST_MODE` | `true` | Dispatch touches only allow-listed riders and kitchens (see the last section). |
| `CRAVES_AUTH_INTERNAL_BASE_URL`, `CRAVES_INTERNAL_SERVICE_KEY` | empty | RIDER grant and revoke in auth-service. Until both are set, no call is made and the log says `FLEET_ROLE_CLIENT_OFF`. |
| `CRAVES_STORAGE_ENDPOINT_VALUE`, `CRAVES_STORAGE_DOCUMENTS_CONTAINER` | empty, `documents` | The private container user-chef-service uses for KYC files. Rider files (documents, selfies, delivery photos, exports) go under `riders/`. |
| `CRAVES_BANK_DATA_ACTIVE_KEY_ID`, `CRAVES_BANK_DATA_KEYS_JSON` | empty | The chef bank-details keys; payout accounts are encrypted with them. |
| `CRAVES_FLEET_SUPPORT_PHONE`, `CRAVES_FLEET_SUPPORT_WHATSAPP_URL` | empty | Rider support line (`/me`, the terms, insurance claims) and WhatsApp group. Set the phone before turning the rider API on. |
| `CRAVES_FLEET_MIN_APP_VERSION` | `1.0.0` | Blocks going online, never a running shift; `rider.min_app_version` overrides it per rider. |
| `CRAVES_FLEET_INSURANCE_LABEL` | empty | Insurance line on the rider's profile. |
| `CRAVES_USER_CHEF_INTERNAL_BASE_URL` | empty | user-chef-service root for the drop's road distance. Unset: straight line × 1.3. |
| `CRAVES_FLEET_ORDER_BASE_URL` | empty | order-service root for the delivery-code check. Unset: OTP delivery answers 503 `OTP_UNAVAILABLE`. |
| `CRAVES_NOTIFICATION_INTERNAL_BASE_URL` | empty | notification-service root for offer pushes and ops alerts. Unset: offers reach the app on `/locations` only; alerts are `CRAVES_ALERT` log lines. |
| `CRAVES_LEDGER_POSTING_ENABLED` | `false` | The existing financial-journal gate. Rider credits wait for it (`CRAVES_ALERT alert=FLEET_CREDITS_WAITING`); the money job then credits them. |
| `CRAVES_FLEET_TDS_ENABLED`, `_SECTION`, `_RATE_BASIS_POINTS`, `_ANNUAL_THRESHOLD_PAISE` | off, empty, 0, 0 | TDS on rider pay (see Money). The CA sets the section, the rate (100 = 1%) and the yearly threshold; on without a section or with a rate outside 1 to 10000, credits fail with `FLEET_TDS_MISCONFIGURED` and wait. |
| `CRAVES_FLEET_MONEY_INTERVAL_MS` | `60000` | The money job. |
| `CRAVES_FLEET_RECOVERY_WEEKLY_CAP_PAISE` | `50000` | Debt from a negative adjustment is recovered from future pay, at most this much a week (₹500 is a placeholder business input). |
| `craves.fleet.slot-settlement-interval-ms`, `craves.fleet.dispatch-tick-ms` | 60000, 5000 | Job intervals (application properties, no env variable). |

The three clients (road distance, delivery code, push and alerts) use `CRAVES_INTERNAL_SERVICE_KEY` (`X-Craves-Internal-Secret`, or `X-Craves-Internal-Key` for notification-service), have explicit timeouts, and are never retried: a code check could count a wrong code twice, and an offer push outlives its offer. Once signed internal calls are enforced, each callee's `CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS` default admits only integration-service to these routes.

Other services:

| Service | Variable | Default | Use |
|---|---|---|---|
| notification-service | `CRAVES_REALTIME_PUSH_ENABLED` | `false` | `/internal/v1/push/realtime` (503 `PUSH_DISABLED` while off); same `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` as the queued pushes. |
| notification-service | `CRAVES_OPS_ALERT_EMAILS` | empty | Comma-separated ops leads for `/internal/v1/ops-alerts` (SOS, dispatch queue); empty or no ACS: 503 `OPS_ALERT_NOT_CONFIGURED`. |
| user-chef-service | `OLA_MAPS_API_KEY` | existing | Ola Directions for road distance; without it every answer is the fallback. |

Operational values live in versioned tables, not variables, so changing them needs no restart: `dispatch_policy` (seeded `2026-10-v1`, mode `off`, offers 40 s, fleet stage 60 s, radius 5 km as a placeholder; V154 and V155 add pickup detour 130%, per-order overhead ₹5, cost-guard premium ₹10, Pidge stage 600 s) and `rate_card` (seeded draft `2026-10-v1`: ₹40 base for the first 2 km of the drop, ₹9 a drop km after that, ₹9 a pickup km after the first 1 km, ₹1.50 a minute of waiting after 8 free minutes, ₹80 an hour guaranteed in a booked slot; V154 adds ₹20 cancellation at the kitchen, ₹9 a km to return food and a 10-minute unreachable wait). All are draft business inputs with declared ranges. Ops publishes both from the console (`/rate-cards`, `/dispatch-policies`); `FleetPolicyStore` holds the rules and the V159 triggers hold the same notice rules, so SQL cannot skip them. Telangana Act 21 of 2026, s.13(2) asks for 14 days' notice of changed terms:

- **Rate card** (the riders' pay terms): the first one ever published may start at once (one whose start has passed starts when published); every later one must start at least 14 days after publishing.
- **Dispatch policy** (operations): a version starts now, or on an `effectiveFrom` at least 14 days away (a nearer one is 422 `NOTICE_TOO_SHORT`). The pickup detour is part of pay (pickup km = straight line × detour), and the terms show it ("Pickup distance: straight line × 1.3"). So once a rate card is published, a detour other than the one riders are shown (the policy in force, not withdrawn; else the seeded draft's) needs a start at least 14 days away (422 `DETOUR_NEEDS_NOTICE`). Before any card is published, riders have no terms and nothing needs notice. `live` needs a published rate card in force (422 `RATE_CARD_REQUIRED`); behind that, `FleetDispatcher` opens no fleet stage in `live` without one (it logs `FLEET_SKIPPED reason=NO_RATE_CARD_IN_FORCE` at most once per 5 s).
- **Emergency stop**: an `off` without `effectiveFrom` always works. It keeps the values riders are shown (the 7 values the page sent are ignored, so a stale page can still stop), starts at once and withdraws every version scheduled for later (`withdrawn_at`, `withdrawn_by`; the audit names them), so dispatch stays stopped. A withdrawn version never counts as in force and cannot be un-withdrawn. Any other version set now leaves a scheduled one to take over on its date (the console warns).
- **Upcoming**: while a rate card is in force, riders see the next change as `upcoming` in their terms during its notice: the earlier of the next published card and the next detour change, with the lines they will have then.
- **Ranges**: values must lie inside the declared ranges of the newest published version (a first rate card declares its own; before any policy is published, the seeded draft's). A card published after the first takes the published ranges, replacing the ones its draft declared (the audit says so).
- **Published versions never change or go away.** The V159 triggers refuse deleting a published rate card or dispatch policy, any change to a published rate card, and any change to a published dispatch policy except one withdrawal before it starts; they set `published_at` and `withdrawn_at` from the database clock, so a caller cannot backdate them. The code reads the same clock (`SELECT now()` in the transaction), which is also what every in-force read uses; in-force reads break ties on `effective_from` by the newest `created_at`, in the console too.
- **One version per moment**: a version that starts later may not start at the same moment as another published one in its table (a withdrawn policy does not count), or which one is in force, or next, would be a guess: 409 `START_TAKEN` ("Another version starts at that moment. Pick another start time."), in the code and the trigger. Versions that start now never collide: each publish has its own transaction and clock.
- Publishes take an advisory lock per table (in the code and in the trigger), so two "first" rate cards cannot both start at once.

Agents never change the mode.

## Tables

Money is BIGINT paise everywhere. The integration migrations are re-runnable (`IF NOT EXISTS`) because database tests drop the schemas and migrate again; they apply in order V152 to V159.

| Table | Created by | Holds |
|---|---|---|
| `fleet_schema.rider` | integration V152, V160 | One row per rider, signed up in the app or added by ops: KYC name, phone (unique), language, status (NOT_RIDER is never stored: it is "no row"), linked identity, vehicle, min app version, `vehicle_kind` (V160: PETROL, ELECTRIC or BICYCLE decides the documents asked for). |
| `fleet_schema.rider_device` | integration V152 | Phones: one `BOUND` per rider, a new one `PENDING_APPROVAL`, an old one `REPLACED`. |
| `fleet_schema.rider_document` | integration V152 | Document photos reviewed by hand: type, status, expiry, rejection reason, reviewer. No Aadhaar type exists. |
| `fleet_schema.rider_payout_account` | integration V152; V157 adds `payouts_paused_at`, `paused_reason`; V160 adds state `SUBMITTED` | UPI ID or bank account set in person, or sent by the rider (`SUBMITTED`, never paid) and then confirmed by ops: encrypted like chef bank details, keyed fingerprint (unique among current accounts), masked copy. |
| `fleet_schema.rider_status_event` | integration V152 | Append-only due-process history: kind, reason, evidence, deadline or review date, appeal phone, approver, status before and after. |
| `fleet_schema.rate_card` | integration V152; V154 adds the event fees; V159 a trigger in place of the 14-day CHECK | Versioned rider pay with declared ranges; `effective_from` at least 14 days after publishing, except for the first card ever. |
| `fleet_schema.dispatch_policy` | integration V152; V154 and V155 add detour, overhead, premium, Pidge stage; V159 a trigger in place of the 14-day CHECK, and `withdrawn_at`, `withdrawn_by` | Versioned dispatch mode (`off`, `shadow`, `live`), offer and stage seconds, radius, with declared ranges; 14 days' notice only for a changed detour; scheduled versions an emergency stop withdrew. |
| `fleet_schema.rider_terms_acceptance` | integration V152 | Which terms version each rider accepted, and when. |
| `fleet_schema.test_mode_rider`, `test_mode_kitchen` | integration V152 | Test-mode allow-lists: the pilot riders and kitchens, set from the console. |
| `fleet_schema.rider_slot` | integration V152; V154 adds the guarantee and status, V153 `in_zone_seconds` | Ops-assigned slots with zone, rest point and hourly guarantee. |
| `fleet_schema.ops_banner` | integration V152 | Messages on every rider's Home, such as a rain warning. |
| `fleet_schema.rider_shift` | integration V152 | Shifts: hashed shift credential (12 h at most), bound phone, selfie and its review, in-zone seconds. One open shift per rider. |
| `fleet_schema.rider_position_latest` | integration V152 | One latest fix per rider, with its mock flag. |
| `fleet_schema.trip_track` | integration V152 | On-trip fixes, partitioned by IST day (see Jobs). |
| `fleet_schema.trip` | integration V152; V154 adds final pay, V155 `accepted_at`, V156 `pay_credited_at` | One per chef sub-order (unique): order code, kitchen, drop, distances, locked pay, state, final pay lines and hold. |
| `fleet_schema.trip_offer` | integration V152 | Offers with locked pay, rate card and distances; one `ACTIVE` per rider, one `ACCEPTED` per trip. |
| `fleet_schema.trip_event` | integration V152 | Trip steps and OTP attempts, unique per trip and idempotency key. |
| `fleet_schema.trip_stage` | integration V152 | The dispatch chain (`CRAVES_FLEET`, `BORZO`, `PIDGE`, `OPS_QUEUE`) with deadlines and outcomes; one `OPEN` stage per trip. |
| `fleet_schema.rider_earning` | integration V152; V156 adds `slot_id`, `label`, `reason` | Pay lines, unique key `fleet-trip-pay/{tripId}/{component}/{revision}` (a slot: `fleet-slot-pay/{slotId}/slot-top-up/1`), net = gross − withheld. |
| `fleet_schema.rider_payout_instruction` | integration V152; V157 adds `batch_id` | Weekly payouts and daily withdrawals with UTRs; a payout is in one file only. |
| `fleet_schema.rider_withdrawal_day` | integration V152; V157 adds `idem_key` | One withdrawal per rider per IST day. |
| `fleet_schema.support_issue` | integration V152; V158 indexes it by trip | Problems riders report, with acknowledge-by and fix-by times. |
| `fleet_schema.sos_event` | integration V152 | SOS presses with the last fix and when ops was alerted. |
| `fleet_schema.admin_audit` | integration V152 | Append-only trail of every ops action; mutations also keep their Idempotency-Key and first response. |
| `fleet_schema.rider_slot_settlement` | integration V154 | One per finished slot: in-zone seconds, guarantee, trip pay in the slot, top-up, `credited_at`. |
| `fleet_schema.chef_ready` | integration V155 | The chef's ready time per sub-order, kept even when it arrives before the trip. |
| `delivery_schema.delivery_provider` row `craves_fleet` | integration V155 | Registered inactive, so a rider's delivery job can reference it while routing never quotes it. |
| `fleet_schema.rider_pay_hold` | integration V156 | One hold per trip, ever: reason, `release_on` (today to 7 days ahead, IST), who placed and released it. V156 also adds the journal accounts `RIDER_PAYABLE` and `RIDER_TDS_PAYABLE`. |
| `fleet_schema.rider_payout_batch` | integration V157 | A payout file: kind, date (WEEKLY on a Monday), status `CREATED` → `APPROVED` → `SENT` → `CLOSED`, maker and checker (the table refuses the maker as approver). |
| `fleet_schema.rider_recovery` | integration V157 | One debt recovery per rider per week. |
| `auth_role` row `RIDER` | auth V20 | The role in the JWT, granted at activation and revoked at deactivation. |
| `notification_schema.push_device_registration.app` | notification V8 | `customer` or `rider`; the queued push worker sends only to `customer` tokens. |
| `road_distance_cache` | user-chef V20 | Road metres and seconds per kitchen and address pair (or rounded points), 30 days. |
| `order_schema.order_delivery_code` | order V41 | The customer's 4-digit code per order: failed attempts, `verified_at`. |

## Endpoints

### Rider API (`/api/v1/rider`, integration-service, rider API flag)

Every route needs a Craves JWT. The RIDER role is needed everywhere except `GET /me` and `POST /apply` (any signed-in user), `GET /profile`, `POST /documents` and `POST /payout-account` (any signed-in user with a rider row, so a PENDING rider can send documents and an account), and `POST /devices` and `POST /locations` (a RIDER JWT or the shift credential). Errors are `{code, message}` (`FleetApiAdvice`); `rider-v1.yaml` lists every code each route returns.

| Route | Does |
|---|---|
| `GET /me` | Links the rider whose phone matches the JWT `phone_number` on the first call; otherwise status `NOT_RIDER`. Status, reason, notice, terms versions, min app version, support contacts, `features` (payouts and withdrawals once ops verified a payout account). |
| `POST /apply` | Sign-up, like chefs: anyone signed in with an Indian mobile becomes a PENDING rider (name, language, vehicle kind, number plate unless a bicycle, 18+). A PENDING rider sends it again to correct their details (an empty plate keeps the one on file; a new name sets aside a payout account sent in the old one). 422 `NAME_LOCKED` for a new name once ops accepted the PAN card, driving licence or bank proof, or confirmed a payout account; 422 `VEHICLE_LOCKED` for another vehicle kind or plate once ops accepted the RC (going online only checks that some RC is accepted). The language still changes. Past PENDING it just answers `/me`; 409 `PHONE_IN_USE` for a phone on another account. |
| `GET /profile` | Latest document per type (with ops's reason), and for a PENDING rider each required one not sent yet as `MISSING`; vehicle, masked payout account, `payoutAccountSubmitted`, insurance. |
| `POST /payout-account` | The rider's UPI ID or bank account in their KYC name, stored encrypted as `SUBMITTED`. Never paid until a payments admin confirms it (`POST /admin/fleet/riders/{id}/payout-account/confirm`) against the bank proof. |
| `GET /home` | `online` and `shiftStartedAt` (an open shift whose credential still works), `activeTripId`, the running or next booked slot with its own guaranteed hourly pay and rest point, `zoneName` and `slotEndsAt` while a slot runs, the ops banner until its `until`, and `todayEarningsPaise` (net of TDS) and `todayTrips` from credited pay. |
| `POST /documents` | Multipart `type` (DL, RC, INSURANCE, PUC, PAN, BANK) and `photo` (JPG, PNG or PDF, 10 MB); stored PENDING for ops. |
| `GET /terms` | The rate card in force (else the next published one, else the draft, with `draft: true`), in the rider's language (te and hi fall back to English until translated). The lines include the pickup detour in force. While a card is in force, `upcoming` is the next change (see "Flags and settings"): the rate card in force then, its start, the lines riders will have then, and the card's summary and a pickup-distance line when they change. |
| `POST /terms/accept` | Accepts the version in force; any other is 409 `TERMS_CHANGED`. |
| `POST /shift/start` | Goes online: multipart `selfie` and header `X-Craves-Installation-Id`. Returns `{shiftCredential, expiresAt}` once. See "Shifts". |
| `POST /shift/end` | Closes the open shift and revokes its credential; 204 even when nothing is open. |
| `POST /devices` | `{installationId, fcmToken, appVersion, model}`: 204 for the bound phone; 409 `DEVICE_NOT_BOUND` for another. See "Phones". |
| `POST /locations` | Location ingest flag. Up to 5 fixes; answers offers, the trip and a stop signal. See "Location ingest". |
| `POST /offers/{offerId}/accept` | One conditional update decides the winner: 200 Trip; 409 `OFFER_TAKEN`, `ORDER_CANCELLED` or `TRIP_IN_PROGRESS`; 410 `OFFER_EXPIRED` after 40 s or once the fleet stage closed; the winner's repeat gets the trip again. |
| `POST /offers/{offerId}/decline` | 204. Free, no reason, changes nothing else and no ranking. |
| `GET /trips/active` | The trip in progress, or 204. |
| `POST /trips/{tripId}/{action}` | `arrived-pickup`, `food-not-ready`, `picked-up`, `arrived-drop`, `delivered`, `failed`; see "Trip steps". |
| `GET /earnings?range=today\|week&cursor=` | Trips with credited pay, newest first, 20 a page; `totalPaise` is the whole range, slot top-ups included. The week is Monday 00:00 to Sunday 23:59 IST. |
| `GET /earnings/trips/{tripId}` | One trip: lines (TDS and adjustments are lines too), distances, `rateCardVersion`, status `CREDITED`, `HELD` (`holdReason`, `releaseOn`) or `ADJUSTED`. |
| `GET /payouts` | `nextPayoutOn` (Monday; today until 15:00 IST on a Monday), `withdrawablePaise`, and the latest 50 payouts: `SCHEDULED`, `PROCESSING` (file sent), `PAID` with `utr` and `paidAt`, `FAILED`. |
| `POST /withdrawals` | `{amountPaise}`: 204, paid in the next day's file (by 13:00). 409 `WITHDRAWAL_LIMIT`, `AMOUNT_OVER_BALANCE`, `PAYOUT_ACCOUNT_REQUIRED`, `PAYOUTS_PAUSED`, `IDEMPOTENCY_KEY_REUSED`; the same key and amount answers 204 again. Free. |
| `POST /support/issues` | `{category, tripId?, payoutId?, note?}`: 204 with acknowledge-by +24 h and fix-by +72 h. The trip or payout must be the rider's (404 otherwise). |
| `POST /sos` | `{tripId?, fix?}`: 204 once stored; never refused for a missing location. See "Support and SOS". |

Offer, trip and withdrawal POSTs need an `Idempotency-Key` (the app sends `rider-{action}-{offerId or tripId}-{riderId}[-{attempt}]`).

### Admin fleet API (`/api/v1/admin/fleet`, integration-service, fleet flag)

Scoped admin roles per `admin-fleet-v1.yaml`; the legacy ADMIN role gets nothing. Mutations need an `Idempotency-Key` (a replay returns the first result; the same key with another body is 409 `IDEMPOTENCY_KEY_REUSED`), and every action is audited.

| Route | Does |
|---|---|
| `GET /riders`, `POST /riders`, `GET /riders/{id}` | List (newest first, search by name or last phone digits), create a PENDING rider, detail. |
| `GET /riders/{id}/documents/{documentId}/content` | The file, audited as a read. |
| `POST .../documents/{documentId}/approve`, `/reject` | Review by hand; a rejection carries the reason the rider sees. Approve takes `{expiresOn}`, required for DL, RC, insurance and PUC (422 `EXPIRY_REQUIRED`); `/shift/start` needs all four verified and unexpired. |
| `PUT /riders/{id}/vehicle` | `{label, regNumber}` (an Indian or BH-series plate) → `{label, regNumberMasked}`. |
| `POST /riders/{id}/devices/{deviceId}/approve` | Binds the new phone, replaces the old one and revokes its shift credential. |
| `PUT /riders/{id}/payout-account` | Set in person. Holder name must match the KYC name (422 `HOLDER_NAME_MISMATCH`); the account must not belong to another rider (409 `PAYOUT_ACCOUNT_NOT_UNIQUE`). |
| `POST /riders/{id}/payout-account/confirm` | Payments admins. Makes the account the rider sent from the app (`submittedPayoutAccount` on the rider) the one payouts go to, after checking it against the bank proof; the same name and uniqueness checks; 404 `NO_SUBMITTED_PAYOUT_ACCOUNT`. Audited. |
| `POST /riders/{id}/status-events` | The two due-process tracks (below). |
| `GET /selfie-reviews`, `GET /shifts/{id}/selfie`, `POST /shifts/{id}/selfie/approve`, `/reject` | Go-online selfie review; a rejection never ends a shift or blocks anyone. |
| `GET /banner`, `PUT /banner`, `DELETE /banner` | The zone banner: `{tone: info or warning, text (1 to 160), until}`. PUT shows it from now until `until` and ends any earlier one; DELETE ends it; GET answers it or 204. |
| `GET /audit` | The trail, newest first, optionally for one rider. |
| `GET /exports/rider-joins-exits?date=` | CSV of joins and exits on one IST date, for the government portal. |
| `GET /slots?from&to&riderId`, `POST /slots`, `POST /slots/{id}/cancel` | Ops-assigned slots: 409 `SLOT_OVERLAP`, `SLOT_NOT_BOOKED`; 422 `GUARANTEE_OUT_OF_RANGE` (outside the current rate card's declared range), `SLOT_END_NOT_AFTER_START`. |
| `GET /trips` | Orders not yet delivered, failed or cancelled, oldest first, with the courier they have now. |
| `GET /dispatch-queue` | Orders in the ops queue, oldest first, with each earlier stage's outcome: `CRITICAL` after 5 minutes or when a booking may exist (an uncertain create: check that company first), `INFO` when a courier took it after all, else `WARNING`. Ops clears an item by giving it to a rider or cancelling it. |
| `GET /positions` | The latest fix of each rider on shift or on a trip now (see "Data retention"): position, age, on shift, trip, mock flag. Operations roles only. |
| `POST /trips/{id}/reassign`, `/cancel` | See "Ops reassign and cancel". 409 `TRIP_NOT_REASSIGNABLE`, `RIDER_NOT_AVAILABLE`, `RATE_CARD_REQUIRED`, `TRIP_ALREADY_FINISHED`, `TRIP_NOT_CANCELLABLE`. |
| `GET /payout-batches`, `POST /payout-batches`, `GET /payout-batches/{id}` | Payout files: reads for payments and audit admins, changes for payments admins. `POST {kind: WEEKLY or DAILY_WITHDRAWAL, payoutDate}` (today or earlier, IST): 409 `BATCH_EXISTS`, 422 `NOTHING_TO_PAY`, `NOT_A_MONDAY`, `PAYOUT_DATE_IN_FUTURE`. |
| `GET /payout-batches/{id}/file` | The bank's CSV (`payoutId,holderName,accountOrUpiId,ifsc,amountRupees`) with full account numbers, decrypted only here; formula-like cells get a leading apostrophe; `no-store`; every download is audited without numbers. |
| `POST /payout-batches/{id}/approve`, `/mark-sent` | The second approver (403 `SAME_APPROVER` for the maker; 409 `BATCH_NOT_CREATED`); sent only after approval (409 `BATCH_NOT_APPROVED`). |
| `POST /payout-batches/{id}/payouts/{payoutId}/utr`, `/fail` | `{utr}` (12 to 22 letters and digits): PAID and posted to the journal; 409 `UTR_IN_USE`, `PAYOUT_NOT_PENDING`, `BATCH_NOT_SENT`; 503 `LEDGER_POSTING_OFF`. `{reason}`: FAILED, the money back in the balance, the rider's payouts paused. The file closes once no payout is pending. |
| `GET /holds?state=ACTIVE\|RELEASED`, `POST /holds`, `POST /holds/{holdId}/release` | Pay holds: `POST {tripId, reason, releaseOn}`; 409 `HOLD_EXISTS` (one per trip, ever), `EARNING_ALREADY_PAID`; 422 `RELEASE_DATE_OUT_OF_RANGE`; release: 409 `HOLD_NOT_ACTIVE`. |
| `GET /support-issues?state=OPEN\|ACKNOWLEDGED\|FIXED`, `GET /sos-events` | Issues oldest first; SOS presses of the last 7 days, newest first, with the last fix and the masked phone. |
| `GET /setup` | Test mode, the dispatch policy and rate card in force (null when none), the latest 20 versions of each, and the pilot riders and kitchens. Operations, support and audit admins. |
| `POST /rate-cards`, `POST /rate-cards/{version}/publish` | A DRAFT named `YYYY-MM-vN` (IST month): the 11 values, `effectiveFrom`, `summaryOfChanges` (`en` required, `te` and `hi` optional), `fullTextUrl`, and `ranges` only while none is published (422 `RANGES_LOCKED` after). Publish: 404 `VERSION_NOT_FOUND`, 409 `VERSION_ALREADY_PUBLISHED`, `START_TAKEN`, 422 `VERSION_REFUSED` (notice or ranges). |
| `POST /dispatch-policies` | `{mode, the 7 values, effectiveFrom?}`: created and published at once (see "Flags and settings"); `off` without `effectiveFrom` is the emergency stop. 409 `START_TAKEN`; 422 `VERSION_REFUSED`, `NOTICE_TOO_SHORT`, `DETOUR_NEEDS_NOTICE`, `RATE_CARD_REQUIRED`. |
| `PUT /pilot/riders/{riderId}`, `PUT /pilot/kitchens/{chefId}` | Adds to the test-mode allow-list, `{note?}` up to 200 characters; adding again changes the note. 404 `RIDER_NOT_FOUND`. `DELETE` removes (204 also when not listed). |

### Internal endpoints in the other services

| Service | Route | Does |
|---|---|---|
| auth-service | `POST /internal/v1/roles/rider/grant`, `/revoke` | `{identityId, riderId}` with `X-Craves-Internal-Secret`. RIDER is in the access token from the next sign-in or refresh; revoke bumps `token_version`, so older tokens stop working. Called by `FleetRoleClient` at activation and deactivation. |
| notification-service | `POST /internal/v1/push/realtime` | One high-priority FCM data message to the rider's phone while the caller waits, TTL = seconds left on the offer, never after it: data `{type: OFFER, offerId, offer, title, body}`; the app posts the visible notification on channel `rider_offers`. `X-Craves-Internal-Key`. |
| notification-service | `POST /internal/v1/ops-alerts` | Emails `CRAVES_OPS_ALERT_EMAILS` and logs `CRAVES_ALERT alert=OPS_ALERT`; 202 with the recipient count. |
| user-chef-service | `POST /internal/v1/maps/road-distance` | `{kitchenId?, addressId?, from, to}` → `{meters, seconds, source: OLA, CACHE or FALLBACK}`; Ola Directions with a 3 s deadline, cached 30 days; on any failure straight line × 1.3, not cached. |
| order-service | `POST /internal/v1/orders/{orderId}/delivery-code/verify` | `{code}`: 200 `{verified: true}`, 422 `DELIVERY_CODE_INVALID` with `attemptsLeft`, 423 `DELIVERY_CODE_LOCKED` after 5 wrong codes, 404, 403. Row lock and constant-time compare; it never changes the order status. |
| order-service | `GET /api/v1/orders/{orderId}/delivery-status` | Gains `deliveryCode`, non-null only for provider `craves_fleet` while `PICKED_UP`, `IN_TRANSIT` or `AT_DROPOFF` and not yet verified. Never in the chef's order view, logs or events. One read-only transaction (one pool connection) per call. |

## Riders, phones and shifts

### Due process (two tracks)

Nothing blocks a rider automatically, and declining or missing offers never changes anything.

- `SAFETY_PAUSE`: the rider is SUSPENDED now; `reviewBy` must be within 72 hours.
- `NOTICE`: changes nothing for 7 days; `deadline` at least 7 days ahead; the rider keeps working and sees the notice.
- `RESTORE`: back to ACTIVE. From PENDING it activates the rider (who must have signed in once) and grants RIDER in auth-service.
- `DEACTIVATE`: only after a safety pause, or once an open notice's deadline has passed; revokes RIDER.

Every event records the reason, the evidence summary, the approver and the appeal phone (required except for RESTORE). The table's CHECKs hold the 7-day and 72-hour limits too.

### Payout accounts

The full number (or UPI ID) is stored only as `BankDataCipher` stores chef bank details: AES-256-GCM with the versioned bank-data keys. Uniqueness uses a keyed HMAC of `UPI:<id>` or `BANK:<first 4 of IFSC>:<number>`, so the same account at another branch of the same bank still matches. Rotating the active bank key changes new fingerprints, so re-fingerprint current accounts when rotating. The holder name matches the KYC name when both have the same words, in any order, after removing accents, case, punctuation and the titles Mr, Mrs, Ms, Miss, Shri, Smt, Kumari and Dr; initials are words, so "R Kumar" does not match "Ravi Kumar".

### Phones

One bound phone per rider. `installationId` is the rider app's Android `ANDROID_ID`; the `rider_device` id is a name-based UUID of the rider id and the installation id, so the installation id itself is never stored.

- The rider's first installation is BOUND. The same installation again updates `fcm_token`, `app_version`, `model` and `last_seen_at`.
- Any other installation is stored PENDING_APPROVAL and answered 409 `DEVICE_NOT_BOUND`. A REPLACED phone that registers again goes back to PENDING_APPROVAL.
- Ops approves it (`POST .../devices/{deviceId}/approve`): it becomes the one BOUND phone, the old one REPLACED, and an open shift's credential is revoked (the old phone gets a stop on its next `/locations`).
- With the shift credential instead of a JWT, the rider is the credential's (it must be live, else 401 `SHIFT_CREDENTIAL_INVALID`).

Offer pushes go to the BOUND phone's `fcm_token`.

### Shifts and the shift credential

`POST /shift/start` checks, in this order:

| Status | Code | When |
|---|---|---|
| 403 | `RIDER_NOT_ACTIVE` | The rider is not ACTIVE. |
| 409 | `DEVICE_NOT_BOUND` | `X-Craves-Installation-Id` is missing or is not the rider's bound phone. |
| 403 | `APP_UPDATE_REQUIRED` | The bound phone's `appVersion` is below `minAppVersion` (403, not 426: 426 means an HTTP protocol upgrade). Checked only here, so a running shift is never cut off. |
| 403 | `DOCUMENTS_EXPIRED` | The DL, RC, insurance or PUC has no VERIFIED copy whose `expires_on` is today (IST) or later; a missing expiry counts as expired. The message names them. |
| 422 | `SELFIE_INVALID` | Not a JPEG, empty, or over 5 MB. |
| 409 | `SHIFT_OPEN` | A shift is open on another phone. |

The selfie goes to `riders/<riderId>/selfies/<shiftId>.jpg`, PENDING in the console's selfie queue. The credential is 32 random bytes, base64url; only its SHA-256 (hex) is stored in `rider_shift.credential_hash`. It expires 12 hours after the shift started (the table's CHECK) and is valid only for `/locations` and `/devices`: Spring Security lets only those two routes through without a JWT, and `FleetShiftCredentialSecurityTest` walks every rider and admin route with only a credential to prove that only these two answer. A second start from the same phone while its shift is open (the app lost the credential) rotates that shift's credential and keeps the first selfie. A shift past its 12 hours, or whose credential ops revoked, is closed at the next start.

### Location ingest

`POST /api/v1/rider/locations` body `{fixes: [{lat, lng, accuracyM, at, mock}]}`, 0 to 5 fixes (more is 400; an empty list is the heartbeat).

- **Who.** With `X-Craves-Shift-Credential` the shift is the one whose `credential_hash` matches (unknown: 401). Without it, a RIDER JWT and the rider's open shift (none: a stop).
- **Fixes.** Fixes with impossible values, from before the shift started or more than 5 minutes ahead of the database clock are dropped. Only fixes newer than the shift's stored latest fix are used, so a resent batch writes nothing twice. `at` is the phone's fix time, so a phone whose clock runs more than 5 minutes fast sends no usable fixes (its heartbeat, offers and stop still work); riders should keep automatic time on.
- **Writes.** `rider_position_latest` (the newest fix wins, with `mock`, `shift_id` and the trip in progress); `trip_track` (every new fix, with `mock`, only while a trip is in progress, ASSIGNED to AT_DROP); in-zone seconds (below).
- **Heartbeat.** Every call that isn't a stop, with or without fixes, updates the shift row: `last_seen_at = now()`, `max_silence_seconds` (the longest gap between two calls; the first gap counts from `started_at`) and `silences_over_60s`. Dispatch, ops reassign and the watchdog read `last_seen_at`, not `rider_position_latest.received_at`, which only moves when a newer fix arrives.
- **Answer.** `{offers, activeTrip?, stop?, stopReason?}`. `offers`: the rider's ACTIVE offers not yet expired, built by `FleetTripModels.offer`, the one mapping the offer push uses too: `expiresInSec` by the database clock, `kitchenArea`, `customerLocality`, `itemsCount` (left out while 0), `payLines` from `trip_offer.pay_lines` (`[{component, label, amountPaise}]`) and `estMinutes` = (pickup m + drop m) / 333 rounded up, + 5. `activeTrip`: `{tripId, step, version}` with a rider-v1 TripStep (`FleetTripModels.step`); an ended or reassigned trip is reported once more with its final step so the app leaves trip mode.
- **Stop.** `{offers: [], stop: true, stopReason}` and the shift is closed when the rider is not ACTIVE, the shift was ended, its credential was revoked, or its 12 hours are up.

**Zone model.** There is no zone geometry yet: `rider_slot` holds a zone name and a time window, `dispatch_policy` only a radius. So the gap between two consecutive non-mock fixes counts while one of the rider's BOOKED slots is running, clipped to that slot and at most 60 seconds per gap. It is added to that slot's `in_zone_seconds` (what the guarantee settles on) and to the shift's, in one statement; a slot that settled meanwhile keeps its settled seconds. Upgrade: add zone geometry when ops draws the pilot area and test each fix against it.

**Statement budget.** One call runs at most 5 statements in one transaction: (1) read the shift, rider, latest position, trip in progress, previous trip and running slot, locking the shift row; (2) upsert `rider_position_latest`; (3) one multi-row `trip_track` insert, only on a trip; (4) update the shift row on every call: the heartbeat, the survival counters and the in-zone seconds of the shift and its slot, in one statement; (5) read the offers. A stop runs statement 1 and one shift update. `FleetLocationApiDatabaseTest.twoHundredCallsStayWithinFiveStatementsEach` counts them. The load target, 20 calls a second for 10 minutes, is at most 60,000 statements (100 a second) on one pooled connection per call for a few milliseconds. EXPLAIN on Postgres 16 with 2,000 riders, 62,000 shifts, 200,500 trips and offers and 42,000 slots uses an index for every table (the credential is cast to `CHAR(64)` so its unique index applies), and the track insert goes straight to the day's partition.

## Dispatch and trips

### Dispatch chain

`dispatch_policy` mode governs it; with no published policy in force, or mode `off`, nothing below happens and Borzo and Pidge run exactly as before.

1. The delivery command (`DeliveryCommandWorker`) asks `DeliveryProviderRouter.fleetStage` first. `FleetDispatcher` plans: the chef from the checkout's finance quote (`payment_schema.finance_issued_snapshot`; unknown chef: no fleet), test mode, the drop's road distance, eligible riders (ACTIVE, open shift, no active trip or open offer, heard from: a `/locations` call in the last 45 s by `rider_shift.last_seen_at` and a real fix under 3 minutes old, inside the policy radius), pay per rider and the cost guard (locked pay + overhead ≤ the next courier's live quote + premium; no quote: riders may go). `shadow` logs `FLEET_SHADOW` and stops there.
2. `live`: one transaction creates the trip (`SEARCHING`, order code `#` + the first 8 characters of the sub-order id, as the chef and customer see it), the fleet stage (deadline = fleet stage seconds) and offers to the 3 nearest (pay, rate card version and both distances locked). Each offer is pushed with TTL = seconds left. Borzo's 120-second window has not started.
3. The fleet stage closes on an accept (in the accept's own transaction: delivery job `craves_fleet`, `COURIER_ASSIGNED` with the rider card) or, at its deadline or once no offer is open, by a conditional update on the same stage row; then `BORZO` opens for 120 s (when the timed policy is ready, else `PIDGE`) and routing books as before. A late accept finds the stage closed: 410.
4. The dispatch tick (`FleetDispatchJobs`, every 5 s) expires offers, moves `BORZO` to `PIDGE` at its deadline and closes a stage when its courier is assigned. A Pidge stage past its deadline, a courier who cancelled, or an uncertain create (never retried) goes to `OPS_QUEUE` with the ops alert `FLEET_DISPATCH_QUEUE`; a courier booked after all clears the queue entry.
5. Watchdog, on the heartbeat (`rider_shift.last_seen_at`, set by every location call with or without a new fix): a rider on the way to the kitchen (`ASSIGNED`) whose phone has not called for 90 s loses the trip. At the kitchen (`AT_PICKUP`) the rider may already hold the food, so 90 s silent sends ops one `FLEET_RIDER_SILENT_AT_KITCHEN` (recorded as the trip event `WATCHDOG_ALERTED`) and the trip goes back only at 300 s silent (blueprint E2). A trip that goes back is `CANCELLED` with pickup-leg pay held for ops, ops gets `FLEET_RIDER_LOST`, and the tick books Borzo or Pidge with `handoffFromProviderId: craves_fleet`. order-service accepts that hand-over only from a rider before pickup, clears the rider card the chef sees, and the customer's code goes with it. A later Borzo to Pidge hand-over counts only couriers of that Borzo delivery.
6. Cancellation: integration-service hears that the customer or the chef cancelled as the refund order-service then requests (`payment_schema.refund` for the sub-order). From then on an accept is 409 `ORDER_CANCELLED`, and the next tick ends the trip through `FleetTripService.cancel`: open offers withdrawn, every open stage closed, a rider already on the trip paid for the state reached, not held. A Borzo or Pidge courier already booked is not cancelled: no order has that path yet.

`craves_fleet` (`CravesFleetAdapter`) is inactive in the catalog: routing never quotes or creates it. `track()` maps the trip to the pipeline; `cancel()` ends a trip as in step 6.

Borzo and Pidge get the same order number: pickup note "Craves order #N. Match this number with the kitchen.", dropoff note "Craves order #N.", matter "Food order #N" (order-service `OrderNumber`). The Craves delivery code is never sent to them.

### Ops reassign and cancel

Both go through the dispatch chain, in one transaction, audited and idempotent, so an order never has two couriers recorded. The open stage closes first by the same conditional update an accept uses, and its offers are withdrawn.

- **To a rider** (`riderId`): only an order no rider holds yet (still searching, or in the Borzo, Pidge or ops-queue stage with no courier booked). Outside the fleet stage the delivery command is taken over first, only if it is not booking right now (else 409, try again in a minute). The rider must be ACTIVE, on shift, free, heard from (a call in the last 45 s and a real fix under 3 minutes old, as for dispatch) and allowed by test mode. Pay is locked as for an accepted offer, on a published rate card that has started (the trip's own, else the one in force; none: 409 `RATE_CARD_REQUIRED`, "Publish a rate card before giving trips to riders."), then the usual `COURIER_ASSIGNED`. Call the rider first: nothing rings; the trip appears on their next location call.
- **To Borzo or Pidge** (`provider`): a rider's trip before pickup ends for that rider with pay for the trip so far (not held) and that stage opens; the tick books it. An order still searching gets that stage.
- Refused: a rider's trip to another rider (a trip row is one rider's pay record), anything after pickup (cancel instead), and any order Borzo or Pidge already holds.
- **Cancel**: a rider's trip ends with the trip-state pay rule (not held) and `CANCELLED` reaches the order. An order still searching stops and its delivery command is marked `DEAD_LETTER`. A courier booked at that moment is not recorded and ops gets `FLEET_COURIER_UNRECORDED` to cancel it.
- The reason goes to the audit trail. A released rider sees a fixed line, never the ops reason.

### Trip steps and statuses

`FleetStatusBridge` sends fleet statuses through the existing delivery-status pipeline as provider `craves_fleet`, while the trip's latest stage is the fleet's. `DELIVERY_STATUS_CHANGED` carries the optional `courierName`, `courierPhone`, `courierPhotoUrl` and `pickupEtaAt` (`contracts/events/delivery-status-changed-v1.schema.json`), filled for fleet riders and from Pidge's `fulfillment.rider`; order-service stores them in the columns the chef sees, and the customer sees the rider card.

| Trip state | App step | Delivery status published | Reached by |
|---|---|---|---|
| `SEARCHING` | (offer) | none | fleet stage open |
| `ASSIGNED` | `TO_KITCHEN` | `COURIER_ASSIGNED` + rider card | accept |
| `AT_PICKUP` | `AT_KITCHEN` | `AT_PICKUP` | `arrived-pickup` (and `food-not-ready`, no status) |
| `PICKED_UP` | `PICKED_UP` | `PICKED_UP`, then `IN_TRANSIT` once a real fix arrives after pickup | `picked-up` |
| `AT_DROP` | `AT_DROP` | `AT_DROPOFF` | `arrived-drop` |
| `DELIVERED` | `DELIVERED` | `DELIVERED` | `delivered` (OTP, or photo) |
| `FAILED` | `FAILED` | `FAILED` | `failed` after pickup |
| `CANCELLED` | `CANCELLED` | `CANCELLED`, unless another stage took the order | order cancelled, ops cancel, watchdog |

Each step is idempotent (a repeated key, or a step already taken, returns the trip), in order (else 409 `STEP_CONFLICT`; an ended trip is 409 `TRIP_NOT_ACTIVE`), and moves `trip.version`. The rider card is the first name and initial ("Ravi K.") and the rider's phone; no photo URL. `sealed` is false: orders have no sealed flag yet.

- The free wait runs from the later of the arrival inside the kitchen zone (a real fix under 2 minutes old within 300 m, checked at `arrived-pickup` and again at `food-not-ready`) and the chef's ready time, and stops at `picked-up`.
- `delivered {method: OTP, otp}` asks order-service once per attempt: 422 `OTP_INVALID` with `attemptsLeft` 4 to 1, then 423 `OTP_LOCKED` from the fifth wrong code on (the rider never sees "0 tries left"). An order accepted before delivery codes existed (order-service 404) has no code: 423 `OTP_LOCKED` at once, so the photo route opens. A repeated key gets its first answer without asking again.
- `delivered` multipart `{method: PHOTO, callsMade, photo}` needs two calls (422 `CALLS_REQUIRED`) and the unreachable wait since `arrived-drop` (422 `WAIT_NOT_OVER`), or an OTP lock; a JPEG or PNG under 10 MB (422 `PHOTO_REQUIRED`). The photo goes to `riders/{riderId}/trips/{tripId}/`; the pay is held for ops.
- `failed {reason, note}` after pickup: `CUSTOMER_UNREACHABLE` (at the drop, after the wait) is full pay; `WRONG_ADDRESS`, `CUSTOMER_REFUSED`, `UNSAFE` are full pay plus the return. Held for ops.

### Pay and slots

Pay (`FleetPay`): base + drop km after the base km + pickup km after the free km (straight line × detour) + waiting after the free minutes, pro rata, in paise. Cancelled riding to the kitchen: pickup leg; at the kitchen: cancellation fee + pickup leg + waiting; after pickup: full + return. Every paid end stores the lines on the trip and publishes `FleetTripPayFinalized(tripId, riderId, rateCardVersion, lines, held, holdReason, finalizedAt)`; the money code writes the ledger.

Ops books a rider into a zone with a guaranteed hourly minimum inside the rate card's declared range; Home shows the next booked slot and its guarantee. Each minute a finished slot settles once: top-up = max(0, guarantee × in-zone hours − trip pay that finished in the slot) into `rider_slot_settlement`, on the slot's own in-zone seconds, so a shift across several slots pays each slot only for its own minutes. Declines never enter it.

## Jobs and the fleet pool

Fleet jobs run on their own pool, `fleetScheduler` (`FleetConfiguration`, fleet flag), watched by `SchedulerLagWatchdog`, with one thread per job (`FleetConfigurationTest.theFleetPoolHasOneThreadForEachFleetJob`, `ScheduledJobsUseNamedPoolsTest`). A fixed-delay job never overlaps itself.

| Job | When | Does |
|---|---|---|
| `RiderJoinsExitsExport.writeYesterday` | 00:20 IST | Yesterday's joins and exits CSV to `riders/exports/rider-joins-exits-YYYY-MM-DD.csv`. JOINED is a move to ACTIVE from PENDING (or a rejoin); EXITED is a deactivation. |
| `FleetSlotService.settleDue` | every 60 s | Settles finished slots. |
| `FleetDispatchJobs.tick` | every 5 s | Offer expiry, stage deadlines, the watchdog, the ops queue, cancelled orders, forgetting off-shift positions. |
| `FleetLocationService.createTrackDays` | 1 min after start, then every 6 h (location ingest flag) | Creates the next 7 days of `trip_track` partitions, never today; a failure logs `CRAVES_ALERT alert=TRIP_TRACK_PARTITION_FAILED`. Then drops day partitions older than 90 days and deletes older rows in `trip_track_default`; a failure logs `CRAVES_ALERT alert=TRIP_TRACK_RETENTION_FAILED`. A drop waits at most 3 s for its lock. |
| `FleetEarnings.tick` | every 60 s | Credits finished trips and slot top-ups still waiting, releases holds that are due. |

A trip's credit after its delivery commits is also handed to this pool (`FleetEarnings.onTripPayFinalized`), so the rider's request never waits for a second database connection; if the pool refuses it, the money job credits it.

V152 creates a default `trip_track` partition and one per IST day for the 8 days from the day it runs. By hand:

```sql
CREATE TABLE IF NOT EXISTS fleet_schema.trip_track_20261028 PARTITION OF fleet_schema.trip_track
  FOR VALUES FROM ('2026-10-28 00:00+05:30') TO ('2026-10-29 00:00+05:30');
```

If fixes for that day already landed in `trip_track_default`, the statement fails: move those rows out of the default partition first.

### Data retention

Location is collected only while the rider is online, and kept only as long as below (blueprint E6, Gopi's defaults; the rider privacy notice text is the lawyer's, and DPDP duties apply from 13 May 2027).

| Data | Kept | How |
|---|---|---|
| Latest position (`rider_position_latest`) | While the rider is on an open, unexpired shift or on a trip, then 15 minutes after the last fix | `FleetDispatchJobs.forgetOffShiftPositions`, every 5 s. Ops `GET /positions` lists only riders on shift or on a trip. |
| On-trip fixes (`trip_track`) | 90 days | `FleetLocationService.createTrackDays` drops the IST day partitions and deletes `trip_track_default` rows past 90 days. |
| Delivery photos (`riders/<riderId>/trips/<tripId>/delivery-…`) | 90 days | Not automated yet: P2-09 adds the delete job. |
| Shift selfies (`riders/<riderId>/selfies/…`) | 30 days | Not automated yet: P2-09 adds the delete job. |

Never stored: a full Aadhaar number (there is no Aadhaar document type), or location while the rider is offline (the app never asks for background location).

Database connections: every service sets its Hikari pool explicitly so that pool × max replicas, summed over the eight apps on the shared server, stays within 45 (`scripts/release/check-db-connection-budget.py`, 43 today; integration-service 4 × 2, order-service 3 × 3). integration-service's other jobs keep one thread per job on their own watched pools.

## Money

### Earnings ledger

`FleetEarnings` (fleet flag) turns pay into money:

1. A trip that ends with pay publishes `FleetTripPayFinalized`. After the trip's transaction commits, the fleet pool credits it in its own transaction: a failed credit never undoes a delivery. The money job credits any finished trip still without `trip.pay_credited_at`, and every slot settlement without `credited_at`.
2. Each pay line becomes a `rider_earning` row with key `fleet-trip-pay/{tripId}/{component}/{revision}` (revision 1) and one balanced journal in the immutable ledger with the same `business_event_key`: debit `DELIVERY_EXPENSE`, credit the pooled `RIDER_PAYABLE`, lines tagged `delivery_attempt_id` = trip and `provider_id` = `craves_fleet`. The unique key (in both tables) makes a second credit impossible, and every trip's journal lines net to zero. A slot top-up is its own component, `slot-top-up`.
3. A row is pending until `withdrawable_at`, 24 h after the delivery. It counts towards the balance only once past that, with no active hold on its trip and no open support issue raised on the trip before then (an issue blocks that trip's pay until it is FIXED or 7 days pass).
4. A held trip (photo delivery, failed delivery, rider lost before pickup) gets a hold at credit with its own reason, released at 00:00 IST 7 days after the trip at the latest. Ops can place one hold per trip and release it early. Holds touch that trip only.
5. Adjustments are later revisions of a component (2 and up) with the reason the rider sees (`FleetEarnings.adjustTrip`, service code only: `admin-fleet-v1` has no adjustment endpoint). A negative one is debt (debit `RIDER_PAYABLE`, credit `DELIVERY_EXPENSE`), recovered only from future pay.
6. TDS (off by default): each credit withholds `rate × the rider's gross this financial year (from 1 April IST) − TDS already withheld this year`, nothing while the year's gross is at or under the threshold, at most the credit itself. It is its own row (`component` `tds`) and journal: debit `RIDER_PAYABLE`, credit `RIDER_TDS_PAYABLE`.

Postings for one ₹67 trip on the draft rate card (drop 4.2 km, pickup 1.8 km):

| Key | Debit | Credit | ₹ |
|---|---|---|---|
| `fleet-trip-pay/{trip}/base/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 40.00 |
| `fleet-trip-pay/{trip}/drop-km/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 19.80 |
| `fleet-trip-pay/{trip}/pickup-km/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 7.20 |
| `fleet-trip-pay/{trip}/tds/1` (TDS on, threshold crossed, 1%) | `RIDER_PAYABLE` | `RIDER_TDS_PAYABLE` | 0.67 |

A photo delivery posts the same journals; only the hold differs.

### Payouts

`FleetPayouts` (fleet flag). Nothing moves money by itself; a person uploads every file to the bank.

- **Balance.** available = released pay (net of TDS) − payouts that did not fail (requested withdrawals included) − debt recovered. Withdrawable = available − this week's recovery (outstanding debt, at most the weekly cap), never below zero.
- **Weekly payout.** A WEEKLY file on a Monday pays every rider with a verified, unpaused account their whole withdrawable balance, by IMPS, no minimum. Making it records this week's recovery (`rider_recovery`). Riders with nothing, a negative balance or no account are left out. Debt is never debited from a bank.
- **Daily withdrawal.** One a day per rider (IST), free, up to the withdrawable balance. It is a payout (`DAILY_WITHDRAWAL`, date = tomorrow) at once, so the balance drops at once; the DAILY_WITHDRAWAL file for a date takes every request for that date or before not yet in a file.
- **Never twice.** A payout belongs to one file. A sent payout stays processing until ops marks its UTR or a final failure; nothing re-sends it.
- **Failure.** FAILED with the bank's reason: the money stays in the balance, and the account is paused (`features` false, `PAYOUTS_PAUSED`, left out of files) until ops sets a new account in person or confirms one the rider sends.
- **Ledger.** Only a UTR posts: `fleet-payout/{payoutId}/paid`, debit `RIDER_PAYABLE`, credit `BANK`, evidence `utr/{UTR}`. So `RIDER_PAYABLE` = all rider pay − paid payouts.

### Payout runbook for ops

Weekly: on Monday, approved by 13:00, sent by 15:00 IST. Daily withdrawals: every morning, paid by 13:00.

1. **Create the file.** A payments admin (the maker) makes it in the console: Payouts → WEEKLY with Monday's date, or DAILY_WITHDRAWAL with today's date. Never type amounts or build a file in a spreadsheet.
2. **Download** the bank file (audited). Check the total and the count against the console.
3. **Second approver.** Another payments admin (the checker) checks the file total against the console, the count against riders with a balance, any payout above twice the rider's usual week, any payout account changed in the last 7 days, and any payout that already has a UTR; then approves. The maker cannot approve (403 `SAME_APPROVER`).
4. **Bank upload.** Upload the approved file once to the bank's IMPS bulk upload (use the bank's own two-user approval if it has one), then **mark sent**. Never upload a file twice, and never re-send a payout the bank still shows as processing (up to T+3 working days).
5. **Mark UTRs.** Enter each confirmed payout's UTR within 2 hours; the rider sees it. For a final failure (account closed, invalid), mark it failed with the bank's reason: the money stays in the rider's balance and their payouts pause; set a new account with the rider in person, and the next file includes them.
6. **Reconcile** daily: every UTR on the bank statement matches a payout with the same amount; the file total equals its PAID payouts plus those still pending; `RIDER_PAYABLE` debits for `RIDER_PAYOUT_PAID` equal the PAID payouts; no file stays SENT with pending payouts past T+3 working days without a call to the bank.

### Support and SOS

- A rider reports a problem on a trip, a payout or nothing (`MISSING_PAY`, `WRONG_DISTANCE`, `PAYOUT_NOT_RECEIVED`, `WRONG_DEDUCTION`, `APP_PROBLEM`, `OTHER`). Support acknowledges within 24 hours and fixes within 72. `admin-fleet-v1` has no endpoint to acknowledge or fix an issue yet; until it does, set `state` by SQL (`ACKNOWLEDGED` with `acknowledged_at`, `FIXED` with `fixed_at`). An open issue stops holding the trip's pay after 7 days anyway.
- SOS: `FleetSupportService.sos` stores the press (`sos_event`) first, then calls `/internal/v1/ops-alerts` (kind `SOS`): "SOS from rider <name>", the full phone, `https://maps.google.com/?q=<lat>,<lng>` with the fix time, and the trip's order code. Set `CRAVES_OPS_ALERT_EMAILS` to the ops lead. `alerted_at` is set when notification-service accepted it; otherwise the alert is a `CRAVES_ALERT alert=SOS` log line with the same data.

## Gateway

Both APIs are published on the mobile gateway (`api.craves.in`) by `scripts/apim/configure-rider-fleet-apim.sh`: `craves-rider-v1` (`api/v1/rider`) and `craves-admin-fleet-v1` (`api/v1/admin/fleet`), every contract operation (`infra/apim/rider-fleet/routes.txt`), with status and rollback scripts and four manual pipelines (`azure-pipelines-rider-fleet-apim*.yml`; writes only from main). Rider routes need a Bearer header; `/locations` and `/devices` also take `X-Craves-Shift-Credential`, which every other route drops. Policies, rate limits and how a person deploys or rolls back: `infra/apim/rider-fleet/README.md`.

## Replay and shadow

`FleetReplayRunner` (test scope, run by hand) replays recorded orders and Borzo/Pidge quotes for a date range and pilot area through the fleet stage's decisions with synthetic riders, read-only, and writes a markdown and CSV report with the break-even u* = C_h ÷ (P_eff − v). Shadow mode stays off until people switch it after the customer launch. How to run and switch: `docs/riders/REPLAY.md`.

## Test mode for one rider and one kitchen

1. Deploy in the order above. The runtime pipeline (`azure-pipelines-rider-fleet-runtime.yml`, stages status, wire, enable and disable; step by step in `GO-LIVE.md`) sets what follows. Keep `CRAVES_FLEET_TEST_MODE=true` (the default) and set `CRAVES_FLEET_ENABLED=true`, `CRAVES_FLEET_RIDER_API_ENABLED=true` and `CRAVES_FLEET_LOCATION_INGEST_ENABLED=true`, plus the storage, bank-data, support-phone and internal URL settings (`CRAVES_AUTH_INTERNAL_BASE_URL`, `CRAVES_USER_CHEF_INTERNAL_BASE_URL`, `CRAVES_FLEET_ORDER_BASE_URL`, `CRAVES_NOTIFICATION_INTERNAL_BASE_URL`, `CRAVES_INTERNAL_SERVICE_KEY`). In notification-service set `CRAVES_REALTIME_PUSH_ENABLED=true` and `CRAVES_OPS_ALERT_EMAILS`.
2. The rider installs the app, signs in with their phone and signs up (or ops adds them in the console with `POST /riders` and they sign in once so `/me` links them). They send their documents and payout account from the app. Ops reviews each document with its expiry date, confirms the payout account against the bank proof (or sets it in person), and activates them with `RESTORE`.
3. Add both to the pilot in the console (`PUT /pilot/riders/{riderId}` and `PUT /pilot/kitchens/{chefId}`, the chef's identity id). Dispatch asks `FleetTestMode.riderAllowed` and `kitchenAllowed` before it offers a trip, so nobody else is touched. The kitchen is known only for orders checked out with the finance quote (`finance_issued_snapshot`).
4. Publish the rate card in the console (the first one may start at once), then set dispatch: `shadow` first (it only logs `FLEET_SHADOW`), and `live` only after order-service with the `craves_fleet` hand-over is deployed. `off` stops dispatch at once. `GET /setup` shows what is in force.
5. The rider registers the phone, goes online with a selfie, and the allow-listed kitchen accepts an order: the offer rings within the fleet stage. For money, turn on `CRAVES_LEDGER_POSTING_ENABLED` (the existing journal gate); credits wait until then.
