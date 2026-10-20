# Rider backend (integration-service, package `in.craves.integration.fleet`)

The rider fleet runs inside integration-service with its own schema, `fleet_schema`, in the integration database. Plan: project doc `rider-app/PLAN.md`. Contracts: `contracts/openapi/rider-v1.yaml` (rider app) and `contracts/openapi/admin-fleet-v1.yaml` (ops console).

## Flags

Environment flags only switch code paths on. All are off by default.

| Variable | What it switches on |
|---|---|
| `CRAVES_FLEET_ENABLED` | Every fleet bean: admin API, policy readers, test mode, storage, the RIDER role client, the fleet scheduler pool, the daily export job, slot settlement, and dispatch (the fleet stage, the `craves_fleet` adapter, the dispatch tick). Off means no fleet bean or job exists (`FleetConfigurationTest`). |
| `CRAVES_FLEET_RIDER_API_ENABLED` | The rider API under `/api/v1/rider` (needs `CRAVES_FLEET_ENABLED` too). |
| `CRAVES_FLEET_LOCATION_INGEST_ENABLED` | `POST /api/v1/rider/locations` and the daily `trip_track` partition job (needs the two flags above too). |
| `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` | Keep it false. Payouts are manual in this phase and RazorpayX is never called: no automated execution exists. The only reader is a guard in `FleetPayouts` that, when it is true, starts nothing and logs `CRAVES_ALERT alert=FLEET_PAYOUT_EXECUTION_REFUSED`. |

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
| `CRAVES_LEDGER_POSTING_ENABLED` | `false` | The existing financial-journal gate. Rider credits post to the journal, so they wait (`CRAVES_ALERT alert=FLEET_CREDITS_WAITING`) until it is on; the money job then credits them. |
| `CRAVES_FLEET_TDS_ENABLED`, `CRAVES_FLEET_TDS_SECTION`, `CRAVES_FLEET_TDS_RATE_BASIS_POINTS`, `CRAVES_FLEET_TDS_ANNUAL_THRESHOLD_PAISE` | off, empty, 0, 0 | TDS on rider pay (see Money). The CA sets the section, the rate (100 = 1%) and the yearly threshold; on without a section or a rate of 1 to 10000, credits fail with `FLEET_TDS_MISCONFIGURED` and wait. |
| `CRAVES_FLEET_MONEY_INTERVAL_MS` | `60000` | The money job (fleet pool): credits waiting trips and slot top-ups, releases holds that are due. |
| `CRAVES_FLEET_RECOVERY_WEEKLY_CAP_PAISE` | `50000` | Debt from a negative adjustment is recovered from future pay, at most this much a week (₹500 is a placeholder business input). |

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
| `rider_earning` | Pay lines, unique key `fleet-trip-pay/{tripId}/{component}/{revision}`, net = gross − withheld. V156: a slot top-up's key is `fleet-slot-pay/{slotId}/slot-top-up/1`; `label`; `reason` (required on revisions after 1, except `tds`). |
| `rider_payout_instruction` | Weekly payouts and daily withdrawals with UTRs. |
| `rider_withdrawal_day` | One withdrawal per rider per IST day. |
| `support_issue` | Problems riders report, with acknowledge-by and fix-by times. |
| `sos_event` | SOS presses with the last fix. |
| `admin_audit` | Append-only trail of every ops action; mutations also keep their Idempotency-Key and first response. |
| `rider_slot_settlement` (V154) | One per finished slot: online in-zone seconds, the guarantee, trip pay in the slot and the top-up; `credited_at` is set by the money phase. |
| `chef_ready` (V155) | The chef's ready time per sub-order, kept even when it arrives before the trip. |
| `support_issue` (V158 index) | V158 indexes it by trip, for the open-issue check on a trip's pay. |
| `rider_payout_batch` (V157) | A payout file: kind, date (WEEKLY on a Monday), status `CREATED` → `APPROVED` → `SENT` → `CLOSED`, maker and checker (the table refuses the maker as approver). V157 also adds `rider_payout_instruction.batch_id` (a payout is in one file only), the account's `payouts_paused_at` and `paused_reason`, the withdrawal's `idem_key`, and `rider_recovery` (one debt recovery per rider per week). |
| `rider_pay_hold` (V156) | One hold per trip, ever: reason, `release_on` (today to 7 days ahead, IST), who placed and released it. V156 also adds `trip.pay_credited_at` and the journal accounts `RIDER_PAYABLE` and `RIDER_TDS_PAYABLE`. |

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
| `GET /home` | `online` and `shiftStartedAt` (an open shift whose credential still works), `activeTripId` (trip in progress), the running or next booked slot with its own guaranteed hourly pay and rest point, `zoneName` and `slotEndsAt` while a slot runs, the ops banner until its `until`, and `todayEarningsPaise` (net of TDS) and `todayTrips` from credited pay. |
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
| `GET /earnings?range=today\|week&cursor=` | Trips with credited pay (`FleetMoneyController`), newest first, 20 a page; `totalPaise` is the whole range, slot top-ups included. The week is Monday 00:00 to Sunday 23:59 IST. |
| `GET /payouts` | `nextPayoutOn` (Monday; today until 15:00 IST on a Monday), `withdrawablePaise`, and the latest 50 payouts: `SCHEDULED` (requested or in an unsent file), `PROCESSING` (file sent), `PAID` with `utr` and `paidAt`, `FAILED`. |
| `POST /withdrawals` | `{amountPaise}` with `Idempotency-Key`. 204, paid in the next day's file (by 13:00). 409: `WITHDRAWAL_LIMIT` (one a day, IST), `AMOUNT_OVER_BALANCE`, `PAYOUT_ACCOUNT_REQUIRED`, `PAYOUTS_PAUSED`, `IDEMPOTENCY_KEY_REUSED` (same key, other amount); the same key and amount answers 204 again. Free. |
| `POST /support/issues` | `{category, tripId?, payoutId?, note?}` (`FleetSupportController`): 204, with acknowledge-by +24 h and fix-by +72 h. The trip or payout must be the rider's own (404 `TRIP_NOT_FOUND`, `PAYOUT_NOT_FOUND`); an issue on a trip raised before its pay is withdrawable holds that pay until FIXED or 7 days. |
| `POST /sos` | `{tripId?, fix?}`, body optional: 204 once stored with the fix, or the rider's latest position if the fix is missing or out of range (a trip that is not the rider's is dropped). Then the ops lead is alerted at once (below). Never refused for a missing location. |
| `GET /earnings/trips/{tripId}` | One trip: lines (TDS and adjustments are lines too), distances, `rateCardVersion`, status `CREDITED`, `HELD` (`holdReason`, `releaseOn`) or `ADJUSTED`. 404 `TRIP_NOT_FOUND` for another rider's trip. |

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
| `GET /payout-batches`, `POST /payout-batches`, `GET /payout-batches/{id}` | Payout files (`FleetMoneyAdminController`): reads for payments and audit admins, changes for payments admins. `POST {kind: WEEKLY or DAILY_WITHDRAWAL, payoutDate}`: 409 `BATCH_EXISTS`, 422 `NOTHING_TO_PAY`, `NOT_A_MONDAY`. The list leaves out the payout rows. |
| `GET /payout-batches/{id}/file` | The bank's CSV (`payoutId,holderName,accountOrUpiId,ifsc,amountRupees`) with full account numbers, decrypted only here; cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe; attachment, `no-store`; every download is audited (`PAYOUT_FILE_DOWNLOADED`, no numbers in the audit). |
| `POST /payout-batches/{id}/approve`, `/mark-sent` | The second approver (403 `SAME_APPROVER` for the maker; 409 `BATCH_NOT_CREATED`); sent only after approval (409 `BATCH_NOT_APPROVED`). |
| `POST /payout-batches/{id}/payouts/{payoutId}/utr`, `/fail` | `{utr}` (12 to 22 letters and digits, stored in capitals): PAID and posted to the journal; 409 `UTR_IN_USE`, `PAYOUT_NOT_PENDING`, `BATCH_NOT_SENT`; 503 `LEDGER_POSTING_OFF` while the journal is off. `{reason}`: FAILED, the money back in the balance, the rider's payouts paused. The file closes once no payout is pending. |
| `GET /support-issues?state=OPEN\|ACKNOWLEDGED\|FIXED`, `GET /sos-events` | (`FleetSupportAdminController`) Operations, support and audit admins: issues oldest first; SOS presses of the last 7 days, newest first, with the last fix and the masked phone. |
| `GET /holds?state=ACTIVE\|RELEASED`, `POST /holds`, `POST /holds/{holdId}/release` | Pay holds (`FleetMoneyAdminController`): reads for payments, operations and audit admins; changes for payments admins. `POST {tripId, reason, releaseOn}`: 404 `TRIP_NOT_FOUND`, 409 `HOLD_EXISTS` (one hold per trip, ever), 409 `EARNING_ALREADY_PAID` (the pay was already withdrawable when a payout or withdrawal was made), 422 `RELEASE_DATE_OUT_OF_RANGE`; release: 409 `HOLD_NOT_ACTIVE`. |
| `GET /trips` | Orders not yet delivered, failed or cancelled, oldest first, with the courier they have now (`FleetOpsController`): the open stage while booking, Borzo or Pidge (state from their status) once they hold the job, else the rider's trip. Support and audit read too. |
| `GET /dispatch-queue` | Orders in the ops queue (riders, Borzo and Pidge took none), oldest first, with each earlier stage's outcome. `CRITICAL` after 5 minutes or when a booking may exist (an uncertain create: check that company first), `INFO` when a courier took it after all (the tick clears it), else `WARNING`; the message says what to do and how long it has waited. Ops clears an item by giving it to a rider or cancelling it. The same alerts reach ops through notification-service. |
| `POST /trips/{id}/reassign` | `{riderId}` or `{provider: BORZO\|PIDGE}`, with a reason; see "Ops reassign and cancel" below. 409 `TRIP_NOT_REASSIGNABLE`, `RIDER_NOT_AVAILABLE`. |
| `POST /trips/{id}/cancel` | Ends the delivery; see below. 409 `TRIP_ALREADY_FINISHED`, or `TRIP_NOT_CANCELLABLE` while Borzo or Pidge holds it (cancel with them or cancel the order). |

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

