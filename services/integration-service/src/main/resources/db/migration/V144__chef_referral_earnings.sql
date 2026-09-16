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
