-- Handbook 008: staff suspend a kitchen. The hold keeps the status to restore; the audit keeps every decision.
CREATE TABLE catalog_schema.kitchen_suspension_hold (
    kitchen_id    UUID PRIMARY KEY REFERENCES catalog_schema.kitchen_profile(id),
    prior_status  VARCHAR(32) NOT NULL CHECK (prior_status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED')),
    reason        VARCHAR(280) NOT NULL,
    suspended_by  UUID NOT NULL,
    suspended_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_schema.kitchen_suspension_audit (
    id           BIGSERIAL PRIMARY KEY,
    kitchen_id   UUID NOT NULL,
    actor_id     UUID NOT NULL,
    action       VARCHAR(16) NOT NULL CHECK (action IN ('SUSPEND', 'REINSTATE')),
    reason       VARCHAR(280) NOT NULL,
    status_after VARCHAR(32) NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kitchen_suspension_audit_kitchen_time ON catalog_schema.kitchen_suspension_audit (kitchen_id, occurred_at DESC);
