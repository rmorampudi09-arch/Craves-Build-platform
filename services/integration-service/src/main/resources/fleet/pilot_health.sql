-- Craves Rider pilot health (docs/riders/PILOT-HEALTH.md). Read-only: every query only reads fleet_schema.
-- The ops console's Pilot health page runs these (FleetPilotHealth, GET /api/v1/admin/fleet/pilot-health). By hand, on
-- a read-only connection to the integration database, the whole file or one query at a time:
--   psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1 -f services/integration-service/src/main/resources/fleet/pilot_health.sql
-- Each query starts with a "-- name:" line, then its comment lines (the console shows them as its description).
-- FleetPilotHealthDatabaseTest runs every one on test data, so a query that stops matching the schema fails the build.
-- Health windows are the last 7 days, trigger windows 14; times are seconds unless named otherwise.

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

-- name: batching_candidates
-- This query and the ones after it measure the triggers for work that waits for pilot data (PILOT-HEALTH.md
-- "Triggers"). Distances are great-circle metres (haversine, earth radius 6371 km); fleet_schema has no PostGIS.
-- Two orders per trip (blueprint C7): orders, over every provider, with another order from the same kitchen ready
-- within 10 minutes and a drop within 2 km, per day (IST). Worth designing when this is 15% or more for two weeks in
-- one zone while rider_busy_share is over 60%. A trip's ready time is the chef's "ready" tap, else when it was created.
-- An order ops gave to another rider counts once, by its current trip.
SELECT (t.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
       count(*) AS orders,
       count(*) FILTER (WHERE p.paired) AS with_pair,
       round(100.0 * count(*) FILTER (WHERE p.paired) / count(*), 1) AS pair_pct
FROM fleet_schema.trip t
CROSS JOIN LATERAL (
    SELECT EXISTS (
        SELECT 1
        FROM fleet_schema.trip o
        WHERE o.chef_id = t.chef_id AND o.id <> t.id AND o.replaced_at IS NULL
          AND o.created_at BETWEEN t.created_at - INTERVAL '2 hours' AND t.created_at + INTERVAL '2 hours'
          AND abs(extract(epoch FROM COALESCE(o.chef_ready_at, o.created_at) - COALESCE(t.chef_ready_at, t.created_at))) <= 600
          AND 12742000 * asin(LEAST(1, sqrt(power(sin(radians(o.drop_lat - t.drop_lat) / 2), 2)
              + cos(radians(t.drop_lat)) * cos(radians(o.drop_lat)) * power(sin(radians(o.drop_lng - t.drop_lng) / 2), 2)))) <= 2000
    ) AS paired
) p
WHERE t.created_at > now() - INTERVAL '14 days' AND t.replaced_at IS NULL
GROUP BY 1
ORDER BY day_ist DESC;

-- name: rider_busy_share
-- How much of riders' online time went on trips, per day (IST) of the shift's start: from accepting a trip to its end,
-- within the shift. Read with batching_candidates (blueprint C7: over 60%).
SELECT (s.started_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
       count(DISTINCT s.rider_id) AS riders,
       round((sum(extract(epoch FROM COALESCE(s.ended_at, now()) - s.started_at)) / 3600)::numeric, 1) AS online_h,
       round((sum(b.busy_s) / 3600)::numeric, 1) AS busy_h,
       round((100 * sum(b.busy_s) / NULLIF(sum(extract(epoch FROM COALESCE(s.ended_at, now()) - s.started_at)), 0))::numeric, 1)
           AS busy_pct
FROM fleet_schema.rider_shift s
CROSS JOIN LATERAL (
    SELECT COALESCE(sum(extract(epoch FROM LEAST(COALESCE(t.finished_at, now()), COALESCE(s.ended_at, now()))
                                         - GREATEST(t.accepted_at, s.started_at))), 0) AS busy_s
    FROM fleet_schema.trip t
    WHERE t.rider_id = s.rider_id AND t.accepted_at IS NOT NULL
      AND t.accepted_at < COALESCE(s.ended_at, now()) AND COALESCE(t.finished_at, now()) > s.started_at
) b
WHERE s.started_at > now() - INTERVAL '14 days'
GROUP BY 1
ORDER BY day_ist DESC;

-- name: pickup_detour
-- Road-ETA ranking (blueprint C7): how much longer the ride to the kitchen really was than the straight line. The path
-- runs through the trip's own real fixes from accepting to arriving; the straight line from the first of them to the
-- kitchen. Trips with fewer than 3 fixes, or starting within 300 m, are left out. Worth switching on (dispatch policy,
-- BACKEND.md) when over 20% of trips are more than 1.5 times longer.
WITH steps AS (
    -- The first fix has no step (LEAST ignores a NULL, so it must not reach asin).
    SELECT t.id, t.kitchen_lat, t.kitchen_lng, f.recorded_at, f.lat, f.lng,
           CASE WHEN f.prev_lat IS NULL THEN 0 ELSE 12742000 * asin(LEAST(1, sqrt(power(sin(radians(f.lat - f.prev_lat) / 2), 2)
               + cos(radians(f.prev_lat)) * cos(radians(f.lat)) * power(sin(radians(f.lng - f.prev_lng) / 2), 2)))) END AS step_m
    FROM fleet_schema.trip t
    CROSS JOIN LATERAL (
        SELECT tt.recorded_at, tt.lat, tt.lng,
               lag(tt.lat) OVER (ORDER BY tt.recorded_at) AS prev_lat,
               lag(tt.lng) OVER (ORDER BY tt.recorded_at) AS prev_lng
        FROM fleet_schema.trip_track tt
        WHERE tt.trip_id = t.id AND NOT tt.mock AND tt.recorded_at BETWEEN t.accepted_at AND t.arrived_kitchen_at
    ) f
    WHERE t.arrived_kitchen_at > now() - INTERVAL '14 days' AND t.accepted_at IS NOT NULL
), legs AS (
    SELECT id, kitchen_lat, kitchen_lng, sum(step_m) AS path_m,
           (array_agg(lat ORDER BY recorded_at))[1] AS lat0, (array_agg(lng ORDER BY recorded_at))[1] AS lng0
    FROM steps
    GROUP BY id, kitchen_lat, kitchen_lng
    HAVING count(*) >= 3
), ratios AS (
    SELECT path_m / straight_m AS ratio
    FROM legs
    CROSS JOIN LATERAL (SELECT 12742000 * asin(LEAST(1, sqrt(power(sin(radians(kitchen_lat - lat0) / 2), 2)
        + cos(radians(lat0)) * cos(radians(kitchen_lat)) * power(sin(radians(kitchen_lng - lng0) / 2), 2)))) AS straight_m) d
    WHERE straight_m >= 300
)
SELECT count(*) AS trips,
       count(*) FILTER (WHERE ratio > 1.5) AS longer_than_1_5x,
       round(100.0 * count(*) FILTER (WHERE ratio > 1.5) / NULLIF(count(*), 0), 1) AS longer_pct,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio)::numeric, 2) AS median_ratio
