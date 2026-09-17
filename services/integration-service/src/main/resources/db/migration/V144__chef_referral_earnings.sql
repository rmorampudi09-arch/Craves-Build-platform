CREATE TABLE payment_schema.chef_referral_posting (
 posting_id UUID PRIMARY KEY, reward_id UUID NOT NULL, chef_order_id UUID NOT NULL,
 beneficiary_id UUID NOT NULL, selling_chef_id UUID NOT NULL, amount_paise BIGINT NOT NULL CHECK(amount_paise<>0),
 original_posting_id UUID REFERENCES payment_schema.chef_referral_posting(posting_id),
 posting_month DATE NOT NULL CHECK(extract(day FROM posting_month)=1), posted_at TIMESTAMPTZ NOT NULL,
 payload_hash CHAR(64) NOT NULL, journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),
 CHECK((amount_paise>0 AND original_posting_id IS NULL) OR (amount_paise<0 AND original_posting_id IS NOT NULL)),
 CHECK(beneficiary_id<>selling_chef_id)
);
CREATE UNIQUE INDEX chef_referral_reward_credit ON payment_schema.chef_referral_posting(reward_id) WHERE amount_paise>0;
CREATE INDEX chef_referral_month ON payment_schema.chef_referral_posting(beneficiary_id,posting_month);
CREATE TRIGGER chef_referral_posting_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.chef_referral_posting
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
REVOKE ALL ON payment_schema.chef_referral_posting FROM PUBLIC;

-- A refund can arrive after a referral credit has already been mirrored. Hold every
-- affected recipient before a new payment instruction can be authorized.
CREATE FUNCTION payment_schema.hold_referral_refund_recipients() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient UUID;
BEGIN
 IF NEW.status NOT IN ('FAILED','CANCELLED') AND NEW.chef_sub_order_id IS NOT NULL THEN
  FOR recipient IN SELECT DISTINCT beneficiary_id FROM payment_schema.chef_referral_posting
    WHERE chef_order_id=NEW.chef_sub_order_id ORDER BY beneficiary_id LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('chef-payout/'||recipient::text,0));
   INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_kind,hold_reason)
    VALUES(recipient,true,'OPERATIONAL','Referral refund requires settlement reconciliation')
    ON CONFLICT(chef_identity_id) DO UPDATE SET on_hold=true,hold_kind='OPERATIONAL',hold_reason=EXCLUDED.hold_reason,updated_at=now();
  END LOOP;
 END IF;
 RETURN NULL;
END;$$;
CREATE TRIGGER finance_referral_refund_hold AFTER INSERT OR UPDATE ON payment_schema.refund
 FOR EACH ROW EXECUTE FUNCTION payment_schema.hold_referral_refund_recipients();
