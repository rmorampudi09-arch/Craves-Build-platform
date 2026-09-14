-- Tighten optional JSON null handling without replacing an applied source migration.
CREATE FUNCTION order_schema.require_financial_snapshot_fields() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key TEXT;o order_schema.customer_order%ROWTYPE;
BEGIN
 FOREACH key IN ARRAY ARRAY['snapshotId','hash','chefOrderId','checkoutId','chefIdentityId','customerIdentityId','kitchenId','currency','orderSource','customerTotal','customerTax','customerFood','chefGross','delivery','platform','pricedAt'] LOOP
  IF jsonb_typeof(NEW.payload->key) IS DISTINCT FROM 'string' OR btrim(NEW.payload->>key)='' THEN
   RAISE EXCEPTION 'Required binding financial field % is absent',key USING ERRCODE='23514';END IF;
 END LOOP;
 SELECT * INTO STRICT o FROM order_schema.customer_order WHERE id=NEW.chef_order_id;
 IF (NEW.payload->>'snapshotId')::uuid IS DISTINCT FROM NEW.snapshot_id
  OR (NEW.payload->>'kitchenId')::uuid IS DISTINCT FROM o.kitchen_id
  OR NEW.payload->>'orderSource' IS DISTINCT FROM o.order_source
  OR NEW.snapshot_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(NEW.payload->'items') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Binding snapshot identity or items are invalid' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER financial_snapshot_required_fields BEFORE INSERT ON order_schema.order_financial_snapshot
FOR EACH ROW EXECUTE FUNCTION order_schema.require_financial_snapshot_fields();

CREATE OR REPLACE FUNCTION order_schema.guard_bound_order_money() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot WHERE chef_order_id=OLD.id) THEN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.checkout_id,NEW.customer_identity_id,NEW.kitchen_id,NEW.chef_identity_id,NEW.currency,NEW.food_subtotal,NEW.platform_fee,NEW.tax_amount,NEW.delivery_fee,NEW.grand_total)
   IS DISTINCT FROM ROW(OLD.id,OLD.checkout_id,OLD.customer_identity_id,OLD.kitchen_id,OLD.chef_identity_id,OLD.currency,OLD.food_subtotal,OLD.platform_fee,OLD.tax_amount,OLD.delivery_fee,OLD.grand_total) THEN
   RAISE EXCEPTION 'Accepted order amounts and ownership cannot be repriced' USING ERRCODE='55000';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION order_schema.guard_bound_checkout_money() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot s JOIN order_schema.customer_order o ON o.id=s.chef_order_id WHERE o.checkout_id=OLD.id) THEN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.customer_identity_id,NEW.currency,NEW.food_subtotal,NEW.platform_fee,NEW.tax_amount,NEW.delivery_fee,NEW.grand_total)
   IS DISTINCT FROM ROW(OLD.id,OLD.customer_identity_id,OLD.currency,OLD.food_subtotal,OLD.platform_fee,OLD.tax_amount,OLD.delivery_fee,OLD.grand_total) THEN
   RAISE EXCEPTION 'Bound checkout money cannot be repriced' USING ERRCODE='55000';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;
CREATE FUNCTION order_schema.guard_bound_order_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot WHERE chef_order_id=OLD.order_id))
 OR (TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot WHERE chef_order_id=NEW.order_id)) THEN
  RAISE EXCEPTION 'Accepted order items and quantities are immutable; use a linked adjustment' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;
CREATE TRIGGER bound_order_items_guard BEFORE INSERT OR UPDATE OR DELETE ON order_schema.order_item
FOR EACH ROW EXECUTE FUNCTION order_schema.guard_bound_order_items();
CREATE TRIGGER bound_order_items_no_truncate BEFORE TRUNCATE ON order_schema.order_item
FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_finance_history_mutation();
