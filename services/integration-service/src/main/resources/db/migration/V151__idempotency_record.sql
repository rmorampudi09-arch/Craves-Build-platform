-- CH-07: stored responses for the Idempotency-Key filter. Only requests that send the header use it;
-- rows expire after 72 hours. owner_token marks which attempt holds an IN_PROGRESS claim.
CREATE TABLE IF NOT EXISTS payment_schema.idempotency_record (
    actor_hash    CHAR(64)     NOT NULL,
    idem_key      VARCHAR(128) NOT NULL,
    request_hash  CHAR(64)     NOT NULL,
    state         VARCHAR(16)  NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
    owner_token   UUID         NOT NULL,
    http_status   SMALLINT,
    content_type  VARCHAR(160),
    response_location TEXT,
    response_body BYTEA,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    PRIMARY KEY (actor_hash, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_record_created_at
    ON payment_schema.idempotency_record (created_at);
