-- A rider's recent offers on the ops console's rider page (newest first, with how each reached the phone), without
-- reading every offer. trip_offer is small before live dispatch, so the build takes a moment.
CREATE INDEX IF NOT EXISTS trip_offer_rider_offered ON fleet_schema.trip_offer (rider_id, offered_at DESC);
