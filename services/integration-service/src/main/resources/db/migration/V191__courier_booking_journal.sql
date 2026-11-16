-- One row per courier booking attempt, committed before the courier is called (CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED,
-- default off: the table stays empty until then). Additive only.
CREATE TABLE IF NOT EXISTS delivery_schema.provider_create_attempt (
    chef_sub_order_id UUID         NOT NULL,
    provider_id       VARCHAR(80)  NOT NULL,
    attempt_no        SMALLINT     NOT NULL,
    -- The reference sent to the courier for this attempt: the order id in base 36 plus the attempt number.
    client_ref        VARCHAR(32)  NOT NULL,
    state             VARCHAR(14)  NOT NULL,
    provider_ref      VARCHAR(200),
    error             VARCHAR(500),
    -- When a background lookup of this row is due; NULL when none is.
    next_check_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When the state last changed; lookups that change no state leave it alone.
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (chef_sub_order_id, provider_id, attempt_no),
    CONSTRAINT ck_provider_create_attempt_state CHECK (state IN (
        'INTENT', 'CONFIRMED', 'REJECTED', 'UNKNOWN', 'ORPHAN_SUSPECT', 'ADOPTED', 'CANCELLED'
    ))
);

-- One unresolved booking per order, whichever the courier.
CREATE UNIQUE INDEX IF NOT EXISTS provider_create_attempt_unresolved
    ON delivery_schema.provider_create_attempt (chef_sub_order_id)
    WHERE state IN ('INTENT', 'UNKNOWN');

-- A courier is booked again for an order only after refusals.
CREATE UNIQUE INDEX IF NOT EXISTS provider_create_attempt_per_courier
    ON delivery_schema.provider_create_attempt (chef_sub_order_id, provider_id)
    WHERE state <> 'REJECTED';

CREATE UNIQUE INDEX IF NOT EXISTS provider_create_attempt_ref
    ON delivery_schema.provider_create_attempt (provider_id, client_ref);

CREATE INDEX IF NOT EXISTS provider_create_attempt_due
    ON delivery_schema.provider_create_attempt (next_check_at)
    WHERE next_check_at IS NOT NULL;

-- The alert monitor's two counts (IntegrationAlertMonitor): open attempts by state age, and recent attempts per courier.
CREATE INDEX IF NOT EXISTS provider_create_attempt_open
    ON delivery_schema.provider_create_attempt (updated_at)
    WHERE state IN ('INTENT', 'UNKNOWN', 'ORPHAN_SUSPECT');

CREATE INDEX IF NOT EXISTS provider_create_attempt_created
    ON delivery_schema.provider_create_attempt (created_at);
