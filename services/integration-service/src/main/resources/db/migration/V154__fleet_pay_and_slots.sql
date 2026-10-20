-- Rider pay (PLAN F7) and ops-assigned slots (F7b). Re-runnable like V152: database tests migrate again.

-- Event fees and the customer-unreachable wait belong to the rate card, so they are in the written terms.
-- The seeded values are draft business inputs, like the rest of 2026-10-v1.
ALTER TABLE fleet_schema.rate_card
    ADD COLUMN IF NOT EXISTS cancellation_fee_paise   BIGINT  NOT NULL DEFAULT 2000 CHECK (cancellation_fee_paise >= 0),
    ADD COLUMN IF NOT EXISTS return_per_km_paise      BIGINT  NOT NULL DEFAULT 900 CHECK (return_per_km_paise >= 0),
    ADD COLUMN IF NOT EXISTS unreachable_wait_minutes INTEGER NOT NULL DEFAULT 10 CHECK (unreachable_wait_minutes BETWEEN 1 AND 60);
UPDATE fleet_schema.rate_card
SET ranges = ranges || '{"cancellation_fee_paise": [0, 5000], "return_per_km_paise": [0, 1500], "unreachable_wait_minutes": [5, 15]}'
WHERE status = 'DRAFT' AND ranges -> 'cancellation_fee_paise' IS NULL;

-- Pickup km = straight line x pickup_detour_percent / 100. The cost guard offers a trip to riders only when
-- locked pay + per_order_overhead_paise <= the live Borzo or Pidge quote + cost_guard_premium_paise.
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS pickup_detour_percent    INTEGER NOT NULL DEFAULT 130 CHECK (pickup_detour_percent BETWEEN 100 AND 300),
    ADD COLUMN IF NOT EXISTS per_order_overhead_paise BIGINT  NOT NULL DEFAULT 500 CHECK (per_order_overhead_paise >= 0),
    ADD COLUMN IF NOT EXISTS cost_guard_premium_paise BIGINT  NOT NULL DEFAULT 1000 CHECK (cost_guard_premium_paise >= 0);
UPDATE fleet_schema.dispatch_policy
SET ranges = ranges || '{"pickup_detour_percent": [100, 200], "per_order_overhead_paise": [0, 3000], "cost_guard_premium_paise": [0, 3000]}'
WHERE status = 'DRAFT' AND ranges -> 'pickup_detour_percent' IS NULL;

-- The pay a trip ended with (lines as shown to the rider, held for ops or not). Set once; the money phase credits it.
ALTER TABLE fleet_schema.trip
    ADD COLUMN IF NOT EXISTS final_pay_lines  JSONB,
    ADD COLUMN IF NOT EXISTS final_pay_paise  BIGINT CHECK (final_pay_paise >= 0),
    ADD COLUMN IF NOT EXISTS pay_held         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS hold_reason      VARCHAR(500),
    ADD COLUMN IF NOT EXISTS pay_finalized_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS trip_rider_finished ON fleet_schema.trip (rider_id, finished_at) WHERE final_pay_paise IS NOT NULL;

-- Slots carry their own guarantee (inside the rate card's declared range) and a status.
ALTER TABLE fleet_schema.rider_slot
    ADD COLUMN IF NOT EXISTS guaranteed_per_hour_paise BIGINT CHECK (guaranteed_per_hour_paise > 0),
    ADD COLUMN IF NOT EXISTS status           VARCHAR(10) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CANCELLED', 'COMPLETED')),
    ADD COLUMN IF NOT EXISTS created_by       UUID,
    ADD COLUMN IF NOT EXISTS cancelled_reason VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS cancelled_by     UUID,
    ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS rider_slot_starts ON fleet_schema.rider_slot (starts_at);
CREATE INDEX IF NOT EXISTS rider_slot_due ON fleet_schema.rider_slot (ends_at) WHERE status = 'BOOKED';

-- The guaranteed-minimum top-up for one finished slot: max(0, guarantee for the online in-zone time - trip pay in the
-- slot). Computed once at slot end; the money phase credits it and sets credited_at.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_slot_settlement (
    slot_id                   UUID PRIMARY KEY REFERENCES fleet_schema.rider_slot (id),
    rider_id                  UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    guaranteed_per_hour_paise BIGINT      NOT NULL CHECK (guaranteed_per_hour_paise > 0),
    online_in_zone_seconds    INTEGER     NOT NULL CHECK (online_in_zone_seconds >= 0),
    guaranteed_paise          BIGINT      NOT NULL CHECK (guaranteed_paise >= 0),
    trip_pay_paise            BIGINT      NOT NULL CHECK (trip_pay_paise >= 0),
    top_up_paise              BIGINT      NOT NULL CHECK (top_up_paise >= 0),
    computed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    credited_at               TIMESTAMPTZ,
    CHECK (top_up_paise = GREATEST(0, guaranteed_paise - trip_pay_paise))
);
CREATE INDEX IF NOT EXISTS rider_slot_settlement_uncredited ON fleet_schema.rider_slot_settlement (computed_at) WHERE credited_at IS NULL;
