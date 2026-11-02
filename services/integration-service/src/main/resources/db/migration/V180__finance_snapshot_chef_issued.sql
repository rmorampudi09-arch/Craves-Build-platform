-- R16 item 10: a kitchen's orders of the last 21 days, by chef (DeliveryCommandRepository.kitchenReadyLateness). On its
-- own: while it builds, checkout's inserts into this table wait, and no other table is locked. A plain build: an online
-- one can keep the new revision from starting (V117).
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS ix_finance_snapshot_chef_issued ON payment_schema.finance_issued_snapshot (chef_identity_id, issued_at);
