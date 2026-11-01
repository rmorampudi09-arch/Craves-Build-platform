-- Offer delivery, measured (docs/riders/BLUEPRINT.md A5, C1): when the push was handed to notification-service and what
-- it answered, and when the phone first had the offer and through which channel (the rider app reports it on its next
-- /locations call). Offer-to-ring is rang_at - offered_at; PILOT-HEALTH.md has the queries.
ALTER TABLE fleet_schema.trip_offer ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
ALTER TABLE fleet_schema.trip_offer ADD COLUMN IF NOT EXISTS push_result VARCHAR(40);
ALTER TABLE fleet_schema.trip_offer ADD COLUMN IF NOT EXISTS rang_at TIMESTAMPTZ;
ALTER TABLE fleet_schema.trip_offer ADD COLUMN IF NOT EXISTS rang_channel VARCHAR(10)
    CHECK (rang_channel IN ('fcm', 'locations'));
