CREATE TABLE support_case (
    id                          UUID PRIMARY KEY,
    case_number                 VARCHAR(32) NOT NULL UNIQUE,
    requester_identity_id       UUID NOT NULL,
    requester_role              VARCHAR(32) NOT NULL,
    order_id                    UUID,
    subject                     VARCHAR(160) NOT NULL,
    status                      VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    assigned_to_identity_id     UUID,
    last_requester_message_at   TIMESTAMPTZ,
    last_support_message_at     TIMESTAMPTZ,
    resolved_at                 TIMESTAMPTZ,
    closed_at                   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_support_case_requester_role CHECK (requester_role IN ('CUSTOMER', 'CHEF')),
    CONSTRAINT chk_support_case_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX idx_support_case_requester_updated
    ON support_case (requester_identity_id, updated_at DESC, id DESC);
CREATE INDEX idx_support_case_status_updated
    ON support_case (status, updated_at DESC, id DESC);
CREATE INDEX idx_support_case_assignee_updated
    ON support_case (assigned_to_identity_id, updated_at DESC, id DESC)
    WHERE assigned_to_identity_id IS NOT NULL;
CREATE INDEX idx_support_case_order
    ON support_case (order_id)
    WHERE order_id IS NOT NULL;

CREATE TABLE support_case_message (
    id                  UUID PRIMARY KEY,
    case_id             UUID NOT NULL REFERENCES support_case(id) ON DELETE CASCADE,
    sender_identity_id  UUID NOT NULL,
    sender_role         VARCHAR(32) NOT NULL,
    body                TEXT NOT NULL,
    internal_note       BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_support_case_message_role CHECK (
        sender_role IN ('CUSTOMER', 'CHEF', 'SUPPORT_ADMIN', 'PLATFORM_ADMIN')
    ),
    CONSTRAINT chk_support_case_message_body CHECK (char_length(body) BETWEEN 1 AND 5000)
);

CREATE INDEX idx_support_case_message_case_created
    ON support_case_message (case_id, created_at ASC, id ASC);

CREATE TABLE support_case_status_history (
    id                  UUID PRIMARY KEY,
    case_id             UUID NOT NULL REFERENCES support_case(id) ON DELETE CASCADE,
    old_status          VARCHAR(32),
    new_status          VARCHAR(32) NOT NULL,
    actor_identity_id   UUID NOT NULL,
    actor_role          VARCHAR(32) NOT NULL,
    note                VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_support_case_history_status CHECK (
        new_status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED')
    )
);

CREATE INDEX idx_support_case_status_history_case_created
    ON support_case_status_history (case_id, created_at ASC, id ASC);

CREATE TABLE support_case_assignment_history (
    id                          UUID PRIMARY KEY,
    case_id                     UUID NOT NULL REFERENCES support_case(id) ON DELETE CASCADE,
    old_assignee_identity_id    UUID,
    new_assignee_identity_id    UUID,
    actor_identity_id           UUID NOT NULL,
    actor_role                  VARCHAR(32) NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_case_assignment_history_case_created
    ON support_case_assignment_history (case_id, created_at ASC, id ASC);

COMMENT ON COLUMN support_case.order_id IS
    'Optional Order Service identifier. Stored as a reference only; no cross-service foreign key is created.';
COMMENT ON COLUMN support_case_message.internal_note IS
    'When true, visible only to authorized internal support/platform administrators.';
