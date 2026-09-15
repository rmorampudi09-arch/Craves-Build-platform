-- READ ONLY. Use the reviewed Integration database via PG environment/approved connection.
-- psql -X --set=ON_ERROR_STOP=1 --file=scripts/finance/verify-integration-source-accounting.sql
-- Counts and exceptions below are evidence to review, not an automatic payout authorization.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SELECT current_database() AS selected_database,current_user AS selected_role,current_setting('transaction_read_only') AS read_only;
DO $$ BEGIN
 IF to_regclass('payment_schema.finance_earning_projection') IS NULL OR to_regclass('payment_schema.finance_source_receipt') IS NULL THEN
  RAISE EXCEPTION 'Connected financial source migrations are not installed in this selected database';
 END IF;
END $$;

SELECT version,description,script,checksum,success FROM payment_schema.flyway_schema_history
WHERE version::text IN ('120','121','122','123','124','125','126','127','128','129','130') ORDER BY installed_rank;

-- Must return no rows: every financial journal has at least two lines and equal debits/credits.
SELECT t.id,count(l.id) AS lines,coalesce(sum(l.debit_amount),0) AS debit,coalesce(sum(l.credit_amount),0) AS credit
FROM payment_schema.ledger_transaction t LEFT JOIN payment_schema.ledger_line l ON l.transaction_id=t.id
GROUP BY t.id HAVING count(l.id)<2 OR coalesce(sum(l.debit_amount),0)<>coalesce(sum(l.credit_amount),0);

-- Must return no rows: source snapshot, projection, journal and binding refer to the same chef order.
SELECT e.chef_order_id,'EARNING_CONTEXT_MISMATCH' AS issue
FROM payment_schema.finance_earning_projection e
JOIN payment_schema.finance_issued_snapshot s ON s.id=e.snapshot_id
LEFT JOIN payment_schema.finance_order_binding b ON b.chef_order_id=e.chef_order_id
JOIN payment_schema.ledger_transaction t ON t.id=e.journal_id
WHERE s.chef_order_id<>e.chef_order_id OR s.chef_identity_id<>e.chef_identity_id OR s.checkout_id<>e.checkout_id
 OR b.earning_journal_id IS DISTINCT FROM e.journal_id OR t.chef_order_id IS DISTINCT FROM e.chef_order_id
 OR t.event_type<>'CHEF_ORDER_EARNING' OR e.payable<>e.gross-e.service_fee-e.fee_gst-e.withholding;

-- Must return no rows: positive earnings have precisely their matching eligibility record.
SELECT e.chef_order_id,'PAYABLE_PROJECTION_MISMATCH' AS issue
FROM payment_schema.finance_earning_projection e
LEFT JOIN payment_schema.finance_payable p ON p.chef_order_id=e.chef_order_id
WHERE (e.payable>0 AND (p.id IS NULL OR p.amount<>e.payable OR p.journal_id<>e.journal_id OR p.chef_identity_id<>e.chef_identity_id))
 OR (e.payable=0 AND p.id IS NOT NULL);

-- Must return no rows: the supported 9(5) restaurant source never deducts customer food GST or GST TCS again.
SELECT s.chef_order_id,'UNEXPECTED_CHEF_FOOD_GST_OR_GST_TCS_DEDUCTION' AS issue
FROM payment_schema.finance_issued_snapshot s
WHERE s.payload->>'foodGstLiableParty'='CRAVES_ECO_SECTION_9_5'
 AND (s.payload->>'chefFoodGstDeduction' IS DISTINCT FROM '0.00' OR s.payload->>'gstTcsDeduction' IS DISTINCT FROM '0.00');

-- Must return no rows: each normal earning journal establishes the projected chef liability.
SELECT e.chef_order_id,e.payable,coalesce(sum(l.credit_amount-l.debit_amount),0) AS journal_payable
FROM payment_schema.finance_earning_projection e LEFT JOIN payment_schema.ledger_line l
 ON l.transaction_id=e.journal_id AND l.account_code='CHEF_PAYABLE' AND l.chef_identity_id=e.chef_identity_id
GROUP BY e.chef_order_id,e.payable HAVING e.payable<>coalesce(sum(l.credit_amount-l.debit_amount),0);

-- Reconciliation exposures must be investigated; WAITING is not a failed payment or permission to reissue one.
SELECT state,coalesce(last_result,'UNPROCESSED') AS last_result,count(*) AS order_count,min(updated_at) AS oldest
FROM payment_schema.finance_order_binding GROUP BY state,last_result ORDER BY state,last_result;
SELECT status,count(*) AS instruction_count,min(created_at) AS oldest
FROM payment_schema.finance_payout_instruction GROUP BY status ORDER BY status;
SELECT reason,count(*) AS exception_count,min(created_at) AS oldest FROM payment_schema.finance_source_exception GROUP BY reason ORDER BY reason;

-- Require unchanged source/statement evidence and reviewed clearing/bank confirmation before payout activation.
SELECT count(*) AS capture_count FROM payment_schema.finance_capture;
SELECT count(*) AS posted_earning_count FROM payment_schema.finance_earning_projection;
SELECT count(*) AS receipt_count FROM payment_schema.finance_source_receipt;
ROLLBACK;
