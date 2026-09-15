-- Scheduled-order backend foundation.
-- No lead time, horizon, payment timing, slot, cancellation or refund rule is seeded.
-- Scheduled checkout remains unavailable for a kitchen until an ADMIN explicitly configures a policy.

ALTER TABLE order_schema.checkout
    ADD COLUMN IF NOT EXISTS fulfilment_mode VARCHAR(16) NOT NULL DEFAULT 'ASAP',
    ADD COLUMN IF NOT EXISTS requested_fulfilment_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS requested_timezone VARCHAR(64),
    ADD COLUMN IF NOT EXISTS schedule_request_id UUID;

ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS fulfilment_mode VARCHAR(16) NOT NULL DEFAULT 'ASAP',
    ADD COLUMN IF NOT EXISTS requested_fulfilment_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS requested_timezone VARCHAR(64),
    ADD COLUMN IF NOT EXISTS schedule_request_id UUID;

ALTER TABLE order_schema.checkout
    DROP CONSTRAINT IF EXISTS chk_checkout_fulfilment_mode;
ALTER TABLE order_schema.checkout
    ADD CONSTRAINT chk_checkout_fulfilment_mode
    CHECK (fulfilment_mode IN ('ASAP', 'SCHEDULED'));

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS chk_customer_order_fulfilment_mode;
ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT chk_customer_order_fulfilment_mode
    CHECK (fulfilment_mode IN ('ASAP', 'SCHEDULED'));

CREATE TABLE order_schema.scheduled_order_policy (
    kitchen_id UUID PRIMARY KEY,
    active BOOLEAN NOT NULL DEFAULT false,
    min_lead_minutes INTEGER NOT NULL,
    max_horizon_minutes INTEGER NOT NULL,
    payment_gate VARCHAR(48) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by_identity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_scheduled_policy_lead CHECK (min_lead_minutes >= 0),
    CONSTRAINT chk_scheduled_policy_horizon CHECK (max_horizon_minutes > min_lead_minutes),
    CONSTRAINT chk_scheduled_policy_payment_gate CHECK (payment_gate IN (
        'PAYMENT_BEFORE_CHEF_CONFIRMATION',
        'PAYMENT_AFTER_ALL_CHEFS_CONFIRM'
    )),
    CONSTRAINT chk_scheduled_policy_version CHECK (version > 0)
);

CREATE TABLE order_schema.scheduled_order_policy_audit (
    id UUID PRIMARY KEY,
    kitchen_id UUID NOT NULL,
    old_policy JSONB,
    new_policy JSONB NOT NULL,
    actor_identity_id UUID NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_scheduled_policy_audit_reason
        CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500)
);

CREATE TABLE order_schema.scheduled_order_request (
    id UUID PRIMARY KEY,
    checkout_id UUID NOT NULL REFERENCES order_schema.checkout(id) ON DELETE RESTRICT,
    customer_identity_id UUID NOT NULL,
    requested_fulfilment_at TIMESTAMPTZ NOT NULL,
    requested_timezone VARCHAR(64) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_CHEF_CONFIRMATION',
    idempotency_key VARCHAR(128) NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT uk_scheduled_order_request_idempotency
        UNIQUE (customer_identity_id, idempotency_key),
    CONSTRAINT chk_scheduled_request_status CHECK (status IN (
        'PENDING_CHEF_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED'
    )),
    CONSTRAINT chk_scheduled_request_timezone
        CHECK (char_length(btrim(requested_timezone)) BETWEEN 1 AND 64),
    CONSTRAINT chk_scheduled_request_idempotency
        CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
    CONSTRAINT chk_scheduled_request_fingerprint
        CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_scheduled_request_version CHECK (version > 0)
);

CREATE UNIQUE INDEX uk_scheduled_order_request_active_checkout
    ON order_schema.scheduled_order_request (checkout_id)
    WHERE status IN ('PENDING_CHEF_CONFIRMATION', 'CONFIRMED');

CREATE TABLE order_schema.scheduled_order_kitchen_response (
    schedule_request_id UUID NOT NULL
        REFERENCES order_schema.scheduled_order_request(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES order_schema.customer_order(id) ON DELETE RESTRICT,
    kitchen_id UUID NOT NULL,
    chef_identity_id UUID NOT NULL,
    payment_gate VARCHAR(48) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    response_note VARCHAR(500),
    responded_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (schedule_request_id, order_id),
    CONSTRAINT chk_scheduled_response_payment_gate CHECK (payment_gate IN (
        'PAYMENT_BEFORE_CHEF_CONFIRMATION',
        'PAYMENT_AFTER_ALL_CHEFS_CONFIRM'
    )),
    CONSTRAINT chk_scheduled_response_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT chk_scheduled_response_note CHECK (response_note IS NULL OR char_length(response_note) <= 500),
    CONSTRAINT chk_scheduled_response_version CHECK (version > 0)
);

ALTER TABLE order_schema.checkout
    DROP CONSTRAINT IF EXISTS fk_checkout_schedule_request;
ALTER TABLE order_schema.checkout
    ADD CONSTRAINT fk_checkout_schedule_request
    FOREIGN KEY (schedule_request_id)
    REFERENCES order_schema.scheduled_order_request(id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT IF EXISTS fk_customer_order_schedule_request;
ALTER TABLE order_schema.customer_order
    ADD CONSTRAINT fk_customer_order_schedule_request
    FOREIGN KEY (schedule_request_id)
    REFERENCES order_schema.scheduled_order_request(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_scheduled_request_customer_cursor
    ON order_schema.scheduled_order_request (
        customer_identity_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX idx_scheduled_response_chef_queue
    ON order_schema.scheduled_order_kitchen_response (
        chef_identity_id,
        status,
        schedule_request_id,
        order_id
    );

CREATE INDEX idx_scheduled_request_time_cursor
    ON order_schema.scheduled_order_request (
        requested_fulfilment_at,
        id
    );

CREATE INDEX idx_scheduled_policy_active
    ON order_schema.scheduled_order_policy (active, kitchen_id);

CREATE INDEX idx_checkout_schedule_request
    ON order_schema.checkout (schedule_request_id)
    WHERE schedule_request_id IS NOT NULL;

CREATE INDEX idx_customer_order_schedule_request
    ON order_schema.customer_order (schedule_request_id)
    WHERE schedule_request_id IS NOT NULL;

COMMENT ON TABLE order_schema.scheduled_order_policy IS
    'Explicit ADMIN-configured schedule bounds and payment timing; no engineering defaults are seeded.';
COMMENT ON TABLE order_schema.scheduled_order_request IS
    'Customer-owned schedule request attached to an existing PAYMENT_PENDING checkout before payment creation.';
COMMENT ON TABLE order_schema.scheduled_order_kitchen_response IS
    'Per-suborder chef confirmation evidence; no rejection refund/cancellation consequence is applied by this module.';
