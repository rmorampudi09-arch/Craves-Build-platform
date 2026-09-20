-- Emit immutable economic facts in the exact transaction that changes the referral ledger.
CREATE FUNCTION referral_schema.publish_finance_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO referral_schema.outbox(id,event_key,event_type,payload)
 VALUES(gen_random_uuid(),'journal:'||NEW.id,'referral.journal.appended',jsonb_build_object(
  'journalId',NEW.id,'eventKey',NEW.event_key,'userId',NEW.user_id,'pendingDeltaPaise',NEW.pending_delta::text,
  'availableDeltaPaise',NEW.available_delta::text,'reservedDeltaPaise',NEW.reserved_delta::text,
  'counterpartyDeltaPaise',NEW.counterparty_delta::text,'counterparty',NEW.counterparty,
  'rewardId',NEW.reward_id,'referenceId',NEW.reference_id,'occurredAt',NEW.created_at,'currency','INR'));
 RETURN NULL;END;$$;
CREATE TRIGGER referral_finance_journal AFTER INSERT ON referral_schema.journal
 FOR EACH ROW EXECUTE FUNCTION referral_schema.publish_finance_journal();
CREATE FUNCTION referral_schema.publish_finance_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO referral_schema.outbox(id,event_key,event_type,payload)
 VALUES(gen_random_uuid(),'finance-binding:'||NEW.order_id,'referral.order.bound',jsonb_build_object(
  'chefOrderId',NEW.order_id,'checkoutId',NEW.checkout_id,'sourceSnapshotHash',NEW.source_hash));
 RETURN NULL;END;$$;
CREATE TRIGGER referral_finance_binding AFTER INSERT ON referral_schema.order_snapshot
 FOR EACH ROW EXECUTE FUNCTION referral_schema.publish_finance_binding();
