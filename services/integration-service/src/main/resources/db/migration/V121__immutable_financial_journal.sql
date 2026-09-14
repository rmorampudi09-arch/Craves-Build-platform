-- Operational journal foundation. No historical balances, prices, payouts or provider flags are changed.
-- V121 in the separate, uncommitted chef-fee worktree must be reviewed/rebased, not applied over this migration.
CREATE TABLE payment_schema.ledger_account (
    account_code VARCHAR(60) NOT NULL,
    currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
    account_class VARCHAR(30) NOT NULL CHECK (account_class IN ('ASSET','LIABILITY','REVENUE','EXPENSE','CONTRA_REVENUE')),
    description VARCHAR(240) NOT NULL,
    PRIMARY KEY (account_code, currency)
);

INSERT INTO payment_schema.ledger_account (account_code,currency,account_class,description) VALUES
('BANK','INR','ASSET','Evidenced bank cash'),
('GATEWAY_CLEARING','INR','ASSET','Captured funds pending gateway settlement'),
('PAYOUT_CLEARING','INR','ASSET','Funded payout balance or transfer in transit'),
('PROVIDER_PREPAID','INR','ASSET','Reconciled delivery provider prepaid balance'),
('CHEF_RECOVERY','INR','ASSET','Approved and supported chef recovery'),
('PARTNER_RECEIVABLE','INR','ASSET','Recognized partner recovery, not a submitted claim'),
('RECOVERABLE_TAX','INR','ASSET','Separately approved recoverable input tax'),
('CUSTOMER_FUNDS','INR','LIABILITY','Captured customer funds pending fulfillment'),
('CHEF_PAYABLE','INR','LIABILITY','Outstanding chef earnings'),
('DELIVERY_PAYABLE','INR','LIABILITY','Supported delivery obligations'),
('REFUND_PAYABLE','INR','LIABILITY','Approved customer refunds awaiting execution'),
('TAX_PAYABLE','INR','LIABILITY','Tax obligations under an approved policy'),
('WITHHOLDING_PAYABLE','INR','LIABILITY','Withheld chef amounts awaiting remittance'),
('CHEF_FEE_REVENUE','INR','REVENUE','Chef service fee excluding separately posted fee tax'),
('CUSTOMER_UPLIFT_REVENUE','INR','REVENUE','Customer menu uplift'),
('DELIVERY_REVENUE','INR','REVENUE','Customer delivery collections'),
('PLATFORM_FEE_REVENUE','INR','REVENUE','Allocated customer platform fee'),
('DELIVERY_EXPENSE','INR','EXPENSE','Supported delivery costs and incremental variances'),
('GATEWAY_EXPENSE','INR','EXPENSE','Nonrecoverable gateway expense'),
('REFUND_LOSS','INR','EXPENSE','Refund responsibility borne by Craves'),
('CANCELLATION_COMPENSATION','INR','EXPENSE','Approved fee-free chef compensation'),
('PROMOTION_EXPENSE','INR','EXPENSE','Granted funded benefits, not planning reserves'),
('REFUND_RECOVERY','INR','CONTRA_REVENUE','Supported recovery offset; cleared once against receivable');

