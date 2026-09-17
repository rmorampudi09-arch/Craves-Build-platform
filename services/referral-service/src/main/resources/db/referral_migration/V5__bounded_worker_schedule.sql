CREATE TABLE referral_schema.worker_schedule (
 kind VARCHAR(12) NOT NULL CHECK(kind IN ('AWARD','CUSTOMER','CREDIT','PAYOUT')),
 aggregate_id UUID NOT NULL, next_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 last_code VARCHAR(80), PRIMARY KEY(kind,aggregate_id)
);
CREATE INDEX worker_schedule_due ON referral_schema.worker_schedule(kind,next_at,aggregate_id);
REVOKE ALL ON referral_schema.worker_schedule FROM PUBLIC;
