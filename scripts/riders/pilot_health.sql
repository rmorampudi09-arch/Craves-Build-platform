-- Craves Rider pilot health (docs/riders/PILOT-HEALTH.md). Read-only: every query only reads fleet_schema.
-- Run it on a read-only connection to the integration database, the whole file or one query at a time:
--   psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1 -f scripts/riders/pilot_health.sql
-- Each query starts with a "-- name:" line. FleetPilotHealthDatabaseTest runs every one on test data, so a query that
-- stops matching the schema fails the build. Windows are the last 7 days; times are seconds unless named otherwise.

-- name: offer_to_ring
-- From the server creating an offer to the phone ringing (its first arrival, by either channel), by channel and phone
-- model, then by channel, then all offers ("all"). Targets: p95 <= 5 s and p99 <= 12 s over 100+ offers. Offers that
-- never rang count in "offers" but not in the times.
SELECT CASE WHEN GROUPING(o.rang_channel) = 1 THEN 'all' ELSE COALESCE(o.rang_channel, 'never rang') END AS channel,
       CASE WHEN GROUPING(d.model) = 1 THEN 'all' ELSE COALESCE(d.model, 'unknown') END AS model,
       count(*) AS offers,
       count(o.rang_at) AS rang,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p50_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p95_s,
       round(percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p99_s
FROM fleet_schema.trip_offer o
LEFT JOIN fleet_schema.rider_device d ON d.rider_id = o.rider_id AND d.state = 'BOUND'
WHERE o.offered_at > now() - INTERVAL '7 days'
GROUP BY ROLLUP (o.rang_channel, d.model)
ORDER BY GROUPING(o.rang_channel) DESC, GROUPING(d.model) DESC, channel, model;

-- name: offer_to_ring_by_day
-- The same, all offers, per day (IST): the stop rule is p95 over 8 s for a day (PILOT-HEALTH.md). The oldest day is partial.
SELECT (o.offered_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
       count(*) AS offers,
       count(o.rang_at) AS rang,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p50_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p95_s,
       round(percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM o.rang_at - o.offered_at)::float8)::numeric, 1) AS p99_s
FROM fleet_schema.trip_offer o
WHERE o.offered_at > now() - INTERVAL '7 days'
GROUP BY 1
ORDER BY day_ist DESC;

-- name: first_channel
-- Which channel reached the phone first: fcm (the push) or locations (the next /locations call, up to ~11 s later).
-- Mostly locations means pushes arrive late or not at all: read push_results.
SELECT COALESCE(o.rang_channel, 'never rang') AS first_channel,
       count(*) AS offers,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM fleet_schema.trip_offer o
WHERE o.offered_at > now() - INTERVAL '7 days'
GROUP BY 1
ORDER BY offers DESC, first_channel;

-- name: push_results
-- What notification-service said to each offer's push: SENT, NO_TOKEN (the phone has no FCM token), ERROR, or its code
-- (TOKEN_UNREGISTERED, FCM_*, ...). "not pushed" is an offer made before pushes were recorded (V162).
SELECT COALESCE(o.push_result, 'not pushed') AS push_result,
       count(*) AS offers,
       count(o.rang_at) AS rang,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM fleet_schema.trip_offer o
WHERE o.offered_at > now() - INTERVAL '7 days'
GROUP BY 1
ORDER BY offers DESC, push_result;

