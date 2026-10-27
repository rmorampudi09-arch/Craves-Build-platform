-- The phone's health on the shift (docs/riders/BLUEPRINT.md A5, A9), from the rider app's /locations calls once a
-- minute: battery, charging, power saver, whether offers can ring, battery drain while unplugged, why the app last
-- died and the trip actions waiting to sync. Each key keeps its latest value. Kept 90 days (BACKEND.md "Data retention").
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS health JSONB;

-- False when the phone can't ring an offer (notifications off, or the offers channel turned down): dispatch and ops
-- reassign skip the rider until it is true again. NULL (an app before 1.1.0) counts as able to ring.
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS can_ring BOOLEAN;
