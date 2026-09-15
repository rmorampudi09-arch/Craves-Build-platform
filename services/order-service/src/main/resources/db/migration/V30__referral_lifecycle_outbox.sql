CREATE FUNCTION order_schema.enqueue_referral_event(event_key_value TEXT,kind TEXT,aggregate UUID,occurred TIMESTAMPTZ,body JSONB) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE identity UUID:=gen_random_uuid();content TEXT;content_digest TEXT;prior order_schema.referral_source_outbox%ROWTYPE;
BEGIN
 content:=jsonb_build_object('eventType',kind,'aggregateId',aggregate,'occurredAt',occurred,'payload',body)::text;
 content_digest:=encode(sha256(convert_to(content,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('referral-source/'||event_key_value,0));
 SELECT * INTO prior FROM order_schema.referral_source_outbox WHERE event_key=event_key_value;
 IF FOUND THEN
  IF prior.content_hash<>content_digest THEN RAISE EXCEPTION 'Referral lifecycle content conflict' USING ERRCODE='23514';END IF;
  RETURN prior.event_id;
 END IF;
 INSERT INTO order_schema.referral_source_outbox(event_id,event_key,aggregate_id,content_hash,envelope)
 VALUES(identity,event_key_value,aggregate,content_digest,(content::jsonb||jsonb_build_object('eventId',identity))::text);
 RETURN identity;
END;$$;

CREATE FUNCTION order_schema.publish_referral_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding order_schema.referral_order_binding%ROWTYPE;event UUID;first_checkout UUID;prior_refunded BOOLEAN;
BEGIN
 SELECT * INTO binding FROM order_schema.referral_order_binding WHERE chef_order_id=NEW.id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF NEW.status='DELIVERED' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.delivery_status IS DISTINCT FROM 'DELIVERED' OR NEW.delivery_status_observed_at IS NULL OR NEW.delivery_job_id IS NULL THEN
   RAISE EXCEPTION 'Authoritative referral delivery evidence required' USING ERRCODE='23514';END IF;
  event:=order_schema.enqueue_referral_event('order/'||NEW.id||'/delivered','order.delivered',NEW.id,NEW.delivery_status_observed_at,
   jsonb_build_object('chefOrderId',NEW.id,'version',1,'deliveredAt',NEW.delivery_status_observed_at,'sourceSnapshotHash',binding.snapshot_hash));
  INSERT INTO order_schema.referral_lifecycle_projection(chef_order_id,delivery_event_id) VALUES(NEW.id,event) ON CONFLICT(chef_order_id) DO NOTHING;
  -- One buyer lock serializes competing delivered checkouts. Query ALL historical checkouts,
  -- including ones created before referral enrollment; never count only referral-bound orders.
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-first/'||NEW.customer_identity_id,0));
  IF NOT EXISTS(SELECT 1 FROM order_schema.referral_first_checkout WHERE buyer_id=NEW.customer_identity_id) THEN
   SELECT c.id INTO first_checkout FROM order_schema.checkout c
    JOIN order_schema.customer_order o ON o.checkout_id=c.id
    WHERE c.customer_identity_id=NEW.customer_identity_id AND c.food_subtotal>=800
    GROUP BY c.id
    HAVING bool_and(COALESCE(o.delivery_status='DELIVERED' AND o.delivery_status_observed_at IS NOT NULL,false))
    ORDER BY max(o.delivery_status_observed_at),c.id LIMIT 1;
   IF first_checkout=NEW.checkout_id THEN
    event:=order_schema.enqueue_referral_event('checkout/'||NEW.checkout_id||'/first','checkout.first_qualifying_delivered',NEW.checkout_id,NEW.delivery_status_observed_at,
     jsonb_build_object('checkoutId',NEW.checkout_id,'buyerUserId',NEW.customer_identity_id,'firstQualifyingDelivered',true,'confirmedAt',NEW.delivery_status_observed_at,'evidenceRef','order-history/'||NEW.checkout_id));
    INSERT INTO order_schema.referral_first_checkout(buyer_id,checkout_id,evidence_ref,event_id,confirmed_at) VALUES(NEW.customer_identity_id,NEW.checkout_id,'order-history/'||NEW.checkout_id,event,NEW.delivery_status_observed_at);
   END IF;
  END IF;
 END IF;
 -- The currently implemented source refund contract supports the entire chef-order amount.
 -- A partial/gross refund never invents a food-only allocation.
 IF NEW.status='REFUNDED' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.refund_requested_amount IS DISTINCT FROM NEW.grand_total OR NEW.refund_completed_at IS NULL OR NEW.refund_status_event_id IS NULL THEN
   INSERT INTO order_schema.referral_source_exception(chef_order_id,source_event_id,reason)
    VALUES(NEW.id,COALESCE(NEW.refund_status_event_id,gen_random_uuid()),'FOOD_REFUND_ALLOCATION_REVIEW_REQUIRED') ON CONFLICT DO NOTHING;
   RETURN NULL; -- Preserve the existing refund update. Finance's observation refuses unallocated refunds.
  END IF;
  SELECT bool_and(COALESCE(o.status='REFUNDED' AND o.refund_requested_amount=o.grand_total,false)) INTO prior_refunded
   FROM order_schema.customer_order o WHERE o.checkout_id=NEW.checkout_id;
  event:=order_schema.enqueue_referral_event('order/'||NEW.id||'/refund/full','order.refunded',NEW.id,NEW.refund_completed_at,
   jsonb_build_object('chefOrderId',NEW.id,'version',1,'cumulativeFoodRefundPaise',(NEW.food_subtotal*100)::bigint::text,
    'fullCheckoutRefund',COALESCE(prior_refunded,false),'reasonRef','order-refund-event/'||NEW.refund_status_event_id));
 END IF;
 RETURN NULL;
END;$$;
CREATE TRIGGER referral_lifecycle_outbox AFTER UPDATE ON order_schema.customer_order
 FOR EACH ROW EXECUTE FUNCTION order_schema.publish_referral_lifecycle();
