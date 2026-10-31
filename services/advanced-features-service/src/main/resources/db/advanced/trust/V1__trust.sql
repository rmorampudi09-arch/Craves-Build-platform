-- E29 trust: reports for moderation, order disputes, and staff risk flags. Every outcome is a staff decision; the dispute window
-- is staff data with no default (nothing is seeded), and refunds decided here are paid by Order service (M24), never by this module.
-- reporter_id, customer_id and chef_id are the nil UUID after that person erased their data.
CREATE TABLE adv_trust.report (
    id             uuid          PRIMARY KEY,
    reporter_id    uuid          NOT NULL,
    target_type    varchar(7)    NOT NULL CHECK (target_type IN ('KITCHEN', 'DISH', 'REVIEW', 'PERSON')),
    target_id      uuid          NOT NULL,
    reason         varchar(12)   NOT NULL CHECK (reason IN ('FOOD_SAFETY', 'HYGIENE', 'WRONG_LABEL', 'MISLEADING', 'ABUSE', 'FRAUD', 'SPAM', 'OTHER')),
    details        varchar(1000) NOT NULL,
    order_id       uuid,
    status         varchar(9)    NOT NULL CHECK (status IN ('OPEN', 'UPHELD', 'DISMISSED')),
    decision_note  varchar(500),
    decided_by     uuid,
    decided_at     timestamptz,
    created_at     timestamptz   NOT NULL,
    updated_at     timestamptz   NOT NULL
);
-- One open report per person and target (reports of people who erased their data all carry the nil UUID, so they are left out).
CREATE UNIQUE INDEX report_open_once_idx ON adv_trust.report (reporter_id, target_type, target_id)
    WHERE status = 'OPEN' AND reporter_id <> '00000000-0000-0000-0000-000000000000';
CREATE INDEX report_queue_idx ON adv_trust.report (status, created_at);
CREATE INDEX report_target_idx ON adv_trust.report (target_type, target_id);
CREATE INDEX report_reporter_idx ON adv_trust.report (reporter_id, created_at DESC);

CREATE TABLE adv_trust.dispute_policy (
    version       bigint        PRIMARY KEY,
    window_hours  integer       NOT NULL CHECK (window_hours BETWEEN 1 AND 2160),
    created_by    uuid          NOT NULL,
    created_at    timestamptz   NOT NULL
);

-- description is NULL after the customer erased their data (disputes stay as order records, without the person).
-- refundable_paise: the most a decision may refund. Only a delivered order can get money back here; Order service already refunds
-- rejected and refunded orders in full, so their disputes are about the refund itself and refund nothing more.
CREATE TABLE adv_trust.dispute (
    id                 uuid           PRIMARY KEY,
    order_id           uuid           NOT NULL,
    customer_id        uuid           NOT NULL,
    kitchen_id         uuid           NOT NULL,
    category           varchar(13)    NOT NULL CHECK (category IN ('MISSING_ITEMS', 'WRONG_ITEMS', 'QUALITY', 'FOOD_SAFETY', 'NOT_DELIVERED',
                                                               'LATE', 'OVERCHARGED', 'REFUND_ISSUE', 'OTHER')),
    description        varchar(1000),
    claimed_paise      bigint         CHECK (claimed_paise >= 1),
    order_value_paise  bigint         NOT NULL CHECK (order_value_paise >= 0),
    refundable_paise   bigint         NOT NULL CHECK (refundable_paise >= 0),
    chef_statement     varchar(1000),
    chef_id            uuid,
    chef_responded_at  timestamptz,
    status             varchar(9)     NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'REJECTED', 'WITHDRAWN')),
    refund_paise       bigint         CHECK (refund_paise >= 1),
    decision_note      varchar(500),
    decided_by         uuid,
    decided_at         timestamptz,
    policy_version     bigint         NOT NULL REFERENCES adv_trust.dispute_policy (version),
    version            bigint         NOT NULL,
    created_at         timestamptz    NOT NULL,
    updated_at         timestamptz    NOT NULL,
    CHECK (refundable_paise <= order_value_paise),
    CHECK (claimed_paise IS NULL OR claimed_paise <= refundable_paise),
    CHECK (refund_paise IS NULL OR (status = 'RESOLVED' AND refund_paise <= refundable_paise))
);
-- One live dispute per order (a withdrawn one can be opened again).
CREATE UNIQUE INDEX dispute_order_once_idx ON adv_trust.dispute (order_id) WHERE status <> 'WITHDRAWN';
CREATE INDEX dispute_queue_idx ON adv_trust.dispute (status, created_at);
CREATE INDEX dispute_customer_idx ON adv_trust.dispute (customer_id, created_at DESC);
CREATE INDEX dispute_order_idx ON adv_trust.dispute (order_id);
CREATE INDEX dispute_kitchen_idx ON adv_trust.dispute (kitchen_id, created_at DESC);
CREATE INDEX dispute_chef_idx ON adv_trust.dispute (chef_id) WHERE chef_id IS NOT NULL;

CREATE TABLE adv_trust.risk_flag (
    id            uuid          PRIMARY KEY,
    subject_type  varchar(7)    NOT NULL CHECK (subject_type IN ('PERSON', 'KITCHEN')),
    subject_id    uuid          NOT NULL,
    severity      varchar(6)    NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
    reason        varchar(500)  NOT NULL,
    raised_by     uuid          NOT NULL,
    raised_at     timestamptz   NOT NULL,
    cleared_by    uuid,
    cleared_at    timestamptz,
    clear_note    varchar(500)
);
CREATE INDEX risk_flag_subject_idx ON adv_trust.risk_flag (subject_type, subject_id, raised_at DESC);
