-- CH-06 / F3-04: the delivery outbox claim now waits for a job's earlier unpublished events; this index keeps
-- that per-job lookup cheap. Partial, so it only covers the few rows that are not yet published.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_unpublished_by_job
    ON delivery_schema.delivery_outbox (aggregate_id, created_at, id)
    WHERE status IN ('PENDING', 'FAILED', 'PROCESSING');
