-- M24d slice 3b-2: the company's part of each successful refund of a company-share checkout, credited on its M10 statement
-- by a worker (one row per Craves refund, the refund id is M10's idempotency key), and the order-service confirmation
-- that lets capture book the company's share as a receivable.
CREATE TABLE payment_schema.company_share_refund_credit (
 refund_id UUID PRIMARY KEY REFERENCES payment_schema.refund(id),
 checkout_id UUID NOT NULL REFERENCES payment_schema.company_share_checkout_funding(checkout_id),
 charge_id UUID NOT NULL,
 buyer_id UUID NOT NULL,
 amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
 state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CREDITED','NOTHING_OWED','REVIEW')),
 attempt_count INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 credited_paise BIGINT,
 last_error VARCHAR(300),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (state <> 'PENDING' OR amount_paise > 0)
);
CREATE INDEX company_share_refund_credit_due ON payment_schema.company_share_refund_credit(next_attempt_at, refund_id) WHERE state = 'PENDING';
CREATE TABLE payment_schema.company_share_checkout_confirmation (
 checkout_id UUID PRIMARY KEY REFERENCES payment_schema.company_share_checkout_funding(checkout_id),
 charge_id UUID NOT NULL,
 confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