## Gateway (P5)

Both APIs are published on the mobile gateway (`api.craves.in`) by `scripts/apim/configure-rider-fleet-apim.sh`: `craves-rider-v1` (`api/v1/rider`) and `craves-admin-fleet-v1` (`api/v1/admin/fleet`), with status and rollback scripts and four manual pipelines. Policies, rate limits and how a person deploys or rolls back: `infra/apim/rider-fleet/README.md`.

## Dispatch chain (P3)

`dispatch_policy` mode governs it; with no published policy in force, or mode `off`, nothing below happens for a new order and Borzo and Pidge run exactly as before.

1. The delivery command (`DeliveryCommandWorker`) asks `DeliveryProviderRouter.fleetStage` first. `FleetDispatcher` (the `FleetStage` bean) plans: the chef from the checkout's finance quote (`payment_schema.finance_issued_snapshot`; unknown chef: no fleet), test mode, the drop's road distance, eligible riders (ACTIVE, open shift, no active trip or open offer, a real fix received in the last 45 s, inside the policy radius), pay per rider and the cost guard (locked pay + overhead ≤ the next courier's live quote + premium; no quote: riders may go). `shadow` logs `FLEET_SHADOW` and stops there.
2. `live`: one transaction creates the trip (`SEARCHING`, order code `#` + the first 8 characters of the sub-order id), the fleet stage (`trip_stage` seq 1, deadline = fleet stage seconds) and offers to the 3 nearest at once (one ACTIVE offer per rider; pay, rate card version and both distances locked). Each offer is pushed with TTL = seconds left. The command waits (provider wait) and looks again at least every 10 s; Borzo's 120-second window has not started.
3. The fleet stage closes on an accept (in the accept's own transaction: delivery job `craves_fleet`, `COURIER_ASSIGNED` with the rider card, command completed) or, at its deadline or once no offer is open, by a conditional update on the same stage row; then the next stage opens (`BORZO` for 120 s when the timed policy is ready, else `PIDGE` for the Pidge stage seconds) and routing books as before. A late accept finds the stage closed: 410.
4. The dispatch tick (`FleetDispatchJobs`, every 5 s on the fleet pool) expires offers, moves `BORZO` to `PIDGE` at its deadline and closes a stage when its courier is assigned. A Pidge stage past its deadline, a courier who cancelled, or an uncertain create (never retried) goes to `OPS_QUEUE` with an ops alert `FLEET_DISPATCH_QUEUE`.
5. Watchdog: an accepted rider with no location received for 90 s before pickup loses the trip (`CANCELLED`, pickup-leg pay held for ops), ops gets `FLEET_RIDER_LOST`, the next stage opens and the tick books Borzo or Pidge through the router and hands the delivery job over with `handoffFromProviderId: craves_fleet`. CANCELLED is never published for it. order-service accepts that hand-over only from a rider before pickup (its projection `craves_fleet` with the trip id, status `COURIER_ASSIGNED`, `COURIER_TO_PICKUP` or `AT_PICKUP`) to Borzo or Pidge, clears the rider card the chef sees, and the customer's delivery code goes with it (shown only for `craves_fleet`). A later Borzo to Pidge hand-over counts only couriers of that Borzo delivery, not the rider before it. Deploy order-service with this change before any policy goes `live`.

6. Cancellation: integration-service hears that the customer or the chef cancelled only as the refund order-service then requests (`payment_schema.refund` for the sub-order). From then on an accept is refused with 409 `ORDER_CANCELLED` ("This order was cancelled. Watch for the next one."), and the next tick ends the trip through `FleetTripService.cancel`, the adapter's cancel path: open offers withdrawn, every open stage closed (so no courier is booked or queued by the tick), and a rider already on the trip paid for the state reached, not held. The delivery command of an order cancelled before any rider took it books nobody and fails until its retries run out. A Borzo or Pidge courier already booked is not cancelled: no order has that path yet.

`craves_fleet` (`CravesFleetAdapter`) is inactive in the catalog: routing never quotes or creates it. `track()` maps the trip to the pipeline (below); `cancel()` ends a trip as in step 6, with the pay rule for its state.

### Ops reassign and cancel (P5)

Both go through the dispatch chain, in one transaction, audited and idempotent, so an order never has two couriers recorded:

- The stage that is open closes first, by the same conditional update an accept or the dispatch tick uses, and its offers are withdrawn; a late accept then gets 410.
- **To a rider** (`riderId`): only an order no rider holds yet: still searching, or in the Borzo, Pidge or ops-queue stage with no courier booked. Outside the fleet stage the delivery command is taken over first, and only if it is not booking right now (else 409, try again in a minute). The rider must be ACTIVE, on shift, free (no trip, no open offer), sending real fixes (45 s) and allowed by test mode. Pay is locked from the trip's rate card, the drop distance and the rider's straight line × detour, as an accepted offer; then the usual `COURIER_ASSIGNED`. Call the rider first: nothing rings on the phone; the trip appears on their next location call.
- **To Borzo or Pidge** (`provider`): a rider's trip before pickup ends for that rider with pay for the trip so far (pickup leg, plus the cancellation fee and waiting at the kitchen; not held) and the stage opens; the dispatch tick books it as for a lost rider. An order still searching gets that stage; the delivery command books it (Borzo gets a fresh 120-second window; Pidge means Borzo's window is over). With the Borzo-then-Pidge routing off, routing picks the courier.
- Refused: a rider's trip to another rider (a trip row is one rider's pay record: hand it to Borzo or Pidge), anything after pickup (cancel instead), and any order Borzo or Pidge already holds.
- **Cancel**: a rider's trip ends with the trip-state pay rule (not held) and `CANCELLED` reaches the order. An order still searching stops: the stage closes, offers are withdrawn and the delivery command is marked `DEAD_LETTER` so nobody is booked. A released rider's order being rebooked is cancelled under the delivery job's lock; a courier booked at that moment is not recorded and ops gets `FLEET_COURIER_UNRECORDED` to cancel it.
- The reason goes to the audit trail. A released rider sees a fixed line ("Craves ops gave this order to another courier. You're paid for the trip so far."), never the ops reason.

