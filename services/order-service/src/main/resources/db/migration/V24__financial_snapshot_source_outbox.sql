-- The outbox is written inside the authoritative Order Service database transaction.
CREATE TABLE order_schema.order_financial_snapshot(
 chef_order_id UUID PRIMARY KEY REFERENCES order_schema.customer_order(id),snapshot_id UUID NOT NULL UNIQUE,
 snapshot_hash CHAR(64) NOT NULL,payload JSONB NOT NULL,bound_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE order_schema.finance_source_outbox(
 event_id UUID PRIMARY KEY,chef_order_id UUID NOT NULL REFERENCES order_schema.customer_order(id),kind VARCHAR(30) NOT NULL,
 payload JSONB NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),lease_id UUID,lease_until TIMESTAMPTZ,
 last_result VARCHAR(160),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(chef_order_id,kind)
);
CREATE INDEX ix_finance_source_due ON order_schema.finance_source_outbox(status,next_attempt_at,event_id);
CREATE FUNCTION order_schema.reject_finance_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Binding financial evidence is immutable' USING ERRCODE='55000'; END;$$;
CREATE TRIGGER financial_snapshot_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON order_schema.order_financial_snapshot FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_finance_history_mutation();
CREATE FUNCTION order_schema.guard_source_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR ROW(NEW.event_id,NEW.chef_order_id,NEW.kind,NEW.payload,NEW.created_at) IS DISTINCT FROM ROW(OLD.event_id,OLD.chef_order_id,OLD.kind,OLD.payload,OLD.created_at) THEN
  RAISE EXCEPTION 'Financial event content cannot change on retries' USING ERRCODE='55000'; END IF;RETURN NEW;END;$$;
CREATE TRIGGER finance_outbox_immutable_content BEFORE UPDATE OR DELETE ON order_schema.finance_source_outbox FOR EACH ROW EXECUTE FUNCTION order_schema.guard_source_outbox();
CREATE TRIGGER finance_outbox_no_truncate BEFORE TRUNCATE ON order_schema.finance_source_outbox FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_finance_history_mutation();

