-- Rider support (rider-v1 /support/issues). Re-runnable like V152.
-- An open issue on a trip keeps that trip's pay out of the balance (FleetEarnings.RELEASED); find them by trip.
CREATE INDEX IF NOT EXISTS support_issue_trip ON fleet_schema.support_issue (trip_id) WHERE trip_id IS NOT NULL;
