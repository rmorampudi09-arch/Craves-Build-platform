-- Latest provider-neutral delivery telemetry projection.
-- This intentionally stores only the latest useful telemetry on delivery_job;
-- raw provider status/audit payloads remain in the existing durable inbox/event tables.

ALTER TABLE delivery_schema.delivery_job
    ADD COLUMN IF NOT EXISTS courier_latitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS courier_longitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS courier_location_observed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_pickup_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_pickup_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_dropoff_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_dropoff_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telemetry_observed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telemetry_source VARCHAR(30);

ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_courier_coordinate_pair;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_courier_coordinate_pair CHECK (
        (courier_latitude IS NULL AND courier_longitude IS NULL)
        OR (courier_latitude IS NOT NULL AND courier_longitude IS NOT NULL)
    );
ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_courier_latitude;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_courier_latitude CHECK (
        courier_latitude IS NULL OR courier_latitude BETWEEN -90 AND 90
    );
ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_courier_longitude;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_courier_longitude CHECK (
        courier_longitude IS NULL OR courier_longitude BETWEEN -180 AND 180
    );
ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_pickup_window;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_pickup_window CHECK (
        estimated_pickup_start_at IS NULL
        OR estimated_pickup_end_at IS NULL
        OR estimated_pickup_end_at >= estimated_pickup_start_at
    );
ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_dropoff_window;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_dropoff_window CHECK (
        estimated_dropoff_start_at IS NULL
        OR estimated_dropoff_end_at IS NULL
        OR estimated_dropoff_end_at >= estimated_dropoff_start_at
    );
ALTER TABLE delivery_schema.delivery_job
    DROP CONSTRAINT IF EXISTS ck_delivery_job_telemetry_source;
ALTER TABLE delivery_schema.delivery_job
    ADD CONSTRAINT ck_delivery_job_telemetry_source CHECK (
        telemetry_source IS NULL OR telemetry_source IN ('TRACK', 'WEBHOOK')
    );
CREATE INDEX IF NOT EXISTS ix_delivery_job_telemetry_observed
    ON delivery_schema.delivery_job (telemetry_observed_at DESC)
    WHERE telemetry_observed_at IS NOT NULL;
