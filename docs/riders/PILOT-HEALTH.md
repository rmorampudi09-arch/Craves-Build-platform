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

The health queries look at the last 7 days, the trigger queries at the last 14. During the first week of live dispatch, run the whole file once a day and keep the output with the day's notes. The data comes from app 1.1.0 (`RELEASE.md`): offer receipts, phone health and tap ages are empty for older apps.

## The queries

| Query | What it shows | Target or what to look for |
|---|---|---|
| `offer_to_ring` | Seconds from the server creating an offer to the phone ringing (`rang_at − offered_at`, the first arrival by either channel). p50, p95 and p99 for all offers, by channel, and by channel and phone model. `offers` also counts offers that never rang; `rang` only those that did. | **p95 ≤ 5 s and p99 ≤ 12 s over 100+ offers.** A model far behind the others points at that phone's battery settings (`PHONE-TESTS.md`). |
| `offer_to_ring_by_day` | The same p50, p95 and p99 over all offers, per day (IST). | **p95 over 8 s for a day is a stop rule** (below). |
| `first_channel` | Which channel reached the phone first: `fcm` (the push) or `locations` (the next `/locations` call, up to about 11 s later), and offers that never rang. | Mostly `fcm`. A large `locations` share means pushes arrive late or not at all: read `push_results`. |
| `push_results` | What notification-service answered for each offer's push: `SENT`, `NO_TOKEN` (the phone has no FCM token), `ERROR`, or its code (`TOKEN_UNREGISTERED`, `FCM_*`, ...). | Mostly `SENT`. `NO_TOKEN` or `TOKEN_UNREGISTERED` for a rider: have them open the app, so it registers its token again. |
| `shift_survival` | Each shift: hours, the longest gap between two `/locations` calls (`longest_silence_s`), gaps over 60 s, the silence right now for open shifts, and why the app's process last ended (`last_exit_reason`, from Android). The gap after the last call, to the shift's end or to now, counts too: a phone that died never calls again to report it. | **No gap over 60 s** on a 4-hour screen-off shift. `silent_now_s` over 180 on an open shift: the phone stopped (the server sends it "You're offline"). |
| `sync_delay` | Seconds from the rider's tap to the server, by trip step (the step's `ageMs`; a negative one, from a phone clock set back, counts as 0). `with_tap` counts steps that carried an age. | A few seconds online. Long tails are steps tapped without signal: they still count from the tap. |
| `battery_per_hour` | Battery used per unplugged hour on shift, by phone model, over shifts with at least 30 unplugged minutes. | No target yet: record it per model, and look at a phone far above the others. |
| `fleet_stage_outcomes` | How the Craves riders' stage of the dispatch chain ended, per day (IST): `ACCEPTED`, or the reason it passed the order on. | The `ACCEPTED` share should grow as riders are added. |

## Triggers

Some work waits until pilot data shows it is needed (blueprint C1, C5 and C7; WORKPLAN P2-04, P2-11 and P3-06). These queries measure each trigger. Run them weekly from the second week of live dispatch, and start the work only when its trigger holds.

| Query | What it shows | Trigger and what it starts |
|---|---|---|
| `batching_candidates` | Orders, over every provider, with another order from the same kitchen ready within 10 minutes and a drop within 2 km, per day. | **15% or more for two weeks in one zone, while `rider_busy_share` is over 60%:** design two orders per trip (blueprint C7). |
| `rider_busy_share` | Riders' online hours, the hours spent from accepting a trip to its end, and the busy share, per day of the shift's start. | Read with `batching_candidates`. |
| `pickup_detour` | The ride to the kitchen through the trip's own fixes, against the straight line from its first fix: how many trips were more than 1.5 times longer, and the median ratio. | **Over 20% of trips:** switch on road-distance ranking in the dispatch policy (BACKEND.md); it is an automated-system change once dispatch is live, so 14 days' notice first. |
| `fcm_on_time` | Offers whose push rang within 5 s of the offer, by phone model, over offers whose push was sent. | **Under 92% over 200+ offers for a model:** set the server's idle polling to 5 s (P2-04). |
| `offer_outcomes` | How offers ended, per day: accepted, declined, expired unanswered, lost to another rider, withdrawn. | **Expired over 20%:** riders aren't hearing offers; make the offer sound repeat until it is opened (blueprint C5). |
| `track_size` | `trip_track` on disk, all partitions. | **Past about 5 GB:** thin tracks older than 7 days to one fix per 10 s per trip (P2-11). |

### Weekly: FCM delivery data

Google's own numbers for the rider app's pushes, a few days behind and only from phones that share usage data. Read them once a week with an account that can see the Firebase project:

```bash
curl -sS -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://fcmdata.googleapis.com/v1beta1/projects/<firebase project id>/androidApps/<rider app id>/deliveryData"
```

`<rider app id>` is the rider app's Firebase app ID (`1:…:android:…`, Project settings → Your apps). Each day has `data.deliveryPerformancePercents.deliveredNoDelay` (should stay high) and `data.messageInsightPercents.priorityLowered` (should stay about 0: FCM lowers a high-priority push to normal when the app doesn't show a notification for it, and lowered offers ring late). A rising `priorityLowered` is a bug to fix before it hurts offer-to-ring.

## Stop rules (live dispatch)

Press **Stop dispatch now** in the console (Rider pilot setup → Dispatch) if any of these happens, then tell the team:

1. **A trip step is lost:** a rider tapped a step that never reached the server. Riders and ops report it; `PHONE-TESTS.md` §3 tests for it.
2. **An order gets two couriers:** a rider and Borzo or Pidge both sent for one order. Ops sees it in the console and in support.
3. **Offer-to-ring p95 is over 8 s for a day:** `offer_to_ring_by_day`.

## Where the numbers come from

- `trip_offer.rang_at` and `rang_channel`: the phone's offer receipt on its next `/locations` call (`BACKEND.md`, "Offer receipts").
- `trip_offer.pushed_at` and `push_result`: stored by `FleetDispatcher` after each push.
- `rider_shift.last_seen_at`, `max_silence_seconds` and `silences_over_60s`: every `/locations` call, with or without a fix.
- `rider_shift.health`: the phone's report about once a minute (battery, charging, power saver, whether an offer can ring, drain and unplugged minutes since the service started, queued steps, the last exit reason).
- `trip_event.detail.ageMs`: the tap's age on each step.
- `trip_stage`: the dispatch chain, one stage per courier tried.
