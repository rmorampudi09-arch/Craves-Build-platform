CREATE TABLE payment_schema.cashfree_webhook_delivery (
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(160) NOT NULL UNIQUE,
    webhook_version VARCHAR(40) NOT NULL,
    webhook_timestamp BIGINT NOT NULL,
    processing_status VARCHAR(20) NOT NULL,
    lock_token UUID,
    processing_started_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_error VARCHAR(1000),
    CONSTRAINT chk_cashfree_webhook_delivery_status CHECK (
        processing_status IN ('PROCESSING', 'COMPLETED', 'FAILED')
    )
);

CREATE INDEX ix_cashfree_webhook_delivery_status_seen
    ON payment_schema.cashfree_webhook_delivery (processing_status, last_seen_at);
