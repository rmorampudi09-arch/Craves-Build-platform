-- Rider earnings (PLAN F12). Re-runnable like V152: database tests migrate again without dropping fleet_schema.

-- Pooled journal accounts (V121), as the referral wallet does (V138): one RIDER_PAYABLE liability for every rider; each
-- rider's share is their fleet_schema.rider_earning rows less their paid payouts.
INSERT INTO payment_schema.ledger_account (account_code, currency, account_class, description) VALUES
    ('RIDER_PAYABLE', 'INR', 'LIABILITY', 'Craves rider pay earned and not yet paid out; per rider in fleet_schema.rider_earning'),
    ('RIDER_TDS_PAYABLE', 'INR', 'LIABILITY', 'Income tax withheld from Craves rider pay, awaiting deposit')
ON CONFLICT DO NOTHING;

-- A row is one trip's pay line or one slot's guaranteed-minimum top-up, per component and revision. Revision 1 is the
-- credit; later revisions are signed adjustments with a reason. Component tds is the tax withheld (net = -withheld).
ALTER TABLE fleet_schema.rider_earning
    ALTER COLUMN trip_id DROP NOT NULL,
    ALTER COLUMN rate_card_version DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES fleet_schema.rider_slot (id),
    ADD COLUMN IF NOT EXISTS label   VARCHAR(160),
    ADD COLUMN IF NOT EXISTS reason  VARCHAR(1000),
    DROP CONSTRAINT IF EXISTS rider_earning_check,
    DROP CONSTRAINT IF EXISTS rider_earning_source,
    DROP CONSTRAINT IF EXISTS rider_earning_adjustment_reason,
    ADD CONSTRAINT rider_earning_source CHECK (
        (trip_id IS NOT NULL AND slot_id IS NULL AND rate_card_version IS NOT NULL
            AND business_key = 'fleet-trip-pay/' || trip_id::text || '/' || component || '/' || revision::text)
        OR (slot_id IS NOT NULL AND trip_id IS NULL
            AND business_key = 'fleet-slot-pay/' || slot_id::text || '/' || component || '/' || revision::text)),
    ADD CONSTRAINT rider_earning_adjustment_reason CHECK (revision = 1 OR component = 'tds' OR reason IS NOT NULL);
CREATE INDEX IF NOT EXISTS rider_earning_trip ON fleet_schema.rider_earning (trip_id);

-- Set once the trip's final pay is in rider_earning and the journal; a job credits finished trips still without it.
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS pay_credited_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS trip_pay_uncredited ON fleet_schema.trip (pay_finalized_at)
    WHERE pay_finalized_at IS NOT NULL AND pay_credited_at IS NULL;

-- A hold stops one trip's pay only, with a reason the rider sees, until release_on (IST) at the latest: at most 7 days.
-- One hold per trip ever, so a hold can never be renewed past 7 days. created_by is null for the automatic hold of a
-- photo delivery, a failed delivery or a lost rider.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_pay_hold (
    id               UUID PRIMARY KEY,
    trip_id          UUID          NOT NULL UNIQUE REFERENCES fleet_schema.trip (id),
    rider_id         UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    reason           VARCHAR(1000) NOT NULL CHECK (char_length(btrim(reason)) >= 3),
    release_on       DATE          NOT NULL,
    state            VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'RELEASED')),
    created_by       UUID,
    created_by_name  VARCHAR(120)  NOT NULL,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    released_by      UUID,
    released_by_name VARCHAR(120),
    released_at      TIMESTAMPTZ,
    CHECK (release_on BETWEEN (created_at AT TIME ZONE 'Asia/Kolkata')::date AND (created_at AT TIME ZONE 'Asia/Kolkata')::date + 7),
    CHECK ((state = 'RELEASED') = (released_at IS NOT NULL)),
    CHECK ((released_by IS NULL) = (released_by_name IS NULL))
);
CREATE INDEX IF NOT EXISTS rider_pay_hold_due ON fleet_schema.rider_pay_hold (release_on) WHERE state = 'ACTIVE';
CREATE INDEX IF NOT EXISTS rider_pay_hold_newest ON fleet_schema.rider_pay_hold (state, created_at DESC);
