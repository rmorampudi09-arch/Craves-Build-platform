-- A customer asked to hear when the first home kitchen opens near a delivery spot.
-- The key rounds the spot to 3 decimal places (about 110 m), so repeat taps at one address stay one row.
CREATE TABLE customer_kitchen_launch_alert (
    identity_id UUID NOT NULL,
    latitude_key NUMERIC(6,3) NOT NULL,
    longitude_key NUMERIC(7,3) NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    area_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at TIMESTAMPTZ,
    PRIMARY KEY (identity_id, latitude_key, longitude_key)
);

CREATE INDEX idx_customer_kitchen_launch_alert_waiting
    ON customer_kitchen_launch_alert (latitude_key, longitude_key)
    WHERE notified_at IS NULL;
