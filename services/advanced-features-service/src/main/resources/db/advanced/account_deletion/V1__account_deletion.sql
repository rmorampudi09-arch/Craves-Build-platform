-- Account deletion requests: a signed-in person asks Craves to delete their account; staff work the queue.
-- Rows are the record that the person asked and what Craves did, so they are kept (also through the self-service erase).
CREATE TABLE adv_account_deletion.request (
    id                       uuid           PRIMARY KEY,
    person_id                uuid           NOT NULL,
    roles                    varchar(200)   NOT NULL,
    reason                   varchar(500),
    status                   varchar(12)    NOT NULL CHECK (status IN ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'WITHDRAWN')),
    staff_id                 uuid,
    message_to_person        varchar(1000),
    advanced_records_erased  integer        CHECK (advanced_records_erased IS NULL OR advanced_records_erased >= 0),
    version                  bigint         NOT NULL,
    created_at               timestamptz    NOT NULL,
    updated_at               timestamptz    NOT NULL,
    closed_at                timestamptz,
    CHECK ((status IN ('REQUESTED', 'IN_PROGRESS')) = (closed_at IS NULL))
);
-- One open request per person.
CREATE UNIQUE INDEX request_one_open_idx ON adv_account_deletion.request (person_id) WHERE status IN ('REQUESTED', 'IN_PROGRESS');
CREATE INDEX request_queue_idx ON adv_account_deletion.request (status, created_at, id);
CREATE INDEX request_person_idx ON adv_account_deletion.request (person_id, created_at);
