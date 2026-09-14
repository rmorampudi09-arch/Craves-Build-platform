-- Preserve financial history; release reservations instead of deleting old batch membership.
ALTER TABLE payment_schema.chef_settlement_item ADD COLUMN active_reservation BOOLEAN NOT NULL DEFAULT true;
UPDATE payment_schema.chef_settlement_item item SET active_reservation=false
FROM payment_schema.chef_settlement_batch batch
WHERE batch.id=item.batch_id AND batch.status IN ('FAILED','CANCELLED','SETTLED');
ALTER TABLE payment_schema.chef_settlement_item DROP CONSTRAINT chef_settlement_item_earning_entry_id_key;
CREATE UNIQUE INDEX ux_chef_settlement_active_reservation
ON payment_schema.chef_settlement_item(earning_entry_id) WHERE active_reservation;

CREATE FUNCTION payment_schema.guard_chef_earning_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Chef earning history cannot be deleted' USING ERRCODE='55000';
    END IF;
    IF ROW(NEW.id,NEW.order_id,NEW.chef_identity_id,NEW.order_source,NEW.currency,NEW.gross_amount,
           NEW.commission_amount,NEW.tax_withheld_amount,NEW.adjustment_amount,NEW.net_payable,
           NEW.allocation_reference,NEW.created_at,NEW.created_by_identity_id)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.order_id,OLD.chef_identity_id,OLD.order_source,OLD.currency,OLD.gross_amount,
           OLD.commission_amount,OLD.tax_withheld_amount,OLD.adjustment_amount,OLD.net_payable,
           OLD.allocation_reference,OLD.created_at,OLD.created_by_identity_id) THEN
        RAISE EXCEPTION 'Original chef amounts and ownership are immutable; create a linked adjustment' USING ERRCODE='55000';
    END IF;
    IF OLD.status='SETTLED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Settled chef history is immutable; use a recovery or adjustment' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER chef_earning_history_guard BEFORE UPDATE OR DELETE ON payment_schema.chef_earning_entry
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_chef_earning_history();
CREATE TRIGGER chef_earning_no_truncate BEFORE TRUNCATE ON payment_schema.chef_earning_entry
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_chef_settlement_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch payment_schema.chef_settlement_batch%ROWTYPE;
        earning payment_schema.chef_earning_entry%ROWTYPE;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Settlement membership is historical evidence and cannot be deleted' USING ERRCODE='55000';
    END IF;
    SELECT * INTO STRICT batch FROM payment_schema.chef_settlement_batch WHERE id=NEW.batch_id FOR UPDATE;
    IF TG_OP='UPDATE' THEN
        IF ROW(NEW.batch_id,NEW.earning_entry_id,NEW.chef_identity_id,NEW.amount,NEW.created_at)
           IS DISTINCT FROM ROW(OLD.batch_id,OLD.earning_entry_id,OLD.chef_identity_id,OLD.amount,OLD.created_at)
           OR (NOT OLD.active_reservation AND NEW.active_reservation)
           OR (OLD.active_reservation AND NOT NEW.active_reservation AND batch.status NOT IN ('FAILED','CANCELLED','SETTLED')) THEN
            RAISE EXCEPTION 'Settlement amounts and membership are immutable; only terminal reservations may release' USING ERRCODE='55000';
        END IF;
        RETURN NEW;
    END IF;
    IF batch.status<>'DRAFT' OR NOT NEW.active_reservation THEN
        RAISE EXCEPTION 'New membership requires an active draft batch' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT earning FROM payment_schema.chef_earning_entry WHERE id=NEW.earning_entry_id FOR UPDATE;
    IF earning.status<>'APPROVED' OR earning.chef_identity_id<>NEW.chef_identity_id
       OR earning.net_payable<>NEW.amount OR earning.currency<>batch.currency THEN
        RAISE EXCEPTION 'Reservation must match an approved chef payable and currency' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM payment_schema.chef_settlement_item WHERE batch_id=NEW.batch_id AND chef_identity_id<>NEW.chef_identity_id) THEN
        RAISE EXCEPTION 'Legacy external settlement references require one beneficiary per batch' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER chef_settlement_item_guard BEFORE INSERT OR UPDATE OR DELETE ON payment_schema.chef_settlement_item
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_chef_settlement_item();
CREATE TRIGGER chef_settlement_item_no_truncate BEFORE TRUNCATE ON payment_schema.chef_settlement_item
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_chef_settlement_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE beneficiaries BIGINT; items BIGINT; total NUMERIC;
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settlement batch evidence cannot be deleted' USING ERRCODE='55000'; END IF;
    IF ROW(NEW.id,NEW.batch_reference,NEW.currency,NEW.total_amount,NEW.entry_count,NEW.created_at,NEW.created_by_identity_id)
       IS DISTINCT FROM ROW(OLD.id,OLD.batch_reference,OLD.currency,OLD.total_amount,OLD.entry_count,OLD.created_at,OLD.created_by_identity_id) THEN
        RAISE EXCEPTION 'Settlement batch financial context is immutable' USING ERRCODE='55000';
    END IF;
    IF OLD.status IN ('SETTLED','FAILED','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Terminal settlement history is immutable' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT
       ((OLD.status='DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED')) OR
        (OLD.status='SUBMITTED' AND NEW.status IN ('SETTLED','FAILED'))) THEN
        RAISE EXCEPTION 'Unsupported settlement transition' USING ERRCODE='23514';
    END IF;
    IF OLD.status<>'DRAFT' AND NEW.external_reference IS DISTINCT FROM OLD.external_reference THEN
        RAISE EXCEPTION 'Submitted settlement reference cannot be replaced' USING ERRCODE='55000';
    END IF;
    IF NEW.status IN ('SUBMITTED','SETTLED') THEN
        SELECT count(DISTINCT chef_identity_id),count(*),coalesce(sum(amount),0)
        INTO beneficiaries,items,total FROM payment_schema.chef_settlement_item WHERE batch_id=NEW.id AND active_reservation;
        IF beneficiaries<>1 OR items<>NEW.entry_count OR total<>NEW.total_amount
           OR NEW.external_reference IS NULL OR btrim(NEW.external_reference)='' THEN
            RAISE EXCEPTION 'One beneficiary, complete reserved amounts and external evidence are required' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM payment_schema.chef_settlement_item item
                  JOIN payment_schema.chef_earning_entry earning ON earning.id=item.earning_entry_id
                  WHERE item.batch_id=NEW.id AND earning.status<>'SETTLEMENT_PENDING') THEN
            RAISE EXCEPTION 'Settlement earnings must remain pending until confirmed' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER chef_settlement_batch_guard BEFORE UPDATE OR DELETE ON payment_schema.chef_settlement_batch
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_chef_settlement_batch();
CREATE TRIGGER chef_settlement_batch_no_truncate BEFORE TRUNCATE ON payment_schema.chef_settlement_batch
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.release_terminal_settlement_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('FAILED','CANCELLED','SETTLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
        UPDATE payment_schema.chef_settlement_item SET active_reservation=false WHERE batch_id=NEW.id AND active_reservation;
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER chef_settlement_release AFTER UPDATE ON payment_schema.chef_settlement_batch
FOR EACH ROW EXECUTE FUNCTION payment_schema.release_terminal_settlement_reservations();

CREATE TRIGGER chef_earning_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.chef_earning_audit
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER chef_settlement_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.chef_settlement_audit
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

-- The insert transaction marker is assigned by the database, not caller supplied.
CREATE FUNCTION payment_schema.stamp_ledger_creation_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.created_in_tx := txid_current();
    NEW.posted_at := now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_creation_stamp BEFORE INSERT ON payment_schema.ledger_transaction
FOR EACH ROW EXECUTE FUNCTION payment_schema.stamp_ledger_creation_transaction();
