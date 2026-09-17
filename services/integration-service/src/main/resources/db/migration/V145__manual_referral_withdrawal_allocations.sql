-- Referrals retain their own source identity; never masquerade as food-sale payables.
CREATE FUNCTION payment_schema.ensure_referral_settlement_hold(chef UUID) RETURNS void LANGUAGE sql AS $$
 INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_kind,hold_reason)
 VALUES(chef,true,'OPERATIONAL','Referral refund requires settlement reconciliation')
 ON CONFLICT(chef_identity_id) DO UPDATE SET on_hold=true,hold_kind='OPERATIONAL',
 hold_reason=CASE WHEN finance_chef_payout_control.on_hold AND finance_chef_payout_control.hold_kind='OPERATIONAL'
   THEN finance_chef_payout_control.hold_reason ELSE EXCLUDED.hold_reason END,updated_at=now();
$$;
CREATE OR REPLACE FUNCTION payment_schema.hold_referral_refund_recipients() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient UUID;
BEGIN
 IF NEW.status NOT IN ('FAILED','CANCELLED') AND NEW.chef_sub_order_id IS NOT NULL THEN
  FOR recipient IN SELECT DISTINCT beneficiary_id FROM payment_schema.chef_referral_posting
    WHERE chef_order_id=NEW.chef_sub_order_id ORDER BY beneficiary_id LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('chef-payout/'||recipient::text,0));
   PERFORM payment_schema.ensure_referral_settlement_hold(recipient);
  END LOOP;
 END IF;
 RETURN NULL;
END;$$;
CREATE TABLE payment_schema.finance_referral_allocation (
 instruction_id UUID NOT NULL REFERENCES payment_schema.finance_payout_instruction(id),
 posting_id UUID NOT NULL REFERENCES payment_schema.chef_referral_posting(posting_id),
 amount NUMERIC NOT NULL CHECK(amount>0 AND amount=round(amount,2)),
 active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(instruction_id,posting_id)
);
CREATE UNIQUE INDEX finance_referral_single_reservation
 ON payment_schema.finance_referral_allocation(posting_id) WHERE active;

CREATE VIEW payment_schema.finance_referral_available AS
 SELECT r.posting_id,r.beneficiary_id AS chef_identity_id,
   (r.amount_paise+coalesce((SELECT sum(x.amount_paise) FROM payment_schema.chef_referral_posting x
       WHERE x.original_posting_id=r.posting_id),0))::numeric/100 AS amount
 FROM payment_schema.chef_referral_posting r
 WHERE r.amount_paise>0 AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_referral_allocation a
   WHERE a.posting_id=r.posting_id AND a.active);

CREATE FUNCTION payment_schema.guard_referral_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i payment_schema.finance_payout_instruction%ROWTYPE;
        r payment_schema.chef_referral_posting%ROWTYPE; available NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Referral allocation history is immutable' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT i FROM payment_schema.finance_payout_instruction WHERE id=NEW.instruction_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('chef-payout/'||i.chef_identity_id::text,0));
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.instruction_id,NEW.posting_id,NEW.amount,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.instruction_id,OLD.posting_id,OLD.amount,OLD.created_at)
    OR (NOT OLD.active AND NEW.active)
    OR (OLD.active AND NOT NEW.active AND i.status NOT IN ('FAILED','REVERSED','CANCELLED')) THEN
   RAISE EXCEPTION 'Only a definitive unsent or returned payment releases referral money' USING ERRCODE='55000';
  END IF;
 ELSE
  SELECT * INTO STRICT r FROM payment_schema.chef_referral_posting WHERE posting_id=NEW.posting_id;
  SELECT amount INTO available FROM payment_schema.finance_referral_available WHERE posting_id=NEW.posting_id;
  IF i.payout_channel<>'CRAVES_MANUAL' OR i.status<>'RESERVED' OR NOT NEW.active
   OR r.amount_paise<=0 OR r.beneficiary_id<>i.chef_identity_id OR available IS DISTINCT FROM NEW.amount THEN
   RAISE EXCEPTION 'Referral reservation must match the owner and exact unallocated net credit' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER finance_referral_allocation_guard BEFORE INSERT OR UPDATE OR DELETE
 ON payment_schema.finance_referral_allocation FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_allocation();
CREATE TRIGGER finance_referral_allocation_no_truncate BEFORE TRUNCATE
 ON payment_schema.finance_referral_allocation FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

-- Both source types must exactly reconcile to the one immutable payment instruction.
CREATE OR REPLACE FUNCTION payment_schema.assert_finance_payout_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE instruction UUID; expected NUMERIC; actual NUMERIC; items BIGINT;
BEGIN
 IF TG_TABLE_NAME='finance_payout_instruction' THEN instruction:=NEW.id; ELSE instruction:=NEW.instruction_id; END IF;
 SELECT amount INTO STRICT expected FROM payment_schema.finance_payout_instruction WHERE id=instruction;
 SELECT count(*),coalesce(sum(amount),0) INTO items,actual FROM (
  SELECT p.amount FROM payment_schema.finance_payout_allocation a
   JOIN payment_schema.finance_payable p ON p.id=a.payable_id WHERE a.instruction_id=instruction
  UNION ALL SELECT a.amount FROM payment_schema.finance_referral_allocation a WHERE a.instruction_id=instruction
 ) allocations;
 IF items=0 OR actual<>expected THEN RAISE EXCEPTION 'Payout allocations must equal frozen instruction amount' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;$$;
CREATE CONSTRAINT TRIGGER finance_referral_allocation_amount_balanced AFTER INSERT ON payment_schema.finance_referral_allocation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.assert_finance_payout_total();

-- Keep every existing hold and source/refund guard. Add referral source checks;
-- releasing an operational hold is not permission to pay an unresolved refund.
ALTER FUNCTION payment_schema.finance_manual_money_held(UUID) RENAME TO finance_manual_sale_money_held;
CREATE FUNCTION payment_schema.finance_manual_money_held(chef UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT payment_schema.finance_manual_sale_money_held(chef)
 OR EXISTS(SELECT 1 FROM payment_schema.chef_referral_posting r
   LEFT JOIN payment_schema.finance_order_binding b ON b.chef_order_id=r.chef_order_id
   WHERE r.beneficiary_id=chef AND (b.chef_order_id IS NULL OR b.state<>'DELIVERED'))
 OR EXISTS(SELECT 1 FROM payment_schema.chef_referral_posting r JOIN payment_schema.refund f ON f.chef_sub_order_id=r.chef_order_id
   WHERE r.beneficiary_id=chef AND f.status NOT IN ('FAILED','CANCELLED'))
 OR EXISTS(SELECT 1 FROM payment_schema.chef_referral_posting r
   JOIN payment_schema.finance_referral_allocation a ON a.posting_id=r.posting_id AND a.active
   WHERE r.beneficiary_id=chef AND a.amount>(r.amount_paise+coalesce((SELECT sum(x.amount_paise)
     FROM payment_schema.chef_referral_posting x WHERE x.original_posting_id=r.posting_id),0))::numeric/100);
$$;
REVOKE ALL ON payment_schema.finance_referral_allocation,payment_schema.finance_referral_available FROM PUBLIC;
