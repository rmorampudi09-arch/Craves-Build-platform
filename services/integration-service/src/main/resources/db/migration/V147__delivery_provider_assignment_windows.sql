ALTER TABLE delivery_schema.delivery_command
    ADD COLUMN IF NOT EXISTS active_provider_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS active_provider_delivery_id VARCHAR(200),
    ADD COLUMN IF NOT EXISTS active_provider_deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempted_provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE delivery_schema.delivery_command
    DROP CONSTRAINT IF EXISTS ck_delivery_command_attempted_provider_ids;

ALTER TABLE delivery_schema.delivery_command
    ADD CONSTRAINT ck_delivery_command_attempted_provider_ids
    CHECK (jsonb_typeof(attempted_provider_ids) = 'array');

ALTER TABLE delivery_schema.delivery_command
    DROP CONSTRAINT IF EXISTS ck_delivery_command_active_provider_identity;

ALTER TABLE delivery_schema.delivery_command
    ADD CONSTRAINT ck_delivery_command_active_provider_identity CHECK (
        (active_provider_id IS NULL AND active_provider_delivery_id IS NULL AND active_provider_deadline_at IS NULL)
        OR (active_provider_id IS NOT NULL AND active_provider_delivery_id IS NOT NULL AND active_provider_deadline_at IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS ix_delivery_command_active_provider_due
    ON delivery_schema.delivery_command(status, active_provider_deadline_at)
    WHERE status = 'WAITING_FOR_PROVIDER' AND active_provider_id IS NOT NULL;
