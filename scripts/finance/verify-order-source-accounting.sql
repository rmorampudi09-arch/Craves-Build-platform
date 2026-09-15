-- READ ONLY. Use the reviewed Order database, never assume it is the Integration database.
-- psql -X --set=ON_ERROR_STOP=1 --set=ledger_start_utc='2026-09-13T18:30:00Z' \
--   --file=scripts/finance/verify-order-source-accounting.sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SELECT current_database() AS selected_database,current_user AS selected_role,current_setting('transaction_read_only') AS read_only;
DO $$ BEGIN
 IF to_regclass('order_schema.order_financial_snapshot') IS NULL OR to_regclass('order_schema.finance_source_outbox') IS NULL THEN
  RAISE EXCEPTION 'Connected Order source migrations are not installed in this selected database';
 END IF;
END $$;
SELECT version,description,script,checksum,success FROM order_schema.flyway_schema_history
WHERE version::text IN ('16','23','24','25') ORDER BY installed_rank;

-- Must return no rows: accepted order identity and money still agree with the binding snapshot.
SELECT o.id,'BINDING_MISMATCH' AS issue FROM order_schema.customer_order o
JOIN order_schema.order_financial_snapshot s ON s.chef_order_id=o.id
WHERE o.chef_identity_id IS DISTINCT FROM (s.payload->>'chefIdentityId')::uuid
 OR o.checkout_id IS DISTINCT FROM (s.payload->>'checkoutId')::uuid
 OR o.customer_identity_id IS DISTINCT FROM (s.payload->>'customerIdentityId')::uuid
 OR o.grand_total IS DISTINCT FROM (s.payload->>'customerTotal')::numeric
 OR o.tax_amount IS DISTINCT FROM (s.payload->>'customerTax')::numeric
 OR s.snapshot_hash IS DISTINCT FROM s.payload->>'hash';

-- Must return no rows: binding and successful authoritative delivery have durable event evidence.
SELECT o.id,'MISSING_SOURCE_EVENT' AS issue FROM order_schema.customer_order o
JOIN order_schema.order_financial_snapshot s ON s.chef_order_id=o.id
WHERE NOT EXISTS(SELECT 1 FROM order_schema.finance_source_outbox x WHERE x.chef_order_id=o.id AND x.kind='BOUND')
 OR (o.status='DELIVERED' AND NOT EXISTS(SELECT 1 FROM order_schema.finance_source_outbox x WHERE x.chef_order_id=o.id AND x.kind='DELIVERED'));

SELECT kind,status,coalesce(last_result,'UNPROCESSED') AS last_result,count(*) AS event_count,min(created_at) AS oldest
FROM order_schema.finance_source_outbox GROUP BY kind,status,last_result ORDER BY kind,status;

-- These are explicit cutover exclusions, NOT candidates for a guessed latest-policy backfill.
SELECT o.order_source,o.status,count(*) AS orders_without_binding_after_requested_start
FROM order_schema.customer_order o
WHERE o.created_at>=:'ledger_start_utc'::timestamptz
 AND NOT EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot s WHERE s.chef_order_id=o.id)
GROUP BY o.order_source,o.status ORDER BY o.order_source,o.status;
ROLLBACK;
