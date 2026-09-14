-- Additive external manual settlement. No financial activation, transfer or bank-verification claim.
ALTER TABLE payment_schema.finance_payout_instruction
 ADD COLUMN payout_channel VARCHAR(24) NOT NULL DEFAULT 'RAZORPAYX',
 ADD COLUMN manual_version BIGINT NOT NULL DEFAULT 0 CHECK(manual_version>=0),
 ADD COLUMN manual_request_hash CHAR(64),
 ADD COLUMN manual_destination_reference VARCHAR(240),
 ADD COLUMN manual_authorized_at TIMESTAMPTZ,
 ADD COLUMN manual_paid_at TIMESTAMPTZ,
 ALTER COLUMN beneficiary_id DROP NOT NULL;
ALTER TABLE payment_schema.finance_payout_instruction DROP CONSTRAINT finance_payout_instruction_status_check;
ALTER TABLE payment_schema.finance_payout_instruction ADD CONSTRAINT finance_payout_instruction_status_check
 CHECK(status IN ('RESERVED','SUBMITTING','PROCESSING','UNKNOWN','PAID','FAILED','REVERSED','REVIEW_REQUIRED','CANCELLED'));
ALTER TABLE payment_schema.finance_payout_instruction ADD CONSTRAINT finance_payout_channel_check CHECK (
 (payout_channel='RAZORPAYX' AND beneficiary_id IS NOT NULL AND manual_request_hash IS NULL AND manual_version=0
  AND manual_destination_reference IS NULL AND manual_authorized_at IS NULL AND manual_paid_at IS NULL AND status<>'CANCELLED')
 OR (payout_channel='CRAVES_MANUAL' AND mode='MANUAL' AND beneficiary_id IS NULL AND provider_id IS NULL
  AND provider_status IS NULL AND manual_request_hash IS NOT NULL AND manual_request_hash~'^[0-9a-f]{64}$' AND lease_id IS NULL AND lease_until IS NULL)
);
ALTER TABLE payment_schema.finance_payout_instruction DROP CONSTRAINT finance_payout_evidence_consistency;
ALTER TABLE payment_schema.finance_payout_instruction ADD CONSTRAINT finance_payout_evidence_consistency CHECK (
 (status<>'FAILED' OR payout_channel='CRAVES_MANUAL' OR (provider_status IS NOT NULL AND provider_status IN ('failed','cancelled','rejected')))
 AND (settlement_journal_id IS NULL OR status IN ('PAID','REVERSED'))
 AND (reversal_journal_id IS NULL OR (status='REVERSED' AND settlement_journal_id IS NOT NULL))
);
ALTER TABLE payment_schema.finance_chef_payout_control ADD COLUMN hold_kind VARCHAR(24) NOT NULL DEFAULT 'OPERATIONAL'
 CHECK(hold_kind IN ('OPERATIONAL','BANK_REQUIREMENT'));
-- Recognize only the historic initial system hold, not an operator/source/refund hold.
UPDATE payment_schema.finance_chef_payout_control c SET hold_kind='BANK_REQUIREMENT'
 WHERE c.on_hold AND c.beneficiary_id IS NULL AND c.hold_reason='Beneficiary verification required'
 AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_audit a WHERE a.chef_identity_id=c.chef_identity_id AND a.action='HOLD');

