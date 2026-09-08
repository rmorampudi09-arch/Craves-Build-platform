-- Read-only operational dashboard support. These indexes keep bounded admin analytics off table scans
-- without introducing a separate analytics store or changing delivery business behaviour.
CREATE INDEX IF NOT EXISTS ix_delivery_assignment_created_at
    ON delivery_schema.delivery_assignment (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_delivery_job_created_status
    ON delivery_schema.delivery_job (created_at DESC, status);

CREATE INDEX IF NOT EXISTS ix_delivery_job_delivered_at
    ON delivery_schema.delivery_job (delivered_at DESC)
    WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_delivery_command_created_status
    ON delivery_schema.delivery_command (created_at DESC, status);

CREATE INDEX IF NOT EXISTS ix_delivery_webhook_received_status
    ON delivery_schema.delivery_webhook_inbox (received_at DESC, processing_status);

CREATE INDEX IF NOT EXISTS ix_delivery_event_occurred_at
    ON delivery_schema.delivery_event (occurred_at DESC);
