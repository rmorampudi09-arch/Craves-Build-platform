-- Additive guards. No provider calls, automatic activation, historical earning import or money movement.
ALTER TABLE payment_schema.finance_policy_head ADD COLUMN locked_start_date DATE;
UPDATE payment_schema.finance_policy_head SET locked_start_date=(
 SELECT (v.payload->>'ledgerStartDate')::date FROM payment_schema.finance_policy_activation a
 JOIN payment_schema.finance_policy_version v ON v.id=a.policy_id
 WHERE (v.payload->>'ledgerEnabled')::boolean IS TRUE ORDER BY a.revision LIMIT 1
);
CREATE FUNCTION payment_schema.guard_finance_cutover_date() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings JSONB; requested DATE;
BEGIN
 SELECT payload INTO STRICT settings FROM payment_schema.finance_policy_version WHERE id=NEW.policy_id;
 requested := (settings->>'ledgerStartDate')::date;
 IF OLD.locked_start_date IS NOT NULL THEN
   IF requested IS DISTINCT FROM OLD.locked_start_date THEN
     RAISE EXCEPTION 'The first activated ledger start date cannot be changed, even while disabled' USING ERRCODE='23514';
   END IF;
   NEW.locked_start_date := OLD.locked_start_date;
 ELSIF (settings->>'ledgerEnabled')::boolean IS TRUE THEN
   NEW.locked_start_date := requested;
 ELSE NEW.locked_start_date := NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_cutover_date_guard BEFORE UPDATE ON payment_schema.finance_policy_head
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_finance_cutover_date();

CREATE FUNCTION payment_schema.guard_finance_payable_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recognized NUMERIC;
BEGIN
 SELECT sum(l.credit_amount-l.debit_amount) INTO recognized
 FROM payment_schema.ledger_transaction t JOIN payment_schema.ledger_line l ON l.transaction_id=t.id
 WHERE t.id=NEW.journal_id AND t.chef_order_id=NEW.chef_order_id AND t.event_type='CHEF_ORDER_EARNING'
   AND t.currency='INR' AND l.account_code='CHEF_PAYABLE' AND l.chef_identity_id=NEW.chef_identity_id;
 IF recognized IS DISTINCT FROM NEW.amount OR (NEW.policy_snapshot->>'ledgerEnabled')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Payable must match its immutable enabled earning journal and chef ownership' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_payable_journal_guard BEFORE INSERT ON payment_schema.finance_payable
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_finance_payable_journal();

CREATE FUNCTION payment_schema.guard_finance_payout_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE beneficiary_chef UUID; proven NUMERIC; clearing NUMERIC; line_count BIGINT; original UUID;
BEGIN
 SELECT chef_identity_id INTO STRICT beneficiary_chef FROM payment_schema.finance_beneficiary_version WHERE id=NEW.beneficiary_id;
 IF beneficiary_chef<>NEW.chef_identity_id THEN
   RAISE EXCEPTION 'Payout beneficiary must belong to the instruction chef' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'RESERVED' OR NEW.provider_id IS NOT NULL OR NEW.settlement_journal_id IS NOT NULL OR NEW.reversal_journal_id IS NOT NULL THEN
     RAISE EXCEPTION 'Payout must start with an unsubmitted reservation' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='RESERVED' AND NEW.status IN ('SUBMITTING','PROCESSING'))
   OR (OLD.status IN ('SUBMITTING','PROCESSING','UNKNOWN') AND NEW.status IN ('PROCESSING','UNKNOWN','PAID','FAILED','REVERSED','REVIEW_REQUIRED'))
   OR (OLD.status='REVIEW_REQUIRED' AND NEW.status='PROCESSING')
   OR (OLD.status='PAID' AND NEW.status='REVERSED')
 ) THEN RAISE EXCEPTION 'Unsupported payout state transition' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('PROCESSING','UNKNOWN','PAID','FAILED','REVERSED') AND NEW.provider_id IS NULL THEN
   RAISE EXCEPTION 'Provider identity is required for a known external payout' USING ERRCODE='23514';
 END IF;
 IF OLD.settlement_journal_id IS NOT NULL AND NEW.settlement_journal_id IS DISTINCT FROM OLD.settlement_journal_id THEN
   RAISE EXCEPTION 'Confirmed settlement journal cannot be replaced' USING ERRCODE='55000';
 END IF;
 IF OLD.reversal_journal_id IS NOT NULL AND NEW.reversal_journal_id IS DISTINCT FROM OLD.reversal_journal_id THEN
   RAISE EXCEPTION 'Confirmed reversal journal cannot be replaced' USING ERRCODE='55000';
 END IF;
 IF NEW.status='PAID' THEN
   IF NEW.provider_status IS DISTINCT FROM 'processed' OR NEW.settlement_journal_id IS NULL THEN
     RAISE EXCEPTION 'PAID requires verified provider success and a settlement journal' USING ERRCODE='23514';
   END IF;
   SELECT count(*),coalesce(sum(CASE WHEN l.account_code='CHEF_PAYABLE' THEN l.debit_amount-l.credit_amount ELSE 0 END),0),
     coalesce(sum(CASE WHEN l.account_code='PAYOUT_CLEARING' THEN l.credit_amount-l.debit_amount ELSE 0 END),0)
   INTO line_count,proven,clearing FROM payment_schema.ledger_transaction t JOIN payment_schema.ledger_line l ON l.transaction_id=t.id
   WHERE t.id=NEW.settlement_journal_id AND t.event_type='CHEF_PAYOUT_CONFIRMED' AND t.currency='INR'
     AND l.chef_identity_id=NEW.chef_identity_id AND l.payout_instruction_id=NEW.id;
   IF line_count<>2 OR proven<>NEW.amount OR clearing<>NEW.amount THEN
     RAISE EXCEPTION 'Settlement journal must clear exactly this instruction amount and chef' USING ERRCODE='23514';
   END IF;
 END IF;
 IF NEW.status='FAILED' AND NEW.provider_status NOT IN ('failed','cancelled','rejected') THEN
   RAISE EXCEPTION 'Failure requires a definitive provider outcome' USING ERRCODE='23514';
 END IF;
 IF NEW.status='REVERSED' THEN
   IF NEW.provider_status IS DISTINCT FROM 'reversed' THEN
     RAISE EXCEPTION 'Reversal requires verified provider reversal' USING ERRCODE='23514';
   END IF;
   IF NEW.settlement_journal_id IS NOT NULL THEN
     SELECT reversal_of INTO original FROM payment_schema.ledger_transaction WHERE id=NEW.reversal_journal_id;
     IF original IS DISTINCT FROM NEW.settlement_journal_id THEN
       RAISE EXCEPTION 'Previously paid transfer needs a linked balancing reversal before releasing its reservation' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_payout_state_guard BEFORE INSERT OR UPDATE ON payment_schema.finance_payout_instruction
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_finance_payout_state();