CREATE TABLE payment_schema.finance_manual_settlement_action (
 id UUID PRIMARY KEY, instruction_id UUID NOT NULL REFERENCES payment_schema.finance_payout_instruction(id),
 action_key UUID NOT NULL, request_hash CHAR(64) NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),
 action VARCHAR(32) NOT NULL CHECK(action IN ('AUTHORIZE_TRANSFER','CONFIRM_PAID','MARK_UNKNOWN','CANCEL_RESERVATION','CONFIRM_NOT_SENT','CONFIRM_REVERSED')),
 from_status VARCHAR(24) NOT NULL, to_status VARCHAR(24) NOT NULL, result_version BIGINT NOT NULL CHECK(result_version>0),
 operator_id UUID NOT NULL, reason VARCHAR(1000) NOT NULL CHECK(length(trim(reason))>0),
 evidence_reference VARCHAR(240), destination_reference VARCHAR(240), bank_reference VARCHAR(160),
 amount NUMERIC, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(instruction_id,action_key), UNIQUE(instruction_id,result_version),
 CHECK(amount IS NULL OR (amount>0 AND amount=round(amount,2))),
 CHECK(action NOT IN ('CONFIRM_PAID','CONFIRM_REVERSED') OR (paid_at IS NOT NULL AND amount IS NOT NULL AND evidence_reference IS NOT NULL AND length(trim(evidence_reference))>0)),
 CHECK(action<>'AUTHORIZE_TRANSFER' OR (destination_reference IS NOT NULL AND length(trim(destination_reference))>0)),
 CHECK(action<>'CONFIRM_NOT_SENT' OR (evidence_reference IS NOT NULL AND length(trim(evidence_reference))>0))
);
CREATE TRIGGER finance_manual_action_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_manual_settlement_action
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.finance_manual_money_held(chef UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=chef)
 OR EXISTS(SELECT 1 FROM payment_schema.finance_chef_payout_control c WHERE c.chef_identity_id=chef AND c.on_hold
    AND NOT(c.hold_kind='BANK_REQUIREMENT' AND c.hold_reason='Beneficiary verification required' AND c.beneficiary_id IS NULL))
 OR EXISTS(SELECT 1 FROM payment_schema.finance_payable p LEFT JOIN payment_schema.finance_order_binding b ON b.chef_order_id=p.chef_order_id
    WHERE p.chef_identity_id=chef AND (b.chef_order_id IS NULL OR b.state<>'DELIVERED' OR b.earning_journal_id IS DISTINCT FROM p.journal_id))
 OR EXISTS(SELECT 1 FROM payment_schema.finance_payable p JOIN payment_schema.refund r ON r.chef_sub_order_id=p.chef_order_id
    WHERE p.chef_identity_id=chef AND r.status NOT IN ('FAILED','CANCELLED'));
$$;

CREATE FUNCTION payment_schema.validate_manual_instruction(n payment_schema.finance_payout_instruction,
 o payment_schema.finance_payout_instruction, operation TEXT) RETURNS payment_schema.finance_payout_instruction LANGUAGE plpgsql AS $$