-- name: shift_survival
-- Each shift: how long it ran, the longest gap between two /locations calls, how many gaps were over 60 s, the silence
-- right now (open shifts only) and why the app's process last ended. Target: no gap over 60 s on a 4-hour screen-off shift.
-- The gap after the last call (to the shift's end, or to now) counts too: a phone that died never calls again to report it.
SELECT s.id AS shift_id,
       s.rider_id,
       COALESCE(d.model, 'unknown') AS model,
       s.started_at,
       s.ended_at IS NULL AS open,
       round((extract(epoch FROM COALESCE(s.ended_at, now()) - s.started_at) / 3600)::numeric, 2) AS hours,
       GREATEST(s.max_silence_seconds, g.last_gap_s) AS longest_silence_s,
       s.silences_over_60s + CASE WHEN g.last_gap_s > 60 THEN 1 ELSE 0 END AS silences_over_60s,
       CASE WHEN s.ended_at IS NULL THEN g.last_gap_s END AS silent_now_s,
       s.health ->> 'lastExitReason' AS last_exit_reason
FROM fleet_schema.rider_shift s
CROSS JOIN LATERAL (SELECT extract(epoch FROM COALESCE(s.ended_at, now()) - COALESCE(s.last_seen_at, s.started_at))::integer
                    AS last_gap_s) g
LEFT JOIN fleet_schema.rider_device d ON d.id = s.device_id
WHERE s.started_at > now() - INTERVAL '7 days'
ORDER BY s.started_at DESC;

-- name: sync_delay
-- How long a trip step took from the rider's tap to the server (the step's ageMs, app 1.1.0), by step. Large numbers are
-- steps tapped offline; "with_tap" counts the steps that carried an age (older apps send none). A negative age (a phone's
-- clock set back between tap and send) counts as 0.
SELECT e.kind AS step,
       count(*) AS steps,
       count(a.age_s) AS with_tap,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY a.age_s)::numeric, 1) AS p50_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.age_s)::numeric, 1) AS p95_s,
       round(max(a.age_s)::numeric, 1) AS max_s
FROM fleet_schema.trip_event e
CROSS JOIN LATERAL (SELECT CASE WHEN e.detail ->> 'ageMs' IS NOT NULL THEN GREATEST((e.detail ->> 'ageMs')::float8, 0) / 1000 END
                    AS age_s) a
WHERE e.created_at > now() - INTERVAL '7 days' AND e.actor_type = 'RIDER'
  AND e.kind IN ('ARRIVED_PICKUP', 'FOOD_NOT_READY', 'PICKED_UP', 'ARRIVED_DROP', 'DELIVERED', 'FAILED')
GROUP BY e.kind
ORDER BY CASE e.kind WHEN 'ARRIVED_PICKUP' THEN 1 WHEN 'FOOD_NOT_READY' THEN 2 WHEN 'PICKED_UP' THEN 3 WHEN 'ARRIVED_DROP' THEN 4
                     WHEN 'DELIVERED' THEN 5 ELSE 6 END;

-- name: battery_per_hour
-- Battery used per unplugged hour on shift (health drainPct * 60 / unpluggedMin, counted since the service started), by
-- phone model, over shifts with at least 30 unplugged minutes. Compare models; a phone far above the others is worth a look.
SELECT COALESCE(d.model, 'unknown') AS model,
       count(*) AS shifts,
       round(avg((s.health ->> 'drainPct')::float8 * 60 / (s.health ->> 'unpluggedMin')::float8)::numeric, 1) AS pct_per_hour,
       round(max((s.health ->> 'drainPct')::float8 * 60 / (s.health ->> 'unpluggedMin')::float8)::numeric, 1) AS worst_pct_per_hour
FROM fleet_schema.rider_shift s
LEFT JOIN fleet_schema.rider_device d ON d.id = s.device_id
WHERE s.started_at > now() - INTERVAL '7 days' AND (s.health ->> 'unpluggedMin')::float8 >= 30
GROUP BY 1
ORDER BY pct_per_hour DESC, model;

-- name: fleet_stage_outcomes
-- How the Craves riders' stage of each order's dispatch chain ended, per day (IST): ACCEPTED by a rider, or why it
-- passed the order on. "open" is a stage still running.
SELECT (st.opened_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
       COALESCE(st.outcome, 'open') AS outcome,
       count(*) AS orders
FROM fleet_schema.trip_stage st
WHERE st.provider = 'CRAVES_FLEET' AND st.opened_at > now() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY day_ist DESC, orders DESC, outcome;