FROM ratios;

-- name: fcm_on_time
-- Offers whose push rang the phone within 5 s of the offer, by phone model, over offers whose push was sent (blueprint
-- C1). Server-set idle polling (P2-04) is worth turning on when a model is under 92% over 200+ offers.
SELECT COALESCE(d.model, 'unknown') AS model,
       count(*) AS pushed,
       count(*) FILTER (WHERE o.rang_channel = 'fcm' AND o.rang_at <= o.offered_at + INTERVAL '5 seconds') AS on_time,
       round(100.0 * count(*) FILTER (WHERE o.rang_channel = 'fcm' AND o.rang_at <= o.offered_at + INTERVAL '5 seconds')
           / count(*), 1) AS on_time_pct
FROM fleet_schema.trip_offer o
LEFT JOIN fleet_schema.rider_device d ON d.rider_id = o.rider_id AND d.state = 'BOUND'
WHERE o.offered_at > now() - INTERVAL '7 days' AND o.push_result = 'SENT'
GROUP BY 1
ORDER BY pushed DESC, model;

-- name: offer_outcomes
-- How offers ended, per day (IST): ACCEPTED, DECLINED, EXPIRED (unanswered), LOST (another rider was faster), WITHDRAWN
-- or still ACTIVE. Blueprint C5: if over 20% expire unanswered, riders aren't hearing them; the offer sound should then
-- repeat until the offer is opened.
SELECT d.day_ist, d.state, d.offers, round(100.0 * d.offers / sum(d.offers) OVER (PARTITION BY d.day_ist), 1) AS pct
FROM (SELECT (o.offered_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist, o.state, count(*) AS offers
      FROM fleet_schema.trip_offer o
      WHERE o.offered_at > now() - INTERVAL '7 days'
      GROUP BY 1, 2) d
ORDER BY d.day_ist DESC, d.offers DESC, d.state;

-- name: earnings_per_online_hour
-- Phase 4 fairness (DISPATCH.md): each day (IST, last 14), riders online 30 minutes or more, and their pay per available
-- online hour (shift time less breaks; pay as Home shows it, by when it was finalized): the middle (p50), p10, p90 and the
-- Gini coefficient (0: everyone equal; 1: one rider earns it all). Fair turns (a fair band in the dispatch policy) are
-- worth trying when the Gini stays over 0.3 for a week with 5 or more riders a day; read offer_rules for their cost.
WITH win AS (
    SELECT d::date AS day_ist, (d::date::timestamp AT TIME ZONE 'Asia/Kolkata') AS from_at,
           LEAST(((d::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'), now()) AS to_at
    FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 13, (now() AT TIME ZONE 'Asia/Kolkata')::date, INTERVAL '1 day') d
), online AS (
    SELECT win.day_ist, s.rider_id,
           sum(extract(epoch FROM LEAST(COALESCE(s.ended_at, now()), win.to_at) - GREATEST(s.started_at, win.from_at))
               - COALESCE((SELECT sum(extract(epoch FROM LEAST(b.ends_at, COALESCE(s.ended_at, now()), win.to_at)
                                                     - GREATEST(b.started_at, s.started_at, win.from_at)))
                           FROM fleet_schema.rider_break b
                           WHERE b.shift_id = s.id AND b.started_at < LEAST(COALESCE(s.ended_at, now()), win.to_at)
                             AND b.ends_at > GREATEST(s.started_at, win.from_at)), 0)) AS seconds
    FROM win JOIN fleet_schema.rider_shift s ON s.started_at < win.to_at AND COALESCE(s.ended_at, now()) > win.from_at
    GROUP BY 1, 2
), earned AS (
    SELECT (COALESCE(t.pay_finalized_at, sl.ends_at) AT TIME ZONE 'Asia/Kolkata')::date AS day_ist, e.rider_id,
           sum(e.net_paise) AS paise
    FROM fleet_schema.rider_earning e
    LEFT JOIN fleet_schema.trip t ON t.id = e.trip_id
    LEFT JOIN fleet_schema.rider_slot sl ON sl.id = e.slot_id
    WHERE COALESCE(t.pay_finalized_at, sl.ends_at) > now() - INTERVAL '15 days'
    GROUP BY 1, 2
), rates AS (
    SELECT o.day_ist, COALESCE(e.paise, 0) * 3600.0 / o.seconds AS per_hour_paise
    FROM online o LEFT JOIN earned e ON e.day_ist = o.day_ist AND e.rider_id = o.rider_id
    WHERE o.seconds >= 1800
), ranked AS (
    SELECT day_ist, per_hour_paise, row_number() OVER (PARTITION BY day_ist ORDER BY per_hour_paise) AS i,
           count(*) OVER (PARTITION BY day_ist) AS n
    FROM rates
)
SELECT day_ist, max(n) AS riders,
       round((percentile_cont(0.1) WITHIN GROUP (ORDER BY per_hour_paise) / 100)::numeric, 2) AS p10_rupees_h,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY per_hour_paise) / 100)::numeric, 2) AS p50_rupees_h,
       round((percentile_cont(0.9) WITHIN GROUP (ORDER BY per_hour_paise) / 100)::numeric, 2) AS p90_rupees_h,
       round((sum((2 * i - n - 1) * per_hour_paise) / NULLIF(max(n) * sum(per_hour_paise), 0))::numeric, 3) AS gini
