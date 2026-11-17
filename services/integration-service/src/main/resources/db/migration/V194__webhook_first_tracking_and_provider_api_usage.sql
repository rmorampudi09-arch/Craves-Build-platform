-- Webhook-first courier tracking (CRAVES_DELIVERY_WEBHOOK_FIRST_TRACKING_ENABLED) and the courier API call count
-- (CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED). Both default off: nothing reads or writes these until then. Additive only.
ALTER TABLE delivery_schema.delivery_job
    ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_polled_at  TIMESTAMPTZ;

-- Calls to a courier's API, summed across replicas, per day in India. alerted_at: when the day's usage alert was raised.
CREATE TABLE IF NOT EXISTS delivery_schema.provider_api_usage (
    provider_id VARCHAR(16) NOT NULL,
    day         DATE        NOT NULL,
    calls       INT         NOT NULL DEFAULT 0,
    alerted_at  TIMESTAMPTZ,
    PRIMARY KEY (provider_id, day)
);
