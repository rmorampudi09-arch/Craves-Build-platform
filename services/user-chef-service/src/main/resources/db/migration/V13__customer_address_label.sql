-- V13__customer_address_name.sql was never applied. The approved contract
-- stores custom display labels in the existing column, without address_name.
ALTER TABLE customer_address DROP CONSTRAINT IF EXISTS ck_customer_address_label;
ALTER TABLE customer_address ALTER COLUMN address_label TYPE VARCHAR(80);

ALTER TABLE customer_address
    ADD CONSTRAINT ck_customer_address_label
    CHECK (length(btrim(address_label)) > 0 AND address_label = btrim(address_label));

COMMENT ON COLUMN customer_address.address_label IS
    'Display label: reserved HOME/WORK, historical OTHER, or trimmed custom text up to 80 characters.';
