-- Provider-native exact ETA timestamps.
-- These columns complement, rather than replace, provider ETA windows introduced by V112.
-- Craves does not manufacture an ETA range when a provider supplies a single exact timestamp.

ALTER TABLE delivery_schema.delivery_job
    ADD COLUMN IF NOT EXISTS estimated_pickup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_dropoff_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_delivery_job_estimated_dropoff_at
    ON delivery_schema.delivery_job (estimated_dropoff_at)
    WHERE estimated_dropoff_at IS NOT NULL;
