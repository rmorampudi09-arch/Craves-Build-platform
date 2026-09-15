-- Latest provider-neutral delivery telemetry projection for customer/chef reads.
-- No GPS history table is created; only the latest trusted snapshot is retained in Order Service.

ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS delivery_courier_latitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS delivery_courier_longitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS delivery_courier_location_observed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_estimated_pickup_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_estimated_pickup_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_estimated_dropoff_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_estimated_dropoff_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_telemetry_observed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_telemetry_event_id UUID;

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS ck_customer_order_delivery_courier_coordinate_pair;

ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT ck_customer_order_delivery_courier_coordinate_pair CHECK (
        (delivery_courier_latitude IS NULL AND delivery_courier_longitude IS NULL)
        OR (delivery_courier_latitude IS NOT NULL AND delivery_courier_longitude IS NOT NULL)
    );

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS ck_customer_order_delivery_courier_latitude;

ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT ck_customer_order_delivery_courier_latitude CHECK (
        delivery_courier_latitude IS NULL OR delivery_courier_latitude BETWEEN -90 AND 90
    );

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS ck_customer_order_delivery_courier_longitude;

ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT ck_customer_order_delivery_courier_longitude CHECK (
        delivery_courier_longitude IS NULL OR delivery_courier_longitude BETWEEN -180 AND 180
    );

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS ck_customer_order_delivery_pickup_window;

ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT ck_customer_order_delivery_pickup_window CHECK (
        delivery_estimated_pickup_start_at IS NULL
        OR delivery_estimated_pickup_end_at IS NULL
        OR delivery_estimated_pickup_end_at >= delivery_estimated_pickup_start_at
    );

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS ck_customer_order_delivery_dropoff_window;

ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT ck_customer_order_delivery_dropoff_window CHECK (
        delivery_estimated_dropoff_start_at IS NULL
        OR delivery_estimated_dropoff_end_at IS NULL
        OR delivery_estimated_dropoff_end_at >= delivery_estimated_dropoff_start_at
    );

CREATE INDEX IF NOT EXISTS ix_customer_order_delivery_telemetry_event
    ON order_schema.customer_order (delivery_telemetry_event_id)
    WHERE delivery_telemetry_event_id IS NOT NULL;