DECLARE evidence payment_schema.finance_manual_settlement_action%ROWTYPE; proven NUMERIC; cash NUMERIC; line_count BIGINT; original UUID;
BEGIN
 IF operation='INSERT' THEN
  IF n.status<>'RESERVED' OR n.manual_version<>0 OR n.manual_authorized_at IS NOT NULL OR n.manual_paid_at IS NOT NULL
    OR n.settlement_journal_id IS NOT NULL OR n.reversal_journal_id IS NOT NULL OR n.transfer_reference IS NOT NULL
    OR n.manual_destination_reference IS NOT NULL OR payment_schema.finance_manual_money_held(n.chef_identity_id) THEN
   RAISE EXCEPTION 'Manual settlement must begin with an eligible unsent reservation' USING ERRCODE='23514'; END IF;
  RETURN n;
 END IF;
 IF ROW(n.payout_channel,n.manual_request_hash) IS DISTINCT FROM ROW(o.payout_channel,o.manual_request_hash)
  OR (o.manual_destination_reference IS NOT NULL AND n.manual_destination_reference IS DISTINCT FROM o.manual_destination_reference)
  OR (o.manual_authorized_at IS NOT NULL AND n.manual_authorized_at IS DISTINCT FROM o.manual_authorized_at)
  OR (o.manual_paid_at IS NOT NULL AND n.manual_paid_at IS DISTINCT FROM o.manual_paid_at)
  OR (o.transfer_reference IS NOT NULL AND n.transfer_reference IS DISTINCT FROM o.transfer_reference)
  OR (o.settlement_journal_id IS NOT NULL AND n.settlement_journal_id IS DISTINCT FROM o.settlement_journal_id)
  OR (o.reversal_journal_id IS NOT NULL AND n.reversal_journal_id IS DISTINCT FROM o.reversal_journal_id) THEN
  RAISE EXCEPTION 'Manual settlement evidence is immutable' USING ERRCODE='55000'; END IF;
 IF n.status=o.status THEN
  IF ROW(n.manual_version,n.manual_destination_reference,n.manual_authorized_at,n.manual_paid_at,n.transfer_reference,n.settlement_journal_id,n.reversal_journal_id)
   IS DISTINCT FROM ROW(o.manual_version,o.manual_destination_reference,o.manual_authorized_at,o.manual_paid_at,o.transfer_reference,o.settlement_journal_id,o.reversal_journal_id)
   THEN RAISE EXCEPTION 'Manual evidence requires a recorded transition' USING ERRCODE='23514'; END IF;
  RETURN n;
 END IF;
 SELECT * INTO STRICT evidence FROM payment_schema.finance_manual_settlement_action
  WHERE instruction_id=n.id AND result_version=n.manual_version AND from_status=o.status AND to_status=n.status;
 IF n.manual_version<>o.manual_version+1 OR NOT (
  (o.status='RESERVED' AND n.status='SUBMITTING' AND evidence.action='AUTHORIZE_TRANSFER') OR
  (o.status='RESERVED' AND n.status='CANCELLED' AND evidence.action='CANCEL_RESERVATION') OR
  (o.status='SUBMITTING' AND n.status='UNKNOWN' AND evidence.action='MARK_UNKNOWN') OR
  (o.status IN ('SUBMITTING','UNKNOWN','REVIEW_REQUIRED') AND n.status='PAID' AND evidence.action='CONFIRM_PAID') OR
  (o.status IN ('SUBMITTING','UNKNOWN','REVIEW_REQUIRED') AND n.status='FAILED' AND evidence.action='CONFIRM_NOT_SENT') OR
  (o.status='PAID' AND n.status='REVERSED' AND evidence.action='CONFIRM_REVERSED')) THEN
  RAISE EXCEPTION 'Unsupported manual settlement transition' USING ERRCODE='23514'; END IF;
 IF n.status='SUBMITTING' THEN
  IF payment_schema.finance_manual_money_held(n.chef_identity_id) OR n.manual_authorized_at IS NULL
   OR n.manual_destination_reference IS DISTINCT FROM evidence.destination_reference THEN
   RAISE EXCEPTION 'Held or unreviewed manual transfer cannot be authorized' USING ERRCODE='23514'; END IF;
 END IF;
 IF n.status='PAID' THEN
  IF n.manual_paid_at IS NULL OR n.manual_authorized_at IS NULL OR n.manual_paid_at<n.manual_authorized_at
   OR n.manual_paid_at>now()+interval '30 seconds' OR n.manual_paid_at IS DISTINCT FROM evidence.paid_at
   OR n.amount IS DISTINCT FROM evidence.amount OR n.transfer_reference IS DISTINCT FROM evidence.bank_reference
   OR n.settlement_journal_id IS NULL THEN RAISE EXCEPTION 'Exact bank payment evidence is required' USING ERRCODE='23514'; END IF;
  SELECT count(*),coalesce(sum(CASE WHEN l.account_code='CHEF_PAYABLE' THEN l.debit_amount-l.credit_amount ELSE 0 END),0),
   coalesce(sum(CASE WHEN l.account_code='BANK' THEN l.credit_amount-l.debit_amount ELSE 0 END),0)
   INTO line_count,proven,cash FROM payment_schema.ledger_transaction t JOIN payment_schema.ledger_line l ON l.transaction_id=t.id
   WHERE t.id=n.settlement_journal_id AND t.event_type='CHEF_MANUAL_PAYOUT_CONFIRMED' AND t.source='craves-manual'
    AND t.currency='INR' AND t.actor_type='HUMAN' AND t.actor_id=evidence.operator_id::text
    AND t.occurred_at=n.manual_paid_at AND l.chef_identity_id=n.chef_identity_id AND l.payout_instruction_id=n.id;
  IF line_count<>2 OR proven<>n.amount OR cash<>n.amount THEN RAISE EXCEPTION 'Manual bank journal mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF n.status='REVERSED' THEN
  SELECT reversal_of INTO original FROM payment_schema.ledger_transaction WHERE id=n.reversal_journal_id
   AND event_type='CHEF_MANUAL_PAYOUT_REVERSED' AND source='craves-manual' AND currency='INR'
   AND actor_type='HUMAN' AND actor_id=evidence.operator_id::text AND occurred_at=evidence.paid_at;
  IF original IS DISTINCT FROM n.settlement_journal_id OR n.amount IS DISTINCT FROM evidence.amount
   OR evidence.paid_at<n.manual_paid_at OR evidence.paid_at>now()+interval '30 seconds' THEN
   RAISE EXCEPTION 'Manual return requires linked exact bank evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN n;
END;$$;

