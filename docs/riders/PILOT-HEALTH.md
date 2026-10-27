# Craves Rider: pilot health

How to tell, from the database, whether the rider pilot is healthy: offers ring fast, phones stay online, steps sync, and the fleet stage takes orders. The queries are in `scripts/riders/pilot_health.sql`, one per row of the table below. `FleetPilotHealthDatabaseTest` runs each of them on test data in CI, so they keep matching the schema.

## Running the queries

Use a **read-only** login to the integration database, never a write login on production. Asking Postgres for read-only transactions as well means a mistake can't change anything:

```bash
export FLEET_READONLY_URL='postgresql://<read-only user>@<host>:5432/<integration db>?sslmode=require&options=-c%20default_transaction_read_only%3Don'
psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1 -f scripts/riders/pilot_health.sql            # every query
awk '/^-- name: offer_to_ring$/{f=1; next} /^-- name: /{f=0} f' scripts/riders/pilot_health.sql \
  | psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1                                          # one query
```

Every query looks at the last 7 days. During the first week of live dispatch, run the whole file once a day and keep the output with the day's notes. The data comes from app 1.1.0 (`RELEASE.md`): offer receipts, phone health and tap ages are empty for older apps.

## The queries

| Query | What it shows | Target or what to look for |
|---|---|---|
| `offer_to_ring` | Seconds from the server creating an offer to the phone ringing (`rang_at − offered_at`, the first arrival by either channel). p50, p95 and p99 for all offers, by channel, and by channel and phone model. `offers` also counts offers that never rang; `rang` only those that did. | **p95 ≤ 5 s and p99 ≤ 12 s over 100+ offers.** A model far behind the others points at that phone's battery settings (`PHONE-TESTS.md`). |
| `first_channel` | Which channel reached the phone first: `fcm` (the push) or `locations` (the next `/locations` call, up to about 11 s later), and offers that never rang. | Mostly `fcm`. A large `locations` share means pushes arrive late or not at all: read `push_results`. |
| `push_results` | What notification-service answered for each offer's push: `SENT`, `NO_TOKEN` (the phone has no FCM token), `ERROR`, or its code (`TOKEN_UNREGISTERED`, `FCM_*`, ...). | Mostly `SENT`. `NO_TOKEN` or `TOKEN_UNREGISTERED` for a rider: have them open the app, so it registers its token again. |
| `shift_survival` | Each shift: hours, the longest gap between two `/locations` calls (`longest_silence_s`), gaps over 60 s, the silence right now for open shifts, and why the app's process last ended (`last_exit_reason`, from Android). | **No gap over 60 s** on a 4-hour screen-off shift. `silent_now_s` over 180 on an open shift: the phone stopped (the server sends it "You're offline"). |
| `sync_delay` | Seconds from the rider's tap to the server, by trip step (the step's `ageMs`). `with_tap` counts steps that carried an age. | A few seconds online. Long tails are steps tapped without signal: they still count from the tap. |
| `battery_per_hour` | Battery used per unplugged hour on shift, by phone model, over shifts with at least 30 unplugged minutes. | No target yet: record it per model, and look at a phone far above the others. |
| `fleet_stage_outcomes` | How the Craves riders' stage of the dispatch chain ended, per day (IST): `ACCEPTED`, or the reason it passed the order on. | The `ACCEPTED` share should grow as riders are added. |

## Stop rules (live dispatch)

Press **Stop dispatch now** in the console (Rider pilot setup → Dispatch) if any of these happens, then tell the team:

1. **A trip step is lost:** a rider tapped a step that never reached the server. Riders and ops report it; `PHONE-TESTS.md` §3 tests for it.
2. **An order gets two couriers:** a rider and Borzo or Pidge both sent for one order. Ops sees it in the console and in support.
3. **Offer-to-ring p95 is over 8 s for a day:** `offer_to_ring`, the `all` row, over that day's offers.

## Where the numbers come from

- `trip_offer.rang_at` and `rang_channel`: the phone's offer receipt on its next `/locations` call (`BACKEND.md`, "Offer receipts").
- `trip_offer.pushed_at` and `push_result`: stored by `FleetDispatcher` after each push.
- `rider_shift.last_seen_at`, `max_silence_seconds` and `silences_over_60s`: every `/locations` call, with or without a fix.
- `rider_shift.health`: the phone's report about once a minute (battery, charging, power saver, whether an offer can ring, drain and unplugged minutes since the service started, queued steps, the last exit reason).
- `trip_event.detail.ageMs`: the tap's age on each step.
- `trip_stage`: the dispatch chain, one stage per courier tried.
