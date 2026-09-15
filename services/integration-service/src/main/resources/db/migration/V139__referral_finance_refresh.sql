-- Wake only explicitly bound referral orders when local evidence changes.
-- No network or changes to existing source records occur in these triggers.
CREATE FUNCTION payment_schema.refresh_referral_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE chef_order_id=NEW.chef_sub_order_id;
 RETURN NULL;END;$$;
CREATE TRIGGER referral_refund_refresh AFTER INSERT OR UPDATE ON payment_schema.refund FOR EACH ROW EXECUTE FUNCTION payment_schema.refresh_referral_refund();
CREATE FUNCTION payment_schema.refresh_referral_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE checkout_id=NEW.checkout_id;
 RETURN NULL;END;$$;
CREATE TRIGGER referral_capture_refresh AFTER INSERT ON payment_schema.finance_capture FOR EACH ROW EXECUTE FUNCTION payment_schema.refresh_referral_capture();
CREATE FUNCTION payment_schema.refresh_referral_earning() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE chef_order_id=NEW.chef_order_id;
 RETURN NULL;END;$$;
CREATE TRIGGER referral_earning_refresh AFTER INSERT OR UPDATE ON payment_schema.finance_order_binding FOR EACH ROW EXECUTE FUNCTION payment_schema.refresh_referral_earning();
CREATE FUNCTION payment_schema.guard_referral_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral binding evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.chef_order_id,NEW.checkout_id,NEW.source_hash,NEW.created_at) IS DISTINCT FROM ROW(OLD.chef_order_id,OLD.checkout_id,OLD.source_hash,OLD.created_at) OR NEW.source_version<OLD.source_version THEN
  RAISE EXCEPTION 'Referral binding identity/version cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_binding_history BEFORE UPDATE OR DELETE ON payment_schema.referral_finance_binding FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_binding();
CREATE TRIGGER referral_binding_no_truncate BEFORE TRUNCATE ON payment_schema.referral_finance_binding FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_binding();
