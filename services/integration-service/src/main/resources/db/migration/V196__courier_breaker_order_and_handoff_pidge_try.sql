-- Additive columns for two default-off flags; code that does not know them is unaffected.
-- Give up rather than queue behind a long transaction on a busy table.
SET LOCAL lock_timeout = '5s';
-- The shared courier breaker (CRAVES_COURIER_BREAKER_ENABLED) counts one order's failed quotes once: the order counted last.
ALTER TABLE delivery_schema.provider_breaker ADD COLUMN IF NOT EXISTS quote_failed_order UUID;
-- Courier capabilities (CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED): the claim number of the Pidge phase's first failed
-- try, so its tries are counted apart from the Borzo phase's.
ALTER TABLE delivery_schema.delivery_borzo_pidge_handoff ADD COLUMN IF NOT EXISTS pidge_phase_first_attempt INTEGER;
