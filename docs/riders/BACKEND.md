# Rider backend (integration-service, package `in.craves.integration.fleet`)

The rider fleet runs inside integration-service with its own schema, `fleet_schema`, in the integration database. Plan: project doc `rider-app/PLAN.md`. Contracts: `contracts/openapi/rider-v1.yaml` (rider app) and `contracts/openapi/admin-fleet-v1.yaml` (ops console).

## Flags

Environment flags only switch code paths on. All are off by default.

| Variable | What it switches on |
|---|---|
| `CRAVES_FLEET_ENABLED` | Every fleet bean: admin API, policy readers, test mode, storage, the RIDER role client, the fleet scheduler pool and the daily export job. Off means no fleet bean or job exists (`FleetConfigurationTest`). |
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

Operational values live in versioned tables, not variables: `dispatch_policy` (seeded `2026-10-v1`, mode `off`, offers 40 s, fleet stage 60 s, radius 5 km as a placeholder) and `rate_card` (seeded draft `2026-10-v1`).

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
| `GET /home` | `online` and `shiftStartedAt` (an open shift whose credential still works), `activeTripId` (trip in progress), the running or next slot with its guaranteed hourly pay and rest point, `zoneName` and `slotEndsAt` while a slot runs, and the ops banner until its `until`. Earnings fields are zero until P4. |
| `POST /documents` | Multipart `type` (DL, RC, INSURANCE, PUC, PAN, BANK) and `photo` (JPG, PNG or PDF, 10 MB); stored PENDING. PENDING riders too. |
| `GET /terms` | The rate card in force (else the next published one, else the draft, with `draft: true`), in the rider's language. |
| `POST /terms/accept` | Accepts the current version; any other is 409 `TERMS_CHANGED`. |
| `POST /shift/start` | Goes online: multipart `selfie` (JPEG, 5 MB) and header `X-Craves-Installation-Id`. Returns `{shiftCredential, expiresAt}` once. Refusals below. |
| `POST /shift/end` | Goes offline: closes the open shift and revokes its credential. 204 even when nothing is open. |
| `POST /devices` | `{installationId, fcmToken, appVersion, model}`, with a RIDER JWT or the shift credential. 204 for the bound phone; 409 `DEVICE_NOT_BOUND` for another. See "Phones". |
| `POST /locations` | Location ingest flag. Header `X-Craves-Shift-Credential` (the native service) or a RIDER JWT. Up to 5 fixes; answers offers, the trip and a stop signal. See "Location ingest". |

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
- **Fixes.** Fixes with impossible values, from before the shift started or more than 5 minutes ahead of the database clock are dropped. Only fixes newer than the stored latest fix of this shift are used, so a resent batch writes nothing twice.
- **Writes.** `rider_position_latest`: the newest fix wins (one row per rider, with its `mock` flag, `shift_id` and `trip_id` = the trip in progress, else null). `trip_track`: every new fix, with its `mock` flag, only while the rider has a trip in progress (ASSIGNED to AT_DROP). `rider_shift.in_zone_seconds`: see the zone model.
- **Answer.** `{offers, activeTrip?, stop?, stopReason?}`. `offers`: the rider's ACTIVE `trip_offer` rows not yet expired, as rider-v1 Offers; `expiresInSec` is computed by the database clock, `kitchenArea` and `customerLocality` come from the trip, `payLines` from `trip_offer.pay_lines`, which must hold `[{label, amountPaise}]`, and `estMinutes` = 12 + (pickup m + drop m) / 300, rounded (the app mock's estimate; dispatch should use the same). `activeTrip`: the trip in progress as `{tripId, step, version}` (ASSIGNED is TO_KITCHEN, AT_PICKUP is AT_KITCHEN); when it has ended, or ops gave it to another rider, it is reported once more with its final step (CANCELLED for a reassignment) so the app leaves trip mode.
- **Stop.** `{offers: [], stop: true, stopReason}` and the shift is closed, nothing else written, when: the rider is not ACTIVE; the shift was ended (`/shift/end`); its credential was revoked (ops approved another phone); or its 12 hours are up.

**Zone model.** P1 has no zone geometry: `rider_slot` holds a zone name and a time window, `dispatch_policy` only a radius. So the gap between two consecutive non-mock fixes of the shift counts toward `in_zone_seconds` while one of the rider's slots is running, at most 60 seconds per gap (a phone that sleeps longer gets 60). The position is not checked against the zone. Upgrade: add zone geometry (centre and radius) when ops draws the pilot area and test each fix against it. When slots gain a status (P3), only BOOKED slots should count.

**Statement budget.** One call runs at most 5 statements, inside one transaction:

1. read the shift, rider, latest position, trip in progress, previous trip and running slot, locking the shift row (`FOR UPDATE OF s`, so two calls for one shift run one after the other);
2. upsert `rider_position_latest`;
3. one multi-row `trip_track` insert, only on a trip;
4. add to `in_zone_seconds`, only when there is time to add;
5. read the offers.

A stop runs statement 1 and one shift update. `FleetLocationApiDatabaseTest.twoHundredCallsStayWithinFiveStatementsEach` counts every statement over 200 calls on a trip, in a slot, with an offer open (5 fixes each). The PLAN's load target, 20 calls a second for 10 minutes, is 12,000 calls: at most 5 × 12,000 = 60,000 statements (100 a second), plus each call's BEGIN and COMMIT, on one pooled connection per call for a few milliseconds.

EXPLAIN (Postgres 16, 2,000 riders, 62,000 shifts, 200,500 trips and offers, 42,000 slots) shows an index for every table: `rider_shift_credential_hash_key` (the credential, cast to `CHAR(64)` so the unique index applies), `rider_identity_id_key` and `rider_shift_one_open` (JWT), `rider_position_latest_pkey`, `rider_pkey`, `trip_one_active_per_rider`, `trip_pkey`, `rider_slot_rider`, `trip_offer_one_active_per_rider` and `rider_shift_pkey` for the updates; the upsert resolves on `rider_position_latest_pkey`, and the track insert goes straight to the day's partition.

## Daily export

`RiderJoinsExitsExport` writes yesterday's CSV to `riders/exports/rider-joins-exits-YYYY-MM-DD.csv` at 00:20 IST on the fleet pool, only while `CRAVES_FLEET_ENABLED`. JOINED is a move to ACTIVE from PENDING (or a rejoin from DEACTIVATED); EXITED is a deactivation.

## Test mode for one rider and one kitchen

1. Keep `CRAVES_FLEET_TEST_MODE=true` (the default) and set `CRAVES_FLEET_ENABLED=true` and `CRAVES_FLEET_RIDER_API_ENABLED=true`.
2. Ops creates the rider in the console (`POST /riders`); the rider signs in to the app once so `/me` links them; ops activates them with `RESTORE`.
3. Allow-list both, by SQL on the integration database:

```sql
INSERT INTO fleet_schema.test_mode_rider (rider_id, note) VALUES ('<rider id>', 'pilot test rider');
INSERT INTO fleet_schema.test_mode_kitchen (chef_id, note) VALUES ('<chef identity id>', 'pilot test kitchen');
```

Dispatch (P3) asks `FleetTestMode.riderAllowed` and `kitchenAllowed` before it offers a trip, so nobody else is touched. Leave `dispatch_policy` in mode `off`; only people change it, through a published version.
