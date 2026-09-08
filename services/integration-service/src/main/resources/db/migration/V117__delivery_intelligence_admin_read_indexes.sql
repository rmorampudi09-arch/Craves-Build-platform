-- Read-path indexes for the read-only Delivery Intelligence admin dashboard.
-- CONCURRENTLY reduces blocking on the production delivery write path.
-- The adjacent Flyway script configuration disables the transaction for this migration.

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_command_created_at
    ON delivery_schema.delivery_command (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_command_updated_at
    ON delivery_schema.delivery_command (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_assignment_created_at
    ON delivery_schema.delivery_assignment (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_assignment_updated_at
    ON delivery_schema.delivery_assignment (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_job_created_at
    ON delivery_schema.delivery_job (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_job_provider_delivery_ref
    ON delivery_schema.delivery_job (provider_delivery_id)
    WHERE provider_delivery_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_event_occurred_at
    ON delivery_schema.delivery_event (occurred_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_event_provider_event_ref
    ON delivery_schema.delivery_event (provider_event_id)
    WHERE provider_event_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_webhook_received_at
    ON delivery_schema.delivery_webhook_inbox (received_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_webhook_provider_event_ref
    ON delivery_schema.delivery_webhook_inbox (provider_event_id)
    WHERE provider_event_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_webhook_provider_delivery_ref
    ON delivery_schema.delivery_webhook_inbox (provider_delivery_id)
    WHERE provider_delivery_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_delivery_webhook_provider_order_ref
    ON delivery_schema.delivery_webhook_inbox (provider_order_id)
    WHERE provider_order_id IS NOT NULL;
