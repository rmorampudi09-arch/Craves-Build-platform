ALTER TABLE customer_address
    ADD COLUMN address_name VARCHAR(80);

COMMENT ON COLUMN customer_address.address_name IS
    'Customer-defined name for addresses saved with address_label OTHER.';
