-- Chef app order details: the customer's checkout note, the courier reported by the delivery provider,
-- and the moment the chef handed the food over. All nullable and additive; existing rows stay valid.

ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS customer_note VARCHAR(500),
    ADD COLUMN IF NOT EXISTS delivery_partner_name TEXT,
    ADD COLUMN IF NOT EXISTS delivery_partner_phone TEXT,
    ADD COLUMN IF NOT EXISTS delivery_partner_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS delivery_partner_pickup_eta_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS chef_handed_over_at TIMESTAMPTZ;

COMMENT ON COLUMN order_schema.customer_order.customer_note IS
    'Trimmed checkout note (max 500 characters). Shown only to the owning chef.';
COMMENT ON COLUMN order_schema.customer_order.delivery_partner_name IS
    'Latest courier details reported by the delivery provider. Shown only to the owning chef.';
COMMENT ON COLUMN order_schema.customer_order.chef_handed_over_at IS
    'When the owning chef confirmed handing the food to the courier. Set once; does not change order status.';
