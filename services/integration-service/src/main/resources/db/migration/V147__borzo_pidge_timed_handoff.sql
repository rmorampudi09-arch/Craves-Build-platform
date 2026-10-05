-- Provider handoff is opt-in at runtime. Existing deliveries are not enrolled.
-- A separate journal preserves the original Borzo order after the logical job switches to Pidge.
ALTER TABLE delivery_schema.delivery_command
    ADD COLUMN borzo_window_started_at TIMESTAMPTZ;

CREATE TABLE delivery_schema.delivery_borzo_pidge_handoff (
    delivery_job_id UUID PRIMARY KEY REFERENCES delivery_schema.delivery_job(id),
    borzo_provider_delivery_id VARCHAR(200) NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(40) NOT NULL DEFAULT 'WAITING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ,
    pidge_provider_delivery_id VARCHAR(200),
    borzo_cancelled_at TIMESTAMPTZ,
    borzo_cancel_intent_at TIMESTAMPTZ,
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_delivery_handoff_state CHECK (state IN (
        'WAITING', 'PROCESSING_BORZO', 'BORZO_CANCELLED', 'PROCESSING_PIDGE',
        'PIDGE_RECONCILIATION_PENDING', 'RETAINED_BORZO', 'COMPLETED', 'MANUAL_REVIEW'
    )),
    CONSTRAINT ck_delivery_handoff_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_delivery_handoff_due_after_start CHECK (due_at > started_at)
);

CREATE INDEX ix_delivery_handoff_due
    ON delivery_schema.delivery_borzo_pidge_handoff (next_attempt_at, due_at)
    WHERE state IN ('WAITING', 'PROCESSING_BORZO', 'BORZO_CANCELLED',
                    'PROCESSING_PIDGE', 'PIDGE_RECONCILIATION_PENDING');
