-- A posting role needs INSERT/SELECT, not UPDATE on immutable journal headers.
-- The database stamps created_in_tx in V122. An uncommitted header is visible only
-- to its own transaction, so a header row lock is unnecessary for inserting lines.
CREATE OR REPLACE FUNCTION payment_schema.guard_ledger_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header payment_schema.ledger_transaction%ROWTYPE;
BEGIN
    SELECT * INTO STRICT header FROM payment_schema.ledger_transaction WHERE id=NEW.transaction_id;
    IF header.created_in_tx<>txid_current() THEN
        RAISE EXCEPTION 'Cannot append lines to an already committed journal' USING ERRCODE='55000';
    END IF;
    IF NEW.currency<>header.currency THEN
        RAISE EXCEPTION 'Journal and account currencies must agree' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
