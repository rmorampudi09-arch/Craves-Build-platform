CREATE TABLE payment_schema.referral_operator_audit (
 id UUID PRIMARY KEY,action VARCHAR(60) NOT NULL,target_id UUID NOT NULL,actor_id UUID NOT NULL,
 reason VARCHAR(1000) NOT NULL,evidence_ref VARCHAR(180) NOT NULL,detail JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER referral_operator_audit_guard BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.referral_operator_audit FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TABLE payment_schema.referral_checkout_cancellation (
 checkout_id UUID PRIMARY KEY REFERENCES payment_schema.referral_checkout_funding(checkout_id),actor_id UUID NOT NULL,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),completed_at TIMESTAMPTZ,last_code VARCHAR(80),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),attempts INTEGER NOT NULL DEFAULT 0
);
CREATE FUNCTION payment_schema.guard_referral_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral cancellation evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.checkout_id,NEW.actor_id,NEW.requested_at) IS DISTINCT FROM ROW(OLD.checkout_id,OLD.actor_id,OLD.requested_at) OR OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Cancellation identity cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_cancellation_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_checkout_cancellation FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_cancellation();
CREATE TRIGGER referral_cancellation_no_truncate BEFORE TRUNCATE ON payment_schema.referral_checkout_cancellation FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_cancellation();
CREATE FUNCTION payment_schema.guard_referral_payout_instruction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral payout instruction is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.attempt_id,NEW.reservation_id,NEW.user_id,NEW.payload,NEW.source_event_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.attempt_id,OLD.reservation_id,OLD.user_id,OLD.payload,OLD.source_event_id,OLD.created_at) THEN RAISE EXCEPTION 'Referral payout identity cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_payout_instruction_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_payout_instruction FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_payout_instruction();
CREATE TRIGGER referral_payout_instruction_no_truncate BEFORE TRUNCATE ON payment_schema.referral_payout_instruction FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_payout_instruction();

ALTER TABLE payment_schema.refund DROP CONSTRAINT ck_refund_workflow_status;
ALTER TABLE payment_schema.refund ADD CONSTRAINT ck_refund_workflow_status CHECK(status IN ('REQUESTED','PROCESSING','RETRY','PENDING','ONHOLD','SUCCESS','FAILED','CANCELLED','DEAD_LETTER','BENEFITS_PENDING')) NOT VALID;
