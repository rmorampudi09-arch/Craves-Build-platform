SET LOCAL lock_timeout = '5s';

-- One choice per chef-declined day or per resume: a refund request or the days added at the end.
-- Written only while CRAVES_SUBSCRIPTION_REFUND_CHOICE_ENABLED is on; finance fills refund_amount later.
CREATE TABLE IF NOT EXISTS subscription_schema.subscription_day_credit (
    id UUID PRIMARY KEY,
    subscription_id UUID NOT NULL REFERENCES subscription_schema.customer_subscription(id),
    kind VARCHAR(20) NOT NULL CONSTRAINT ck_day_credit_kind CHECK (kind IN ('DECLINE', 'PAUSE')),
    first_date DATE NOT NULL,
    last_date DATE NOT NULL,
    meal_slot_code VARCHAR(40),
    days INTEGER CONSTRAINT ck_day_credit_days CHECK (days IS NULL OR days > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_CHOICE' CONSTRAINT ck_day_credit_status
        CHECK (status IN ('PENDING_CHOICE', 'EXTENDED', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED')),
    refund_amount NUMERIC(10, 2),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    chosen_by VARCHAR(20) CONSTRAINT ck_day_credit_chosen_by CHECK (chosen_by IS NULL OR chosen_by IN ('CUSTOMER', 'SYSTEM')),
    choice_deadline TIMESTAMPTZ NOT NULL,
    chosen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_day_credit_dates CHECK (last_date >= first_date),
    CONSTRAINT uq_day_credit_subscription_kind_first_date UNIQUE (subscription_id, kind, first_date)
);

CREATE INDEX IF NOT EXISTS ix_day_credit_pending_deadline
    ON subscription_schema.subscription_day_credit (choice_deadline)
    WHERE status = 'PENDING_CHOICE';
