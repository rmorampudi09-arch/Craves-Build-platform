-- READ-ONLY release preflight. Run against an explicitly selected approved database.
-- psql -X --set=ON_ERROR_STOP=1 --file=scripts/finance/chef-ledger-preflight.sql
-- This script makes no financial changes, does not release payouts and does not repair history.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';

SELECT current_database() AS selected_database,current_user AS selected_role,
       current_setting('server_version') AS postgres_version,current_setting('transaction_read_only') AS read_only;

DO $$ BEGIN
    IF to_regclass('payment_schema.chef_earning_entry') IS NULL
       OR to_regclass('payment_schema.chef_settlement_batch') IS NULL
       OR to_regclass('payment_schema.chef_settlement_item') IS NULL
       OR to_regclass('payment_schema.flyway_schema_history') IS NULL THEN
        RAISE EXCEPTION 'Required financial baseline or its configured Flyway history was not found; stop and verify the database';
    END IF;
END $$;

-- Verify the pinned legacy foundation and detect any previously applied local V121.
SELECT installed_rank,version,description,script,checksum,success
FROM payment_schema.flyway_schema_history WHERE version IN ('105','120','121','122','123')
ORDER BY installed_rank;

-- Open multi-beneficiary legacy batches must be reviewed. Never mark a submitted batch
-- failed merely to pass preflight: its actual transfer outcome must be reconciled.
SELECT batch.id,batch.status,count(DISTINCT item.chef_identity_id) AS beneficiary_count
FROM payment_schema.chef_settlement_batch batch
JOIN payment_schema.chef_settlement_item item ON item.batch_id=batch.id
WHERE batch.status IN ('DRAFT','SUBMITTED')
GROUP BY batch.id,batch.status HAVING count(DISTINCT item.chef_identity_id)>1;

-- Each active batch must match its frozen membership and original payable values.
SELECT batch.id,batch.status,batch.entry_count,count(item.earning_entry_id) AS actual_items,
       batch.total_amount,coalesce(sum(item.amount),0) AS item_total
FROM payment_schema.chef_settlement_batch batch
LEFT JOIN payment_schema.chef_settlement_item item ON item.batch_id=batch.id
GROUP BY batch.id,batch.status,batch.entry_count,batch.total_amount
HAVING batch.entry_count<>count(item.earning_entry_id) OR batch.total_amount<>coalesce(sum(item.amount),0);

SELECT item.batch_id,item.earning_entry_id
FROM payment_schema.chef_settlement_item item
JOIN payment_schema.chef_settlement_batch batch ON batch.id=item.batch_id
JOIN payment_schema.chef_earning_entry earning ON earning.id=item.earning_entry_id
WHERE item.chef_identity_id<>earning.chef_identity_id OR item.amount<>earning.net_payable
   OR batch.currency<>earning.currency
   OR (batch.status IN ('DRAFT','SUBMITTED') AND earning.status<>'SETTLEMENT_PENDING')
   OR (batch.status='SETTLED' AND earning.status<>'SETTLED');

SELECT earning.id,earning.status
FROM payment_schema.chef_earning_entry earning
WHERE earning.status='SETTLEMENT_PENDING' AND NOT EXISTS (
    SELECT 1 FROM payment_schema.chef_settlement_item item
    JOIN payment_schema.chef_settlement_batch batch ON batch.id=item.batch_id
    WHERE item.earning_entry_id=earning.id AND batch.status IN ('DRAFT','SUBMITTED')
);

SELECT item.earning_entry_id,count(*) AS active_memberships
FROM payment_schema.chef_settlement_item item
JOIN payment_schema.chef_settlement_batch batch ON batch.id=item.batch_id
WHERE batch.status IN ('DRAFT','SUBMITTED') GROUP BY item.earning_entry_id HAVING count(*)>1;

-- A diagnostic only: role ownership and actual grants still require deployment review.
SELECT table_name,privilege_type,grantee FROM information_schema.role_table_grants
WHERE table_schema='payment_schema' AND table_name IN
 ('ledger_transaction','ledger_line','ledger_account','ledger_event_inbox','ledger_outbox','ledger_conflict')
ORDER BY table_name,grantee,privilege_type;

ROLLBACK;
