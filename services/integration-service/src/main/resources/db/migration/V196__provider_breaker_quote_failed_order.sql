-- The shared courier breaker (CRAVES_COURIER_BREAKER_ENABLED, default off) counts one order's failed quotes once: this
-- is the order counted last. Additive; code that does not know the column is unaffected.
SET LOCAL lock_timeout = '5s';
ALTER TABLE delivery_schema.provider_breaker ADD COLUMN IF NOT EXISTS quote_failed_order UUID;
