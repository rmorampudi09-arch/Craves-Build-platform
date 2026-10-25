-- Manual rider payouts (PLAN F13). Re-runnable like V152: database tests migrate again without dropping fleet_schema.

-- A payout file: WEEKLY (a Monday, every rider's whole withdrawable balance) or DAILY_WITHDRAWAL (the requests not yet
-- paid). Made from the database, approved by a second admin, uploaded to the bank by hand, then marked with UTRs.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_payout_batch (
    id               UUID PRIMARY KEY,
    kind             VARCHAR(16)  NOT NULL CHECK (kind IN ('WEEKLY', 'DAILY_WITHDRAWAL')),
    payout_date      DATE         NOT NULL,
    status           VARCHAR(10)  NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'APPROVED', 'SENT', 'CLOSED')),
    created_by       UUID         NOT NULL,
    created_by_name  VARCHAR(120) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_by      UUID,
    approved_by_name VARCHAR(120),
    approved_at      TIMESTAMPTZ,
    sent_at          TIMESTAMPTZ,
    closed_at        TIMESTAMPTZ,
    UNIQUE (kind, payout_date),
    CHECK (kind <> 'WEEKLY' OR EXTRACT(ISODOW FROM payout_date) = 1),
    -- Maker-checker: whoever made the file never approves it.
    CHECK (approved_by IS NULL OR approved_by <> created_by),
    CHECK ((status = 'CREATED') = (approved_at IS NULL)),
    CHECK ((approved_by IS NULL) = (approved_at IS NULL) AND (approved_by IS NULL) = (approved_by_name IS NULL)),
    CHECK ((status IN ('SENT', 'CLOSED')) = (sent_at IS NOT NULL)),
    CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS rider_payout_batch_newest ON fleet_schema.rider_payout_batch (created_at DESC);

-- A weekly payout is made with its batch; a withdrawal waits for the next daily batch. Only a batched payout is
-- marked PAID or FAILED, and a payout is in one batch only, so it is never sent twice.
ALTER TABLE fleet_schema.rider_payout_instruction
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES fleet_schema.rider_payout_batch (id),
    DROP CONSTRAINT IF EXISTS rider_payout_instruction_batched,
    ADD CONSTRAINT rider_payout_instruction_batched CHECK ((kind = 'DAILY_WITHDRAWAL' OR batch_id IS NOT NULL)
        AND (state = 'PENDING' OR batch_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS rider_payout_instruction_batch ON fleet_schema.rider_payout_instruction (batch_id);
CREATE INDEX IF NOT EXISTS rider_payout_instruction_waiting ON fleet_schema.rider_payout_instruction (payout_date)
    WHERE batch_id IS NULL;
CREATE INDEX IF NOT EXISTS rider_payout_instruction_rider ON fleet_schema.rider_payout_instruction (rider_id, created_at DESC);

-- A payout that failed at the bank pauses the rider's payouts until ops sets (verifies) a new account.
ALTER TABLE fleet_schema.rider_payout_account
    ADD COLUMN IF NOT EXISTS payouts_paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused_reason     VARCHAR(1000),
    DROP CONSTRAINT IF EXISTS rider_payout_account_paused,
    ADD CONSTRAINT rider_payout_account_paused CHECK ((payouts_paused_at IS NULL) = (paused_reason IS NULL));

-- The withdrawal's Idempotency-Key: a retry of the same request answers again; another request that day is refused.
ALTER TABLE fleet_schema.rider_withdrawal_day ADD COLUMN IF NOT EXISTS idem_key VARCHAR(128) NOT NULL;

-- Debt from negative adjustments is recovered only from future pay: at most the weekly cap, once a week, taken when the
-- weekly batch is made. Never debited from the rider's bank.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_recovery (
    rider_id     UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    week_start   DATE        NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
    amount_paise BIGINT      NOT NULL CHECK (amount_paise > 0),
    batch_id     UUID        NOT NULL REFERENCES fleet_schema.rider_payout_batch (id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, week_start)
);
