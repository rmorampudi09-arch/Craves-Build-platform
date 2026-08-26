CREATE TABLE order_schema.order_review (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES order_schema.customer_order(id) ON DELETE CASCADE,
    customer_identity_id UUID NOT NULL,
    kitchen_id UUID NOT NULL,
    rating INTEGER NOT NULL,
    review_title VARCHAR(120),
    review_body VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT order_review_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_order_review_customer_created_at
    ON order_schema.order_review (customer_identity_id, created_at DESC);

CREATE INDEX idx_order_review_kitchen_created_at
    ON order_schema.order_review (kitchen_id, created_at DESC);

CREATE TABLE order_schema.order_review_outbox (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload_json JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT order_review_outbox_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'))
);

CREATE INDEX idx_order_review_outbox_status_available_at
    ON order_schema.order_review_outbox (status, available_at, created_at);
