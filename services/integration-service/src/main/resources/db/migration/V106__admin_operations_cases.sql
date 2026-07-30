CREATE TABLE payment_schema.operations_case (
    id UUID PRIMARY KEY,
    case_reference VARCHAR(80) NOT NULL UNIQUE,
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    subject_type VARCHAR(40) NOT NULL,
    subject_id UUID NOT NULL,
    order_id UUID,
    checkout_id UUID,
    payment_order_id UUID,
    refund_id UUID,
    delivery_job_id UUID,
    subscription_id UUID,
    customer_identity_id UUID,
    chef_identity_id UUID,
    summary VARCHAR(300) NOT NULL,
    description VARCHAR(4000) NOT NULL,
    assigned_admin_identity_id UUID,
    created_by_identity_id UUID NOT NULL,
    closed_by_identity_id UUID,
    closure_reason VARCHAR(1000),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT ck_operations_case_category CHECK (
        category IN ('ORDER', 'PAYMENT', 'REFUND', 'DELIVERY', 'SUBSCRIPTION', 'CUSTOMER', 'CHEF', 'NOTIFICATION', 'SECURITY', 'OTHER')
    ),
    CONSTRAINT ck_operations_case_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT ck_operations_case_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'RESOLVED', 'CLOSED')),
    CONSTRAINT ck_operations_case_subject CHECK (
        subject_type IN ('ORDER', 'CHECKOUT', 'PAYMENT_ORDER', 'REFUND', 'DELIVERY_JOB', 'SUBSCRIPTION', 'CUSTOMER', 'CHEF', 'NOTIFICATION', 'OTHER')
    )
);

CREATE INDEX ix_operations_case_status_priority
    ON payment_schema.operations_case (status, priority, updated_at DESC);

CREATE INDEX ix_operations_case_subject
    ON payment_schema.operations_case (subject_type, subject_id, created_at DESC);

CREATE INDEX ix_operations_case_customer
    ON payment_schema.operations_case (customer_identity_id, created_at DESC)
    WHERE customer_identity_id IS NOT NULL;

CREATE INDEX ix_operations_case_chef
    ON payment_schema.operations_case (chef_identity_id, created_at DESC)
    WHERE chef_identity_id IS NOT NULL;

CREATE TABLE payment_schema.operations_case_note (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES payment_schema.operations_case(id),
    note_type VARCHAR(30) NOT NULL,
    body VARCHAR(4000) NOT NULL,
    actor_identity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_operations_case_note_type CHECK (note_type IN ('INTERNAL', 'CUSTOMER_CONTACT', 'CHEF_CONTACT', 'PROVIDER_CONTACT', 'SYSTEM'))
);

CREATE INDEX ix_operations_case_note_case
    ON payment_schema.operations_case_note (case_id, created_at);

CREATE TABLE payment_schema.admin_operation_audit (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES payment_schema.operations_case(id),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id UUID,
    actor_identity_id UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    old_state JSONB,
    new_state JSONB,
    correlation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_admin_operation_audit_entity
    ON payment_schema.admin_operation_audit (entity_type, entity_id, created_at DESC);

CREATE INDEX ix_admin_operation_audit_actor
    ON payment_schema.admin_operation_audit (actor_identity_id, created_at DESC);

CREATE TABLE payment_schema.admin_retry_release (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES payment_schema.operations_case(id),
    domain VARCHAR(40) NOT NULL,
    record_id UUID NOT NULL,
    previous_status VARCHAR(40) NOT NULL,
    release_status VARCHAR(40) NOT NULL,
    actor_identity_id UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_admin_retry_release UNIQUE (case_id, domain, record_id, previous_status, created_at),
    CONSTRAINT ck_admin_retry_domain CHECK (
        domain IN ('PAYMENT_WEBHOOK', 'REFUND', 'REFUND_STATUS_OUTBOX', 'DELIVERY_WEBHOOK', 'DELIVERY_TRACKING', 'SUBSCRIPTION_PAYMENT_STATUS_OUTBOX')
    )
);
