-- The rider app (com.cravesapp.rider) shares the Firebase project with the customer app.
-- Every token records its app, so the customer push path never reaches a rider phone and the reverse.

-- Fail fast instead of queueing behind the push worker and device registrations while the table is locked.
SET LOCAL lock_timeout = '5s';

ALTER TABLE notification_schema.push_device_registration
    ADD COLUMN app VARCHAR(20) NOT NULL DEFAULT 'customer',
    ADD CONSTRAINT ck_push_device_app CHECK (app IN ('customer', 'rider'));

COMMENT ON COLUMN notification_schema.push_device_registration.app IS
    'App that owns the token: customer (customer and chef app) or rider. The queued push worker sends only to customer.';
