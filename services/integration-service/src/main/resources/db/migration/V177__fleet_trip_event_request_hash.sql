-- Phase C of the rider work: a trip step's Idempotency-Key is bound to the request it was first sent with
-- (FleetTripService.requestHash): SHA-256 hex of the method, the path (the step) and the body fields that decide it, a
-- delivery's method (OTP or PHOTO) and a failure's reason and note. Never the delivery code (unsalted beside the trip id,
-- it could be recovered), the photo or callsMade (a retry may re-encode or recount them), nor the tap's ageMs, fix or
-- capturedOffline, which every retry sends again. The same key with another hash is 422 IDEMPOTENCY_KEY_REUSED. NULL on
-- rows from before this and on system rows: those replay as they always did.
-- Nullable without a default, so adding it rewrites nothing and older code ignores it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE fleet_schema.trip_event ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