`FleetStatusBridge` publishes a trip's statuses while its latest stage is the fleet's, so an order ops gives back to a rider reaches the customer again.

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

## Money (P4)

### Earnings ledger

`FleetEarnings` (fleet flag) turns pay into money:

1. A trip that ends with pay publishes `FleetTripPayFinalized` (P3). After the trip's transaction commits, the listener hands the credit to the fleet pool, which credits it in its own transaction: a failed credit never undoes a delivery, and the rider's request never waits for a second database connection. The money job (every `CRAVES_FLEET_MONEY_INTERVAL_MS`, fleet pool) credits any finished trip still without `trip.pay_credited_at`, and every slot settlement without `credited_at`.
2. Each pay line becomes a `rider_earning` row with key `fleet-trip-pay/{tripId}/{component}/{revision}` (revision 1) and one balanced journal in the immutable ledger with the same `business_event_key`: debit `DELIVERY_EXPENSE`, credit the pooled `RIDER_PAYABLE`, lines tagged `delivery_attempt_id` = trip and `provider_id` = `craves_fleet`. The unique key (in both tables) makes a second credit impossible, and every trip's journal lines net to zero. A slot top-up is its own component, `slot-top-up`.
3. A row is pending until `withdrawable_at`, 24 h after the delivery. It counts towards the balance only once past that, with no active hold on its trip and no open support issue raised on the trip before then (an issue blocks that trip's pay until it is FIXED or 7 days pass).
4. A held trip (photo delivery, failed delivery, rider lost before pickup) gets a hold at credit: its own reason, released at 00:00 IST 7 days after the trip at the latest. Ops can place one hold per trip (`POST /holds`) and release it early. The money job releases holds on their date. Holds touch that trip only.
5. Adjustments are later revisions of a component (2 and up) with the reason the rider sees: `FleetEarnings.adjustTrip`, service code only because `admin-fleet-v1` has no adjustment endpoint. A negative one is debt (journal: debit `RIDER_PAYABLE`, credit `DELIVERY_EXPENSE`), recovered only from future pay (payouts, below).
6. TDS (off by default): when on, each credit withholds `rate × the rider's gross this financial year (from 1 April IST) − TDS already withheld this year`, nothing while the year's gross is at or under the threshold, at most the credit itself. It is its own row (`component` `tds`, `net` = −withheld) and journal: debit `RIDER_PAYABLE`, credit `RIDER_TDS_PAYABLE`. A negative adjustment lowers the year's gross, so later credits withhold less; nothing is refunded.

Postings for one ₹67 trip on the draft rate card (drop 4.2 km, pickup 1.8 km):

| Key | Debit | Credit | ₹ |
|---|---|---|---|
| `fleet-trip-pay/{trip}/base/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 40.00 |
| `fleet-trip-pay/{trip}/drop-km/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 19.80 |
| `fleet-trip-pay/{trip}/pickup-km/1` | `DELIVERY_EXPENSE` | `RIDER_PAYABLE` | 7.20 |
| `fleet-trip-pay/{trip}/tds/1` (TDS on, threshold crossed, 1%) | `RIDER_PAYABLE` | `RIDER_TDS_PAYABLE` | 0.67 |

A photo delivery posts the same journals; only the hold differs (the pay stays out of the balance until released).

### Payouts

`FleetPayouts` (fleet flag). Nothing moves money by itself; a person uploads every file to the bank.

- **Balance.** available = released pay (net of TDS) − payouts that did not fail (requested withdrawals included) − debt recovered. Withdrawable = available − this week's recovery (outstanding debt, at most `CRAVES_FLEET_RECOVERY_WEEKLY_CAP_PAISE`), never below zero. A failed payout's money is back in the balance by itself.
- **Weekly payout.** A WEEKLY file on a Monday pays every rider with a verified, unpaused account their whole withdrawable balance, by IMPS, no minimum. Making it records this week's recovery (`rider_recovery`, once a week) from what is there. Riders with nothing, a negative balance or no account are left out. Debt is never debited from a bank.
- **Daily withdrawal.** One a day per rider (IST), free, up to the withdrawable balance. It is a payout (`DAILY_WITHDRAWAL`, date = tomorrow) at once, so the balance drops at once; the DAILY_WITHDRAWAL file for a date takes every request for that date or before not yet in a file, to the rider's current account.
- **Never twice.** A payout belongs to one file. A sent payout stays PENDING (processing) until ops marks its UTR or a final failure; nothing re-sends it, and its money is not in the balance meanwhile.
- **Failure.** Marked FAILED with the bank's reason: the money stays in the balance, and the account is paused (`features` false, `PAYOUTS_PAUSED`, left out of files) until ops sets a new account in person. A withdrawal the rider asked for before that waits, still out of the balance, and goes in the first daily file after the new account is set.
- **Ledger.** Only a UTR posts: `fleet-payout/{payoutId}/paid`, debit `RIDER_PAYABLE`, credit `BANK`, evidence `utr/{UTR}`. So `RIDER_PAYABLE` = all rider pay − paid payouts, and `BANK` credits from rider payouts = paid payout amounts.

Posting for one weekly payout of ₹84 (two ₹67 trips, less a ₹50 withdrawal paid separately):

| Key | Debit | Credit | ₹ |
|---|---|---|---|
| `fleet-payout/{payoutId}/paid` | `RIDER_PAYABLE` | `BANK` | 84.00 |

### Payout runbook for ops (RIDER-PLAYBOOK 5.8, R11 6.4)

Weekly: on Monday, approved by 13:00, sent by 15:00 IST. Daily withdrawals: every morning, paid by 13:00.

1. **Create the file.** A payments admin (the maker) makes it in the console from the database: Payouts → WEEKLY with Monday's date, or DAILY_WITHDRAWAL with today's date. Never type amounts or build a file in a spreadsheet.
2. **Download** the bank file (audited). Check the total and the count against the console.
3. **Second approver.** Another payments admin (the checker) reviews: file total against the console; count against riders with a balance; any payout above twice the rider's usual week; any payout account changed in the last 7 days; any payout that already has a UTR. Then approves. The maker cannot approve (403 `SAME_APPROVER`).
4. **Bank upload.** Upload the approved file once to the bank's IMPS bulk upload (use the bank's own two-user approval if it has one), then **mark sent**. Never upload a file twice, and never re-send a payout the bank still shows as processing (it can take up to T+3 working days).
5. **Mark UTRs.** For each payout the bank confirms, enter its UTR within 2 hours; the rider sees it. For a final failure (account closed, invalid), mark it failed with the bank's reason: the money stays in the rider's balance and their payouts pause; set a new account with the rider in person, and the next file includes them.
6. **Reconcile** daily: for every UTR on the bank statement, the payout with that UTR has the same amount; the file total equals the PAID payouts of the file plus those still pending; `RIDER_PAYABLE` debits for `RIDER_PAYOUT_PAID` equal the PAID payouts; no file stays SENT with pending payouts past T+3 working days without a call to the bank.

### Support and SOS

- A rider reports a problem on any trip, payout or nothing (`MISSING_PAY`, `WRONG_DISTANCE`, `PAYOUT_NOT_RECEIVED`, `WRONG_DEDUCTION`, `APP_PROBLEM`, `OTHER`). Support acknowledges within 24 hours and fixes within 72 (`acknowledge_by`, `fix_by`). `admin-fleet-v1` has no endpoint to acknowledge or fix an issue yet; until it does, set `state` by SQL (`ACKNOWLEDGED` with `acknowledged_at`, `FIXED` with `fixed_at`), and an open issue stops holding the trip's pay after 7 days anyway.
- SOS: `FleetSupportService.sos` stores the press (`sos_event`) first, then calls notification-service's ops alert (`POST /internal/v1/ops-alerts`, kind `SOS`): title "SOS from rider <name>", the rider's name and full phone, `https://maps.google.com/?q=<lat>,<lng>` and the fix time, and the trip's order code. notification-service emails `CRAVES_OPS_ALERT_EMAILS` (set it to the ops lead). `alerted_at` is set when it accepted the alert. If notification-service is not configured or fails, the alert is a `CRAVES_ALERT alert=SOS` log line with the same data, including the phone.

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
