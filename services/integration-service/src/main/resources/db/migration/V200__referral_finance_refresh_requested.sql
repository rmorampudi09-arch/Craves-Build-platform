-- The referral service checks how recent a finance observation is, so a refresh it asks for
-- must be answered even when nothing changed. Every other unchanged observation is skipped.
ALTER TABLE payment_schema.referral_finance_binding ADD COLUMN refresh_requested BOOLEAN NOT NULL DEFAULT false;
