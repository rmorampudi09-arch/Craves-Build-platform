-- CH-02: a chef notice outbox row that exhausts its attempts becomes DEAD (and alerts)
-- instead of sitting in FAILED forever. The new list is a superset, so existing rows stay valid.
SET LOCAL lock_timeout = '5s';

ALTER TABLE notification_outbox
    DROP CONSTRAINT IF EXISTS ck_notification_outbox_status;

ALTER TABLE notification_outbox
    ADD CONSTRAINT ck_notification_outbox_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD')) NOT VALID;

ALTER TABLE notification_outbox
    VALIDATE CONSTRAINT ck_notification_outbox_status;
