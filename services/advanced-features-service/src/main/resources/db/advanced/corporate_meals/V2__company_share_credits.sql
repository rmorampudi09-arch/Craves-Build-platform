-- M24d: when a company-share order is refunded, Finance credits the company's part of the refund back through
-- POST /internal/v1/corporate-meals/charges/{id}/credit. One row per refund (the refund id makes a retry harmless); the charge keeps
-- the running total, which budgets, member caps and statements subtract from the share. Additive: existing charges start at 0.
ALTER TABLE adv_corporate_meals.charge ADD COLUMN credited_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE adv_corporate_meals.charge ADD CONSTRAINT charge_credited_within_share
    CHECK (credited_paise >= 0 AND credited_paise <= company_share_paise);

CREATE TABLE adv_corporate_meals.charge_credit (
    refund_id     uuid         PRIMARY KEY,
    charge_id     uuid         NOT NULL REFERENCES adv_corporate_meals.charge (id) ON DELETE CASCADE,
    order_id      uuid         NOT NULL,
    amount_paise  bigint       NOT NULL CHECK (amount_paise >= 1),
    created_at    timestamptz  NOT NULL
);
CREATE INDEX charge_credit_charge_idx ON adv_corporate_meals.charge_credit (charge_id, created_at);
