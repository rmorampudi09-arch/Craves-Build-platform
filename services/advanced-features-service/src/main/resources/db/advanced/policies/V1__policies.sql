-- Handbook 015/062/072/088: staff-set policies (serviceability, cancellation and refund, delivery provider ranking, notification frequency).
-- Nothing is seeded: every value is a business decision. Versions are kept forever; exactly one may be ACTIVE per type.
CREATE TABLE adv_policies.policy_version (
    id            uuid          PRIMARY KEY,
    policy_type   varchar(32)   NOT NULL CHECK (policy_type IN ('SERVICEABILITY', 'CANCELLATION', 'PROVIDER_RANKING', 'NOTIFICATION_FREQUENCY')),
    version       integer       NOT NULL CHECK (version > 0),
    document      jsonb         NOT NULL,
    note          varchar(500),
    status        varchar(8)    NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    created_by    uuid          NOT NULL,
    created_at    timestamptz   NOT NULL,
    activated_by  uuid,
    activated_at  timestamptz,
    UNIQUE (policy_type, version)
);
CREATE UNIQUE INDEX policy_one_active_idx ON adv_policies.policy_version (policy_type) WHERE status = 'ACTIVE';
