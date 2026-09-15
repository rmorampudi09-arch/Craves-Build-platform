-- One small transactional insert captures terminal jobs from webhooks, polling and creation,
-- including during rolling deployments. No provider calls or scoring run in this trigger.
SET LOCAL lock_timeout = '5s';
CREATE TABLE delivery_schema.delivery_outcome_feedback (
    delivery_job_id uuid PRIMARY KEY REFERENCES delivery_schema.delivery_job(id),
    status varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PROCESSING','RETRY','RECORDED','SKIPPED','DEAD_LETTER')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_token uuid,
    result_code varchar(80),
    scoring_version varchar(80),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX ix_delivery_feedback_due ON delivery_schema.delivery_outcome_feedback (available_at, delivery_job_id)
    WHERE status IN ('PENDING','RETRY','PROCESSING');
CREATE INDEX ix_delivery_feedback_dead ON delivery_schema.delivery_outcome_feedback (created_at)
    WHERE status = 'DEAD_LETTER';

CREATE FUNCTION delivery_schema.enqueue_delivery_outcome_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO delivery_schema.delivery_outcome_feedback(delivery_job_id)
        VALUES (NEW.id) ON CONFLICT (delivery_job_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE TRIGGER delivery_outcome_feedback_capture
AFTER INSERT OR UPDATE OF status ON delivery_schema.delivery_job
FOR EACH ROW WHEN (NEW.status IN ('DELIVERED','FAILED','RETURNED','CANCELLED'))
EXECUTE FUNCTION delivery_schema.enqueue_delivery_outcome_feedback();