CREATE FUNCTION order_schema.enqueue_finance_event(order_id UUID,event_kind TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE s order_schema.order_financial_snapshot%ROWTYPE;o order_schema.customer_order%ROWTYPE;c order_schema.checkout%ROWTYPE;event UUID;body JSONB;
BEGIN
 SELECT * INTO s FROM order_schema.order_financial_snapshot WHERE chef_order_id=order_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO STRICT o FROM order_schema.customer_order WHERE id=order_id;
 SELECT * INTO STRICT c FROM order_schema.checkout WHERE id=o.checkout_id;
 IF event_kind='DELIVERED' AND (o.status<>'DELIVERED' OR o.delivery_status IS DISTINCT FROM 'DELIVERED' OR o.delivery_job_id IS NULL OR o.accepted_at IS NULL OR o.delivery_status_observed_at IS NULL OR o.refund_requested_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Financial eligibility requires authoritative completed delivery' USING ERRCODE='23514'; END IF;
 event:=gen_random_uuid();
 body:=jsonb_build_object('eventId',event,'schemaVersion','1.0','source','order-service','kind',event_kind,
  'sourceVersion',CASE WHEN event_kind='BOUND' THEN 1 ELSE 2 END,'snapshotId',s.snapshot_id,'snapshotHash',s.snapshot_hash,
  'chefOrderId',o.id,'checkoutId',o.checkout_id,'orderTotal',o.grand_total::text,'checkoutTotal',c.grand_total::text,
  'commercialStatus',o.status,'deliveryStatus',o.delivery_status,'deliveryJobId',o.delivery_job_id,
  'deliveredAt',o.delivery_status_observed_at,'chefAcceptedAt',o.accepted_at);
 INSERT INTO order_schema.finance_source_outbox(event_id,chef_order_id,kind,payload) VALUES(event,o.id,event_kind,body) ON CONFLICT(chef_order_id,kind) DO NOTHING;
END;$$;
CREATE FUNCTION order_schema.bind_financial_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o order_schema.customer_order%ROWTYPE;
BEGIN
 SELECT * INTO STRICT o FROM order_schema.customer_order WHERE id=NEW.chef_order_id FOR UPDATE;
 IF o.status<>'PAYMENT_PENDING' OR o.order_source<>'ON_DEMAND' OR o.chef_identity_id IS NULL
  OR (NEW.payload->>'chefOrderId')::uuid<>o.id OR (NEW.payload->>'checkoutId')::uuid<>o.checkout_id
  OR (NEW.payload->>'chefIdentityId')::uuid<>o.chef_identity_id OR (NEW.payload->>'customerIdentityId')::uuid<>o.customer_identity_id
  OR (NEW.payload->>'customerTotal')::numeric<>o.grand_total OR (NEW.payload->>'customerTax')::numeric<>o.tax_amount
  OR (NEW.payload->>'customerFood')::numeric<>o.food_subtotal OR (NEW.payload->>'delivery')::numeric<>o.delivery_fee
  OR (NEW.payload->>'platform')::numeric<>o.platform_fee OR NEW.payload->>'currency'<>o.currency
  OR NEW.payload->>'hash'<>NEW.snapshot_hash THEN
  RAISE EXCEPTION 'Order financial snapshot does not match the accepted source order' USING ERRCODE='23514';END IF;RETURN NEW;
END;$$;
CREATE TRIGGER bind_financial_snapshot_guard BEFORE INSERT ON order_schema.order_financial_snapshot FOR EACH ROW EXECUTE FUNCTION order_schema.bind_financial_snapshot();
CREATE FUNCTION order_schema.bound_finance_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM order_schema.enqueue_finance_event(NEW.chef_order_id,'BOUND');RETURN NULL;END;$$;
CREATE TRIGGER finance_bound_outbox AFTER INSERT ON order_schema.order_financial_snapshot FOR EACH ROW EXECUTE FUNCTION order_schema.bound_finance_event();
CREATE FUNCTION order_schema.financial_lifecycle_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='DELIVERED' THEN PERFORM order_schema.enqueue_finance_event(NEW.id,'DELIVERED');
  ELSIF NEW.status IN ('CHEF_REJECTED','CANCELLED','REFUND_PENDING','REFUNDED') THEN PERFORM order_schema.enqueue_finance_event(NEW.id,'CANCELLED');END IF;
 END IF;RETURN NULL;END;$$;
CREATE TRIGGER finance_lifecycle_outbox AFTER UPDATE ON order_schema.customer_order FOR EACH ROW EXECUTE FUNCTION order_schema.financial_lifecycle_event();
CREATE FUNCTION order_schema.guard_bound_order_money() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot WHERE chef_order_id=OLD.id) THEN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.checkout_id,NEW.customer_identity_id,NEW.kitchen_id,NEW.chef_identity_id,NEW.currency,NEW.food_subtotal,NEW.platform_fee,NEW.tax_amount,NEW.delivery_fee,NEW.grand_total)
   IS DISTINCT FROM ROW(OLD.id,OLD.checkout_id,OLD.customer_identity_id,OLD.kitchen_id,OLD.chef_identity_id,OLD.currency,OLD.food_subtotal,OLD.platform_fee,OLD.tax_amount,OLD.delivery_fee,OLD.grand_total) THEN
   RAISE EXCEPTION 'Accepted order amounts and ownership cannot be repriced' USING ERRCODE='55000';END IF;
 END IF;RETURN NEW;END;$$;
CREATE TRIGGER bound_order_money_guard BEFORE UPDATE OR DELETE ON order_schema.customer_order FOR EACH ROW EXECUTE FUNCTION order_schema.guard_bound_order_money();
CREATE FUNCTION order_schema.guard_bound_checkout_money() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot s JOIN order_schema.customer_order o ON o.id=s.chef_order_id WHERE o.checkout_id=OLD.id) THEN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.customer_identity_id,NEW.currency,NEW.food_subtotal,NEW.platform_fee,NEW.tax_amount,NEW.delivery_fee,NEW.grand_total)
   IS DISTINCT FROM ROW(OLD.id,OLD.customer_identity_id,OLD.currency,OLD.food_subtotal,OLD.platform_fee,OLD.tax_amount,OLD.delivery_fee,OLD.grand_total) THEN
   RAISE EXCEPTION 'Bound checkout money cannot be repriced' USING ERRCODE='55000';END IF;
 END IF;RETURN NEW;END;$$;
CREATE TRIGGER bound_checkout_money_guard BEFORE UPDATE OR DELETE ON order_schema.checkout FOR EACH ROW EXECUTE FUNCTION order_schema.guard_bound_checkout_money();
