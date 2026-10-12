SET LOCAL lock_timeout = '5s';

-- A meal-plan order the chef declined (or never accepted) is reported back so its day is added to the end of the plan.
ALTER TABLE order_schema.subscription_order_callback_outbox
    ADD COLUMN chef_declined BOOLEAN NOT NULL DEFAULT FALSE;
