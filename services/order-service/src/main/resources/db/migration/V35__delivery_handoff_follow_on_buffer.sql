ALTER TABLE order_schema.delivery_status_inbox
    DROP CONSTRAINT chk_delivery_status_inbox_processing;

ALTER TABLE order_schema.delivery_status_inbox
    ADD CONSTRAINT chk_delivery_status_inbox_processing CHECK (
        processing_status IN (
            'RECEIVED',
            'PROCESSED',
            'STALE',
            'TERMINAL_PROTECTED',
            'NO_CHANGE',
            'WAITING_FOR_PRIOR_PROVIDER',
            'WAITING_FOR_HANDOFF',
            'REJECTED'
        )
    );

CREATE INDEX IF NOT EXISTS ix_delivery_status_inbox_waiting_pidge
    ON order_schema.delivery_status_inbox (chef_sub_order_id, delivery_job_id, observed_at)
    WHERE processing_status = 'WAITING_FOR_HANDOFF';
