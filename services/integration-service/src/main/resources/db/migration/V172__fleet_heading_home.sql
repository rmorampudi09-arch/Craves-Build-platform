-- Phase 5, heading home (docs/riders/DISPATCH.md §4). A rider saves a home spot from the app ("I'm home: save this spot"),
-- and while heading home is on they hear only of orders whose drop is nearer home than they are and not far out of their
-- way. The spot is the phone's position rounded to 2 decimal places (about 1.1 km by 1.06 km in Hyderabad), never an
-- address: the app rounds it before sending and these columns hold no more. Ops never sees it. It is forgotten when the
-- rider deletes it, and 90 days after it was last saved or used (FleetLocationService). Set from the app only while
-- CRAVES_FLEET_RIDER_CHOICES_ENABLED is on; deleting it always works.
SET LOCAL lock_timeout = '5s';

ALTER TABLE fleet_schema.rider
    ADD COLUMN IF NOT EXISTS home_lat      NUMERIC(5, 2) CHECK (home_lat BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS home_lng      NUMERIC(5, 2) CHECK (home_lng BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS home_saved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS home_used_at  TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rider_home_whole'
                   AND conrelid = 'fleet_schema.rider'::regclass) THEN
        ALTER TABLE fleet_schema.rider ADD CONSTRAINT rider_home_whole
            CHECK ((home_lat IS NULL) = (home_lng IS NULL) AND (home_lat IS NULL) = (home_saved_at IS NULL));
    END IF;
END $$;

-- Heading home is on for the shift until this time (an hour from turning it on; the rider can turn it on again). It ends
-- sooner when the rider turns it off, goes offline, or reaches within 1 km of the home spot.
ALTER TABLE fleet_schema.rider_shift
    ADD COLUMN IF NOT EXISTS heading_home_until TIMESTAMPTZ;
