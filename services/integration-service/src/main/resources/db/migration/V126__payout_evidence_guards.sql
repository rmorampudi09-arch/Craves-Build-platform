CREATE TABLE payment_schema.finance_payout_webhook_inbox (
 event_id VARCHAR(240) PRIMARY KEY,payload_hash CHAR(64) NOT NULL,
 instruction_id UUID NOT NULL REFERENCES payment_schema.finance_payout_instruction(id),
 provider_id VARCHAR(80) NOT NULL,event_type VARCHAR(100) NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER finance_payout_webhook_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_payout_webhook_inbox
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.assert_finance_payout_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE instruction UUID; expected NUMERIC; actual NUMERIC; items BIGINT;
BEGIN
 IF TG_TABLE_NAME='finance_payout_instruction' THEN instruction:=NEW.id; ELSE instruction:=NEW.instruction_id; END IF;
 SELECT amount INTO STRICT expected FROM payment_schema.finance_payout_instruction WHERE id=instruction;
 SELECT count(*),coalesce(sum(p.amount),0) INTO items,actual FROM payment_schema.finance_payout_allocation a
 JOIN payment_schema.finance_payable p ON p.id=a.payable_id WHERE a.instruction_id=instruction;
 IF items=0 OR actual<>expected THEN RAISE EXCEPTION 'Payout allocations must equal frozen instruction amount' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER finance_instruction_amount_balanced AFTER INSERT ON payment_schema.finance_payout_instruction
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.assert_finance_payout_total();
CREATE CONSTRAINT TRIGGER finance_allocation_amount_balanced AFTER INSERT ON payment_schema.finance_payout_allocation
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.assert_finance_payout_total();

CREATE FUNCTION payment_schema.guard_new_payable_legacy_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE legacy_state VARCHAR(40);
BEGIN
 SELECT status INTO legacy_state FROM payment_schema.chef_earning_entry WHERE order_id=NEW.chef_order_id FOR UPDATE;
 IF legacy_state IN ('SETTLEMENT_PENDING','SETTLED','REVERSED') THEN
   RAISE EXCEPTION 'Legacy payment history already owns this earning' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_payable_legacy_overlap BEFORE INSERT ON payment_schema.finance_payable
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_new_payable_legacy_overlap();
