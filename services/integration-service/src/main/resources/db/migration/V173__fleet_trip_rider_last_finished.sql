-- Phase 5, fair turns at scale: each rider's latest finished trip, MAX(finished_at) by rider. FleetDispatcher.standings
-- reads it for every rider in a fair band, and the fleet engine's feed (FleetEngineFeed) for every rider on a shift every
-- 5 minutes and after each change. The partial trip_rider_finished index (paid trips only) can't serve it, so without
-- this each read scans every trip. Additive: the fleet's trip table is small when this applies, so it builds in moments.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS trip_rider_last_finished ON fleet_schema.trip (rider_id, finished_at);
