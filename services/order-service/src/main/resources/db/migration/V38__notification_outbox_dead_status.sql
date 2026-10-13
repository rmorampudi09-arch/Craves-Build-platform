-- CH-02: a notification outbox row that exhausts its attempts becomes DEAD (and alerts)
-- instead of sitting in FAILED forever. The new list is a superset, so existing rows stay valid.
SET LOCAL lock_timeout = '5s';

ALTER TABLE order_schema.notification_outbox
    DROP CONSTRAINT IF EXISTS chk_notification_outbox_status;

ALTER TABLE order_schema.notification_outbox
    ADD CONSTRAINT chk_notification_outbox_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD')) NOT VALID;

ALTER TABLE order_schema.notification_outbox
    VALIDATE CONSTRAINT chk_notification_outbox_status;
