CREATE TABLE payment_schema.finance_source_receipt(
 event_id UUID PRIMARY KEY,chef_order_id UUID NOT NULL,payload_hash CHAR(64) NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payment_schema.finance_source_receipt(event_id,chef_order_id,payload_hash)
SELECT event_id,chef_order_id,payload_hash FROM payment_schema.finance_source_event;
CREATE TRIGGER finance_source_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_source_receipt
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_financial_binding_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial source history cannot be deleted' USING ERRCODE='55000';END IF;
 IF NEW.chef_order_id IS DISTINCT FROM OLD.chef_order_id OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
    OR NEW.source_version<OLD.source_version OR (OLD.earning_journal_id IS NOT NULL AND NEW.earning_journal_id IS DISTINCT FROM OLD.earning_journal_id) THEN
  RAISE EXCEPTION 'Financial binding identity, version and posted journal cannot be rewritten' USING ERRCODE='55000';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER finance_binding_state_guard BEFORE UPDATE OR DELETE ON payment_schema.finance_order_binding
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_financial_binding_state();
CREATE TRIGGER finance_binding_no_truncate BEFORE TRUNCATE ON payment_schema.finance_order_binding
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.hold_reviewed_financial_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chef UUID;
BEGIN
 IF NEW.state='REVIEW_REQUIRED' OR (NEW.state='CANCELLED' AND NEW.earning_journal_id IS NOT NULL) THEN
  SELECT chef_identity_id INTO chef FROM payment_schema.finance_issued_snapshot WHERE id=NEW.snapshot_id;
  INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_reason)
  VALUES(chef,true,'Order source conflict or post-earning cancellation requires financial review')
  ON CONFLICT(chef_identity_id) DO UPDATE SET on_hold=true,hold_reason=EXCLUDED.hold_reason,updated_at=now();
 END IF;RETURN NULL;
END;$$;
CREATE TRIGGER finance_source_review_hold AFTER INSERT OR UPDATE ON payment_schema.finance_order_binding
FOR EACH ROW EXECUTE FUNCTION payment_schema.hold_reviewed_financial_source();

CREATE FUNCTION payment_schema.hold_refund_affected_chef() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chef UUID;
BEGIN
 IF NEW.status NOT IN ('FAILED','CANCELLED') AND NEW.chef_sub_order_id IS NOT NULL THEN
  SELECT chef_identity_id INTO chef FROM payment_schema.finance_earning_projection WHERE chef_order_id=NEW.chef_sub_order_id;
  IF chef IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('chef-payout/'||chef::text,0));
   UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,
    hold_reason='Refund affects a posted earning; approved responsibility and accounting adjustment are required',updated_at=now()
    WHERE chef_identity_id=chef;
  END IF;
 END IF;RETURN NULL;
END;$$;
CREATE TRIGGER finance_refund_chef_hold AFTER INSERT OR UPDATE ON payment_schema.refund
FOR EACH ROW EXECUTE FUNCTION payment_schema.hold_refund_affected_chef();

CREATE FUNCTION payment_schema.guard_source_payout_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='SUBMITTING' AND OLD.status='RESERVED' THEN
  IF EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a
   JOIN payment_schema.finance_payable p ON p.id=a.payable_id
   JOIN payment_schema.finance_order_binding b ON b.chef_order_id=p.chef_order_id
   WHERE a.instruction_id=NEW.id AND a.active AND b.state<>'DELIVERED')
   OR EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a
   JOIN payment_schema.finance_payable p ON p.id=a.payable_id
   JOIN payment_schema.refund r ON r.chef_sub_order_id=p.chef_order_id
   WHERE a.instruction_id=NEW.id AND a.active AND r.status NOT IN ('FAILED','CANCELLED')) THEN
   RAISE EXCEPTION 'Unresolved source or refund exposure blocks a new provider submission' USING ERRCODE='23514';
  END IF;
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER finance_source_dispatch_guard BEFORE UPDATE ON payment_schema.finance_payout_instruction
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_source_payout_dispatch();