FROM ranked
GROUP BY day_ist
ORDER BY day_ist DESC;

-- name: offer_rules
-- Phase 4: how offers went out, per day (IST): by rule (NEAREST; FAIR, a fair turn; "before Phase 4" for offers without
-- a reason) and round, with how many were accepted and the mean pickup distance. Fair turns cost pickup metres: if FAIR
-- pickups run over 30% longer than NEAREST ones for a week, narrow the band. Later rounds mean riders passed or missed.
SELECT (o.offered_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist, COALESCE(o.reason ->> 'rule', 'before Phase 4') AS rule,
       o.round, count(*) AS offers, count(*) FILTER (WHERE o.state = 'ACCEPTED') AS accepted,
       round(avg(o.pickup_distance_m)) AS mean_pickup_m
FROM fleet_schema.trip_offer o
WHERE o.offered_at > now() - INTERVAL '14 days'
GROUP BY 1, 2, 3
ORDER BY day_ist DESC, rule, o.round;

-- name: rider_choices
-- Phase 4 rider choices (CRAVES_FLEET_RIDER_CHOICES_ENABLED): breaks over the last 7 days (riders who took one, how
-- many, their minutes and the longest), and active riders who chose a farthest pickup or drop now. Many riders narrowing
-- their distances means offers ask too much: read with offer_outcomes. Choices never count against a rider.
SELECT (SELECT count(DISTINCT b.rider_id) FROM fleet_schema.rider_break b WHERE b.started_at > now() - INTERVAL '7 days')
           AS riders_with_breaks,
       (SELECT count(*) FROM fleet_schema.rider_break b WHERE b.started_at > now() - INTERVAL '7 days') AS breaks,
       (SELECT COALESCE(round((sum(extract(epoch FROM LEAST(b.ends_at, now()) - b.started_at)) / 60)::numeric), 0)
        FROM fleet_schema.rider_break b WHERE b.started_at > now() - INTERVAL '7 days') AS break_minutes,
       (SELECT round((max(extract(epoch FROM LEAST(b.ends_at, now()) - b.started_at)) / 60)::numeric)
        FROM fleet_schema.rider_break b WHERE b.started_at > now() - INTERVAL '7 days') AS longest_break_minutes,
       (SELECT count(*) FROM fleet_schema.rider r WHERE r.status = 'ACTIVE' AND r.max_pickup_m IS NOT NULL) AS with_farthest_pickup,
       (SELECT count(*) FROM fleet_schema.rider r WHERE r.status = 'ACTIVE' AND r.max_drop_m IS NOT NULL) AS with_farthest_drop;

-- name: kitchen_wait
-- Phase 4: how long riders wait at each kitchen, from the "arrived" tap to pickup, over the last 14 days: trips, the
-- middle (p50) and p90 minutes, and on how many the food was ready before the rider arrived (the chef's ready tap first).
-- The rate card pays waiting after its free minutes. A kitchen whose middle wait is past them keeps riders waiting on
-- most trips: ask its chef to tap ready when the food is packed. Most kitchens over 10 minutes for two weeks: design
-- offers timed to the food (DISPATCH.md). Food mostly ready first: riders come late for it, so narrow any fair band.
SELECT max(t.kitchen_name) AS kitchen, count(*) AS trips,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.picked_up_at - t.arrived_kitchen_at) / 60))::numeric, 1)
           AS p50_wait_min,
       round((percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM t.picked_up_at - t.arrived_kitchen_at) / 60))::numeric, 1)
           AS p90_wait_min,
       count(*) FILTER (WHERE t.chef_ready_at <= t.arrived_kitchen_at) AS food_ready_first
FROM fleet_schema.trip t
WHERE t.picked_up_at > now() - INTERVAL '14 days' AND t.arrived_kitchen_at IS NOT NULL AND t.picked_up_at >= t.arrived_kitchen_at
GROUP BY t.chef_id
ORDER BY p50_wait_min DESC, trips DESC;

-- name: track_size
-- trip_track on disk: its day partitions and the default one. Thinning old tracks (P2-11) is worth doing past about 5 GB.
SELECT count(*) AS partitions,
       sum(pg_total_relation_size(c.oid)) AS total_bytes,
       pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS total_size
FROM pg_inherits i
JOIN pg_class c ON c.oid = i.inhrelid
WHERE i.inhparent = 'fleet_schema.trip_track'::regclass;
