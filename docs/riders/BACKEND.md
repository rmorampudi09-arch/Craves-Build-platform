# Rider backend (integration-service, package `in.craves.integration.fleet`)

The rider fleet runs inside integration-service with its own schema, `fleet_schema`, in the integration database. Plan: project doc `rider-app/PLAN.md`. Contracts: `contracts/openapi/rider-v1.yaml` (rider app) and `contracts/openapi/admin-fleet-v1.yaml` (ops console).

## Flags

Environment flags only switch code paths on. All are off by default.

| Variable | What it switches on |
|---|---|
| `CRAVES_FLEET_ENABLED` | Every fleet bean: admin API, policy readers, test mode, storage, the RIDER role client, the fleet scheduler pool and the daily export job. Off means no fleet bean or job exists (`FleetConfigurationTest`). |
| `CRAVES_FLEET_RIDER_API_ENABLED` | The rider API under `/api/v1/rider` (needs `CRAVES_FLEET_ENABLED` too). |
| `CRAVES_FLEET_LOCATION_INGEST_ENABLED` | Reserved for location ingest (P2). |
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

V152 creates a default partition and one partition per IST day for the 8 days from the day it runs. Create each new day before it starts (a daily job comes with location ingest in P2):

```sql
CREATE TABLE IF NOT EXISTS fleet_schema.trip_track_20261028 PARTITION OF fleet_schema.trip_track
  FOR VALUES FROM ('2026-10-28 00:00+05:30') TO ('2026-10-29 00:00+05:30');
```

If fixes for that day already landed in `trip_track_default`, the statement fails: move those rows out of the default partition first, then create the day.

## Endpoints

Rider API (`/api/v1/rider`, rider API flag): every route needs the RIDER role except `GET /me`.

| Route | Does |
|---|---|
| `GET /me` | Any signed-in user. Links the rider whose phone matches the JWT `phone_number` on the first call; otherwise `NOT_RIDER`. Status, reason, notice, terms versions, min app version, support contacts. |
| `GET /profile` | Latest document per type, vehicle, masked payout account, insurance. PENDING riders too. |
| `GET /home` | Next slot, its guaranteed hourly pay, rest point and banner. Shift and earnings fields are zero until P2 and P4. |
| `POST /documents` | Multipart `type` (DL, RC, INSURANCE, PUC, PAN, BANK) and `photo` (JPG, PNG or PDF, 10 MB); stored PENDING. |
| `GET /terms` | The rate card in force (else the next published one, else the draft, with `draft: true`), in the rider's language. |
| `POST /terms/accept` | Accepts the current version; any other is 409 `TERMS_CHANGED`. |

Admin fleet API (`/api/v1/admin/fleet`, fleet flag), scoped admin roles per `admin-fleet-v1.yaml`; the legacy ADMIN role gets nothing. Mutations need an `Idempotency-Key` (a replay returns the first result; the same key with another body is 409 `IDEMPOTENCY_KEY_REUSED`), and every action is audited.

| Route | Does |
|---|---|
| `GET /riders`, `POST /riders`, `GET /riders/{id}` | List (newest first, search by name or last phone digits), create a PENDING rider, detail. |
| `GET /riders/{id}/documents/{documentId}/content` | The file, audited as a read. |
| `POST .../documents/{documentId}/approve`, `/reject` | Review by hand; a rejection carries the reason the rider sees. |
| `POST /riders/{id}/devices/{deviceId}/approve` | Binds the new phone, replaces the old one and revokes its shift credential. |
| `PUT /riders/{id}/payout-account` | Set in person. Holder name must match the KYC name (422 `HOLDER_NAME_MISMATCH`); the account must not belong to another rider (409 `PAYOUT_ACCOUNT_NOT_UNIQUE`). |
| `POST /riders/{id}/status-events` | The two tracks below. |
| `GET /selfie-reviews`, `GET /shifts/{id}/selfie`, `POST /shifts/{id}/selfie/approve`, `/reject` | Go-online selfie review; a rejection never ends a shift or blocks anyone. |
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
