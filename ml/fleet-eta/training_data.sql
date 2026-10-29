-- Training legs for ml/fleet-eta (README.md, step 1): every delivered Craves-fleet trip of the last 90 days as its two legs,
-- the rider to the kitchen (leg 0) and the kitchen to the customer (leg 1). Read-only. Run it with a read-only role:
--   psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1 --csv -f ml/fleet-eta/training_data.sql > legs.csv
-- What leaves the database, and nothing more:
-- * both ends of the leg to 3 decimal places (about 110 m: a neighbourhood, not a door);
-- * the straight-line metres and the bearing between the exact ends, by the same formulas as EtaModel.features;
-- * when the leg started, to the quarter hour, and how many minutes it took;
-- * rule_metres: the distance today's estimate used (the trip's locked pickup and drop distances), to test against;
-- * rider_group: a number standing for the rider, drawn afresh at random in every export. Training uses it to weigh every
--   rider alike and to test on riders it never saw. It can't be traced to a rider, or matched between two exports.
-- No rider, customer, order or trip id leaves the database.
-- Leg 0 is the ride itself, never the time a rider takes to set off: it starts at the last real (non-mock) fix within 50 m
-- of where the rider was on accepting, just before their first fix 50 m or more away, and ends on arriving at the kitchen.
-- Leg 1 runs from pickup to arriving at the drop. trip_track keeps 90 days (docs/riders/BACKEND.md, "Retention").
WITH salt AS (
    SELECT md5(random()::text || clock_timestamp()::text) AS s
),
done AS (
    SELECT t.id, t.kitchen_lat, t.kitchen_lng, t.drop_lat, t.drop_lng, t.accepted_at, t.arrived_kitchen_at, t.picked_up_at,
           t.arrived_drop_at, t.pickup_distance_m, t.drop_distance_m,
           dense_rank() OVER (ORDER BY md5(t.rider_id::text || salt.s)) AS rider_group
    FROM fleet_schema.trip t
    CROSS JOIN salt
    WHERE t.state = 'DELIVERED' AND t.provider = 'CRAVES_FLEET' AND t.rider_id IS NOT NULL
      AND t.finished_at > now() - interval '90 days'
),
accepted_at AS (  -- where the rider was on accepting: their first real fix within 2 minutes of it
    SELECT d.id, f.lat, f.lng, f.recorded_at
    FROM done d
    CROSS JOIN LATERAL (
        SELECT k.lat, k.lng, k.recorded_at
        FROM fleet_schema.trip_track k
        WHERE k.trip_id = d.id AND NOT k.mock AND k.recorded_at >= d.accepted_at AND k.recorded_at < d.accepted_at + interval '2 minutes'
        ORDER BY k.recorded_at
        LIMIT 1) f
    WHERE d.accepted_at IS NOT NULL AND d.arrived_kitchen_at IS NOT NULL
),
moved AS (  -- the rider's first real fix 50 m or more from there, before the kitchen
    SELECT a.id, m.recorded_at
    FROM accepted_at a
    JOIN done d ON d.id = a.id
    CROSS JOIN LATERAL (
        SELECT k.recorded_at
        FROM fleet_schema.trip_track k
        WHERE k.trip_id = a.id AND NOT k.mock AND k.recorded_at > a.recorded_at AND k.recorded_at < d.arrived_kitchen_at
          AND 111195 * sqrt(power(k.lat - a.lat, 2) + power((k.lng - a.lng) * cos(radians(a.lat)), 2)) >= 50
        ORDER BY k.recorded_at
        LIMIT 1) m
),
set_off AS (  -- the last real fix still within 50 m, just before that
    SELECT a.id, a.lat, a.lng, coalesce(s.recorded_at, a.recorded_at) AS at
    FROM accepted_at a
    JOIN moved mv ON mv.id = a.id
    LEFT JOIN LATERAL (
        SELECT k.recorded_at
        FROM fleet_schema.trip_track k
        WHERE k.trip_id = a.id AND NOT k.mock AND k.recorded_at >= a.recorded_at AND k.recorded_at < mv.recorded_at
          AND 111195 * sqrt(power(k.lat - a.lat, 2) + power((k.lng - a.lng) * cos(radians(a.lat)), 2)) < 50
        ORDER BY k.recorded_at DESC
        LIMIT 1) s ON true
),
legs AS (
    SELECT 0 AS leg, so.lat AS from_lat, so.lng AS from_lng, d.kitchen_lat AS to_lat, d.kitchen_lng AS to_lng, so.at AS started,
           EXTRACT(EPOCH FROM d.arrived_kitchen_at - so.at) / 60.0 AS minutes, d.pickup_distance_m AS rule_metres, d.rider_group
    FROM set_off so
    JOIN done d ON d.id = so.id
    UNION ALL
    SELECT 1, d.kitchen_lat, d.kitchen_lng, d.drop_lat, d.drop_lng, d.picked_up_at,
           EXTRACT(EPOCH FROM d.arrived_drop_at - d.picked_up_at) / 60.0, d.drop_distance_m, d.rider_group
    FROM done d
    WHERE d.picked_up_at IS NOT NULL AND d.arrived_drop_at IS NOT NULL
)
SELECT leg,
       round(from_lat::numeric, 3) AS from_lat, round(from_lng::numeric, 3) AS from_lng,
       round(to_lat::numeric, 3) AS to_lat, round(to_lng::numeric, 3) AS to_lng,
       2 * 6371000 * asin(least(1, sqrt(power(sin(radians(to_lat - from_lat) / 2), 2)
           + cos(radians(from_lat)) * cos(radians(to_lat)) * power(sin(radians(to_lng - from_lng) / 2), 2)))) AS metres,
       sin(atan2(sin(radians(to_lng - from_lng)) * cos(radians(to_lat)),
           cos(radians(from_lat)) * sin(radians(to_lat)) - sin(radians(from_lat)) * cos(radians(to_lat)) * cos(radians(to_lng - from_lng))))
           AS bearing_sin,
       cos(atan2(sin(radians(to_lng - from_lng)) * cos(radians(to_lat)),
           cos(radians(from_lat)) * sin(radians(to_lat)) - sin(radians(from_lat)) * cos(radians(to_lat)) * cos(radians(to_lng - from_lng))))
           AS bearing_cos,
       (floor(EXTRACT(EPOCH FROM started) / 900) * 900000)::bigint AS start_ms,
       round(minutes::numeric, 3) AS minutes, rule_metres, rider_group
FROM legs
WHERE minutes > 0
ORDER BY start_ms;
