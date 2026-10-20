-- The rider app (com.cravesapp.rider) shares the Firebase project with the customer app.
-- Every token records its app, so the customer push path never reaches a rider phone and the reverse.
ALTER TABLE notification_schema.push_device_registration
    ADD COLUMN app VARCHAR(20) NOT NULL DEFAULT 'customer',
    ADD CONSTRAINT ck_push_device_app CHECK (app IN ('customer', 'rider'));
