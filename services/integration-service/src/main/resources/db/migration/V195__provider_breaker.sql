-- The courier breaker shared by every replica (CRAVES_COURIER_BREAKER_ENABLED, default off: nothing reads or writes
-- this until then). One row per courier, written on its first failure. A new table only.
CREATE TABLE IF NOT EXISTS delivery_schema.provider_breaker (
    provider_id      VARCHAR(16) PRIMARY KEY,
    booking_failures SMALLINT    NOT NULL DEFAULT 0,   -- in a row, across all replicas
    quote_failures   SMALLINT    NOT NULL DEFAULT 0,
    opened_at        TIMESTAMPTZ,                      -- NULL = closed
    probe_at         TIMESTAMPTZ,                      -- when a replica last claimed the half-open probe
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
