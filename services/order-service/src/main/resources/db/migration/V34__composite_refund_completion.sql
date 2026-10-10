-- Consumer-first support for truthful zero-gateway completion. No historical rows are rewritten.
-- Keep this additive migration on rollback; the old consumer cannot process version 1.1 events.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE order_schema.customer_order
    DROP CONSTRAINT chk_customer_order_refund_provider_status,
    ADD CONSTRAINT chk_customer_order_refund_provider_status CHECK (
        refund_provider_status IS NULL
        OR refund_provider_status IN ('PENDING', 'ONHOLD', 'SUCCESS', 'FAILED', 'CANCELLED')
        OR COALESCE((refund_provider_status = 'NO_EXTERNAL_REFUND'
            AND refund_provider IN ('REFERRAL_WALLET', 'RAZORPAY', 'CASHFREE') AND status = 'REFUNDED'
            AND provider_refund_id IS NULL AND cf_refund_id IS NULL), false)
    ) NOT VALID;

ALTER TABLE order_schema.refund_status_inbox
    DROP CONSTRAINT chk_refund_status_inbox_provider_status,
    ADD CONSTRAINT chk_refund_status_inbox_provider_status CHECK (
        provider_status IN ('PENDING', 'ONHOLD', 'SUCCESS', 'FAILED', 'CANCELLED')
        OR COALESCE((provider_status = 'NO_EXTERNAL_REFUND' AND event_version = '1.1'
            AND normalized_status = 'REFUNDED'
            AND payload->'data'->>'provider' IN ('REFERRAL_WALLET', 'RAZORPAY', 'CASHFREE')
            AND payload->'data'->'completion'->>'type' = 'ALL_TENDERS_RESTORED'
            AND (payload->'data'->>'providerRefundId') IS NULL
            AND (payload->'data'->>'cfRefundId') IS NULL), false)
    ) NOT VALID;
