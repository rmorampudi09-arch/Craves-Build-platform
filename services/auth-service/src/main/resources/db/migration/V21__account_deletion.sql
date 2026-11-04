-- Account deletion coordinator: one request per erase ask, one step row per service call.
CREATE TABLE account_deletion_request (
    id                   UUID PRIMARY KEY,
    identity_id          UUID NOT NULL REFERENCES auth_identity(id),
    scope                VARCHAR(16) NOT NULL CHECK (scope IN ('CUSTOMER', 'CHEF', 'ALL')),
    status               VARCHAR(32) NOT NULL CHECK (status IN (
                             'PENDING_REVIEW', 'SCHEDULED', 'WAITING_ON_OPEN_ITEMS', 'ERASING',
                             'COMPLETED', 'CANCELLED', 'REJECTED')),
    requested_via        VARCHAR(8) NOT NULL CHECK (requested_via IN ('APP', 'WEB')),
    requested_at         TIMESTAMPTZ NOT NULL,
    due_at               TIMESTAMPTZ,  -- NULL while PENDING_REVIEW: the 30 days start at approval
    reviewed_by          UUID,
    reviewed_at          TIMESTAMPTZ,
    review_note          VARCHAR(500),
    blockers_json        TEXT,
    next_check_at        TIMESTAMPTZ,
    locked_at            TIMESTAMPTZ,
    reminder_sent_at     TIMESTAMPTZ,
    final_notice_sent_at TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    lease_until          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open request per identity: the race between two concurrent "delete my account" taps ends here.
CREATE UNIQUE INDEX uq_account_deletion_request_open
    ON account_deletion_request (identity_id)
    WHERE status IN ('PENDING_REVIEW', 'SCHEDULED', 'WAITING_ON_OPEN_ITEMS', 'ERASING');
CREATE INDEX idx_account_deletion_request_status_due ON account_deletion_request (status, due_at);
CREATE INDEX idx_account_deletion_request_status_check ON account_deletion_request (status, next_check_at);

CREATE TABLE account_deletion_step (
    request_id      UUID NOT NULL REFERENCES account_deletion_request(id),
    phase           VARCHAR(16) NOT NULL CHECK (phase IN ('PREPARE', 'ERASE', 'RELEASE', 'SWEEP')),
    service         VARCHAR(32) NOT NULL CHECK (service IN (
                        'subscription', 'order', 'integration', 'referral', 'advanced',
                        'catalog', 'user-chef', 'notification', 'auth')),
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'BLOCKED')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      VARCHAR(300),
    erased_count    INTEGER,
    next_attempt_at TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, phase, service)
);

CREATE INDEX idx_account_deletion_step_status_next ON account_deletion_step (status, next_attempt_at);
