-- M25: operations' delivery exception cases and reassignment requests. Additive: new tables only, nothing existing changes.
CREATE TABLE delivery_schema.delivery_exception_case (
    id                      UUID PRIMARY KEY,
    delivery_job_id         UUID NOT NULL REFERENCES delivery_schema.delivery_job(id),
    order_id                UUID NOT NULL,
    reason                  VARCHAR(40) NOT NULL CHECK (reason IN ('PICKUP_DELAYED', 'RIDER_NOT_ASSIGNED', 'RIDER_UNREACHABLE',
                                'CUSTOMER_UNREACHABLE', 'ADDRESS_ISSUE', 'FOOD_DAMAGED', 'PROVIDER_CANCELLED', 'OTHER')),
    status                  VARCHAR(30) NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'REASSIGNMENT_REQUESTED', 'RESOLVED', 'DISMISSED')),
    assignee_id             UUID,
    reassign_to_provider_id VARCHAR(80) REFERENCES delivery_schema.delivery_provider(provider_id),
    resolution_note         VARCHAR(1000),
    opened_by               UUID NOT NULL,
    version                 INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at               TIMESTAMPTZ,
    CHECK ((status IN ('RESOLVED', 'DISMISSED')) = (closed_at IS NOT NULL)),
    CHECK (status <> 'REASSIGNMENT_REQUESTED' OR reassign_to_provider_id IS NOT NULL)
);
-- One active case per delivery job.
CREATE UNIQUE INDEX ux_delivery_exception_case_active_job
    ON delivery_schema.delivery_exception_case (delivery_job_id) WHERE status NOT IN ('RESOLVED', 'DISMISSED');
CREATE INDEX ix_delivery_exception_case_status ON delivery_schema.delivery_exception_case (status, updated_at DESC, id);
CREATE INDEX ix_delivery_exception_case_order ON delivery_schema.delivery_exception_case (order_id);

-- Append-only history of every action on a case.
CREATE TABLE delivery_schema.delivery_exception_event (
    id          BIGSERIAL PRIMARY KEY,
    case_id     UUID NOT NULL REFERENCES delivery_schema.delivery_exception_case(id),
    action      VARCHAR(30) NOT NULL,
    status      VARCHAR(30) NOT NULL,
    actor_id    UUID NOT NULL,
    note        VARCHAR(1000),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_delivery_exception_event_case ON delivery_schema.delivery_exception_event (case_id, id);
