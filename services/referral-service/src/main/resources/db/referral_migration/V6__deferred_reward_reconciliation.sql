CREATE INDEX journal_reward ON referral_schema.journal(reward_id) WHERE reward_id IS NOT NULL;
CREATE INDEX journal_reference ON referral_schema.journal(reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX paid_provider_reference ON referral_schema.reservation(provider_ref) WHERE kind='CASHOUT' AND status='PAID';
ALTER TABLE referral_schema.journal ADD CONSTRAINT internal_transfer_has_no_external_leg CHECK(counterparty<>'INTERNAL_TRANSFER' OR counterparty_delta=0);
ALTER TABLE referral_schema.journal ADD CONSTRAINT reward_expense_requires_reward CHECK(counterparty NOT IN ('UPLINE_EXPENSE','MARKETING_EXPENSE') OR reward_id IS NOT NULL);
ALTER TABLE referral_schema.reservation ADD CONSTRAINT complete_cashout_amounts CHECK((net_paise IS NULL AND withholding_paise IS NULL) OR
 (net_paise IS NOT NULL AND withholding_paise IS NOT NULL AND net_paise>=0 AND withholding_paise>=0 AND net_paise+withholding_paise=amount_paise));
ALTER TABLE referral_schema.reservation ADD CONSTRAINT submitted_cashout_review CHECK(kind<>'CASHOUT' OR status NOT IN ('APPROVED','SUBMITTED','PAID','UNKNOWN') OR
 (approved_by IS NOT NULL AND approval_ref IS NOT NULL AND net_paise IS NOT NULL AND withholding_paise IS NOT NULL));
ALTER TABLE referral_schema.reservation ADD CONSTRAINT paid_cashout_evidence CHECK(kind<>'CASHOUT' OR status<>'PAID' OR (provider_ref IS NOT NULL AND paid_at IS NOT NULL AND attempt_id IS NOT NULL));
CREATE FUNCTION referral_schema.journal_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; track_name text;
BEGIN
 IF NEW.reward_id IS NOT NULL THEN
  SELECT beneficiary_id,track INTO STRICT owner_id,track_name FROM referral_schema.reward WHERE id=NEW.reward_id;
  IF NEW.user_id<>owner_id OR (NEW.counterparty='UPLINE_EXPENSE' AND track_name<>'UPLINE') OR (NEW.counterparty='MARKETING_EXPENSE' AND track_name<>'CUSTOMER') THEN
   RAISE EXCEPTION 'REWARD_JOURNAL_OWNER_MISMATCH' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER journal_owner_guard BEFORE INSERT ON referral_schema.journal FOR EACH ROW EXECUTE FUNCTION referral_schema.journal_owner_guard();
CREATE FUNCTION referral_schema.reward_balance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=referral_schema,pg_temp AS $$
DECLARE target uuid; r referral_schema.reward%ROWTYPE; outstanding numeric; pending numeric; available numeric; reserved numeric;
BEGIN
 IF TG_TABLE_NAME='reward' THEN target=NEW.id; ELSE target=NEW.reward_id; END IF;
 IF target IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT r FROM referral_schema.reward WHERE id=target;
 SELECT r.amount_paise-COALESCE(sum(amount_paise),0) INTO outstanding FROM referral_schema.reversal WHERE reward_id=target;
 SELECT COALESCE(sum(pending_delta),0),COALESCE(sum(available_delta),0),COALESCE(sum(reserved_delta),0) INTO pending,available,reserved
  FROM referral_schema.journal WHERE reward_id=target;
 IF reserved<>0 OR (r.status='PENDING' AND (pending<>outstanding OR available<>0))
  OR (r.status='CREDITED' AND (pending<>0 OR available<>outstanding))
  OR (r.status IN ('CANCELLED','REVERSED') AND (pending<>0 OR available<>0 OR outstanding<>0)) THEN
  RAISE EXCEPTION 'REFERRAL_REWARD_JOURNAL_DRIFT' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER reward_reconciles AFTER INSERT OR UPDATE ON referral_schema.reward DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION referral_schema.reward_balance_guard();
CREATE CONSTRAINT TRIGGER reversal_reconciles AFTER INSERT ON referral_schema.reversal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION referral_schema.reward_balance_guard();
CREATE CONSTRAINT TRIGGER reward_journal_reconciles AFTER INSERT ON referral_schema.journal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION referral_schema.reward_balance_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