CREATE FUNCTION payment_schema.guard_payout_channel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payout_channel IS DISTINCT FROM OLD.payout_channel THEN RAISE EXCEPTION 'Payout channel is immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER finance_payout_channel_immutable BEFORE UPDATE ON payment_schema.finance_payout_instruction
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_payout_channel();
CREATE OR REPLACE FUNCTION payment_schema.guard_finance_payout_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE beneficiary_chef UUID; proven NUMERIC; clearing NUMERIC; line_count BIGINT; original UUID;
BEGIN
 IF NEW.payout_channel='CRAVES_MANUAL' THEN
  RETURN payment_schema.validate_manual_instruction(NEW, CASE WHEN TG_OP='UPDATE' THEN OLD ELSE NULL::payment_schema.finance_payout_instruction END, TG_OP);
 END IF;
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
CREATE OR REPLACE FUNCTION payment_schema.guard_bank_payout_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payout_channel='CRAVES_MANUAL' THEN RETURN NEW; END IF;
 IF (TG_OP='INSERT' AND NEW.status='RESERVED') OR (TG_OP='UPDATE' AND OLD.status='RESERVED' AND NEW.status='SUBMITTING') THEN
  PERFORM 1 FROM payment_schema.finance_bank_head WHERE chef_identity_id=NEW.chef_identity_id FOR SHARE;
  IF NOT payment_schema.finance_bank_ready(NEW.chef_identity_id,NEW.beneficiary_id) THEN
   RAISE EXCEPTION 'Current bank enrollment is not provider-validated and eligible; do not override this hold' USING ERRCODE='23514';
  END IF;
 END IF;RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION payment_schema.guard_finance_payout_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payment_schema.finance_payable%ROWTYPE; i payment_schema.finance_payout_instruction%ROWTYPE;
BEGIN
 -- A cancelled manual reservation is definitely unsent; use its separate release rule.
 IF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active AND
   EXISTS(SELECT 1 FROM payment_schema.finance_payout_instruction x WHERE x.id=NEW.instruction_id
    AND x.payout_channel='CRAVES_MANUAL' AND x.status='CANCELLED') THEN
  IF ROW(NEW.instruction_id,NEW.payable_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.instruction_id,OLD.payable_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Allocation context is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payout allocation history cannot be deleted' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT i FROM payment_schema.finance_payout_instruction WHERE id=NEW.instruction_id;
 IF TG_OP='UPDATE' THEN
   IF ROW(NEW.instruction_id,NEW.payable_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.instruction_id,OLD.payable_id,OLD.created_at)
      OR (NOT OLD.active AND NEW.active) OR (OLD.active AND NOT NEW.active AND i.status NOT IN ('FAILED','REVERSED')) THEN
     RAISE EXCEPTION 'Only definitive payout failure or reversal releases an allocation' USING ERRCODE='55000';
   END IF;
 ELSE
   SELECT * INTO STRICT p FROM payment_schema.finance_payable WHERE id=NEW.payable_id;
   IF i.status<>'RESERVED' OR i.chef_identity_id<>p.chef_identity_id OR NOT NEW.active THEN
     RAISE EXCEPTION 'Payout allocation owner or state mismatch' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;

-- An action is evidence of a completed state transition, never a pre-authorized future write.
CREATE FUNCTION payment_schema.guard_manual_action_committed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i payment_schema.finance_payout_instruction%ROWTYPE;
BEGIN
 SELECT * INTO STRICT i FROM payment_schema.finance_payout_instruction WHERE id=NEW.instruction_id;
 IF i.payout_channel<>'CRAVES_MANUAL' OR i.manual_version<NEW.result_version
  OR (i.manual_version=NEW.result_version AND i.status<>NEW.to_status) THEN
  RAISE EXCEPTION 'Manual action must be committed with its instruction transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
CREATE CONSTRAINT TRIGGER finance_manual_action_commit_guard AFTER INSERT ON payment_schema.finance_manual_settlement_action
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_manual_action_committed();
CREATE UNIQUE INDEX finance_manual_bank_reference_unique ON payment_schema.finance_payout_instruction(transfer_reference)
 WHERE payout_channel='CRAVES_MANUAL' AND transfer_reference IS NOT NULL;
CREATE INDEX finance_payable_chef_manual ON payment_schema.finance_payable(chef_identity_id,manual_available_at,id);
CREATE INDEX finance_manual_instruction_recent ON payment_schema.finance_payout_instruction(chef_identity_id,created_at DESC,id DESC)
 WHERE payout_channel='CRAVES_MANUAL';
