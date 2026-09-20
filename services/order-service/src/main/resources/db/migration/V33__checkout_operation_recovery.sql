CREATE TABLE order_schema.checkout_operation (
    customer_identity_id UUID NOT NULL,
    operation_id UUID NOT NULL,
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    checkout_id UUID REFERENCES order_schema.checkout(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (customer_identity_id, operation_id),
    CONSTRAINT checkout_operation_completion CHECK ((checkout_id IS NULL) = (completed_at IS NULL))
);
-- Receipt and checkout commit together. Recovery evidence is never deleted by a timer.