CREATE TABLE payment_schema.ledger_transaction (
    id UUID PRIMARY KEY,
    business_event_key VARCHAR(240) NOT NULL UNIQUE,
    source_event_id UUID NOT NULL,
    source VARCHAR(80) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    checkout_id UUID,
    chef_order_id UUID,
    currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
    occurred_at TIMESTAMPTZ NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    business_date DATE NOT NULL,
    evidence_reference VARCHAR(500) NOT NULL,
    payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    reversal_of UUID REFERENCES payment_schema.ledger_transaction(id),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('HUMAN','SERVICE')),
    actor_id VARCHAR(120) NOT NULL,
    created_in_tx BIGINT NOT NULL DEFAULT txid_current(),
    CHECK (reversal_of IS NULL OR reversal_of <> id)
);
CREATE UNIQUE INDEX ux_ledger_single_full_reversal ON payment_schema.ledger_transaction(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX ix_ledger_order ON payment_schema.ledger_transaction(chef_order_id,posted_at,id);
CREATE INDEX ix_ledger_checkout ON payment_schema.ledger_transaction(checkout_id,posted_at,id);

CREATE TABLE payment_schema.ledger_line (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES payment_schema.ledger_transaction(id),
    sequence INTEGER NOT NULL CHECK (sequence > 0 AND sequence <= 500),
    account_code VARCHAR(60) NOT NULL,
    currency CHAR(3) NOT NULL,
    debit_amount NUMERIC NOT NULL CHECK (debit_amount >= 0 AND debit_amount < 100000000000000 AND debit_amount = round(debit_amount,2)),
    credit_amount NUMERIC NOT NULL CHECK (credit_amount >= 0 AND credit_amount < 100000000000000 AND credit_amount = round(credit_amount,2)),
    chef_identity_id UUID,
    delivery_attempt_id UUID,
    provider_id VARCHAR(80),
    payment_id UUID,
    refund_id UUID,
    payout_instruction_id UUID,
    FOREIGN KEY (account_code,currency) REFERENCES payment_schema.ledger_account(account_code,currency),
    UNIQUE (transaction_id,sequence),
    CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);
CREATE INDEX ix_ledger_chef_account ON payment_schema.ledger_line(chef_identity_id,account_code,transaction_id);

CREATE TABLE payment_schema.ledger_event_inbox (
    event_id UUID PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    business_event_key VARCHAR(240) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    transaction_id UUID NOT NULL REFERENCES payment_schema.ledger_transaction(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.ledger_outbox (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','PUBLISHED','DEAD')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_id UUID,
    leased_at TIMESTAMPTZ,
    last_error VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ledger_outbox_due ON payment_schema.ledger_outbox(status,next_attempt_at);
CREATE TABLE payment_schema.ledger_conflict (
    id UUID PRIMARY KEY,
    source_event_id UUID NOT NULL,
    business_event_key VARCHAR(240) NOT NULL,
    existing_transaction_id UUID,
    existing_hash CHAR(64),
    attempted_hash CHAR(64) NOT NULL,
    reason VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_event_id,attempted_hash)
);

CREATE FUNCTION payment_schema.reject_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Posted financial history is immutable; use a linked adjustment' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER ledger_transaction_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.ledger_transaction
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER ledger_line_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.ledger_line
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER ledger_account_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.ledger_account
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER ledger_inbox_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.ledger_event_inbox
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER ledger_conflict_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.ledger_conflict
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_ledger_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header payment_schema.ledger_transaction%ROWTYPE;
BEGIN
    SELECT * INTO STRICT header FROM payment_schema.ledger_transaction WHERE id = NEW.transaction_id FOR UPDATE;
    IF header.created_in_tx <> txid_current() THEN
        RAISE EXCEPTION 'Cannot append lines to an already committed journal' USING ERRCODE = '55000';
    END IF;
    IF NEW.currency <> header.currency THEN
        RAISE EXCEPTION 'Journal and account currencies must agree' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_line_insert_guard BEFORE INSERT ON payment_schema.ledger_line
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_ledger_line_insert();

CREATE FUNCTION payment_schema.assert_ledger_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id UUID; line_count BIGINT; debit NUMERIC; credit NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'ledger_transaction' THEN journal_id := NEW.id;
    ELSE journal_id := NEW.transaction_id; END IF;
    SELECT count(*),coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
      INTO line_count,debit,credit FROM payment_schema.ledger_line WHERE transaction_id=journal_id;
    IF line_count < 2 OR debit <= 0 OR debit <> credit THEN
        RAISE EXCEPTION 'Journal % is unbalanced or empty',journal_id USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_header_balanced AFTER INSERT ON payment_schema.ledger_transaction
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.assert_ledger_balance();
CREATE CONSTRAINT TRIGGER ledger_lines_balanced AFTER INSERT ON payment_schema.ledger_line
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_schema.assert_ledger_balance();

CREATE FUNCTION payment_schema.guard_ledger_outbox_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial outbox evidence cannot be deleted' USING ERRCODE='55000'; END IF;
    IF ROW(NEW.id,NEW.transaction_id,NEW.event_type,NEW.payload,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id,OLD.transaction_id,OLD.event_type,OLD.payload,OLD.created_at) THEN
        RAISE EXCEPTION 'Financial outbox content is immutable' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_outbox_content_immutable BEFORE UPDATE OR DELETE ON payment_schema.ledger_outbox
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_ledger_outbox_content();
CREATE TRIGGER ledger_outbox_no_truncate BEFORE TRUNCATE ON payment_schema.ledger_outbox
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
REVOKE UPDATE,DELETE,TRUNCATE ON payment_schema.ledger_transaction,payment_schema.ledger_line,
    payment_schema.ledger_account,payment_schema.ledger_event_inbox,payment_schema.ledger_conflict FROM PUBLIC;
