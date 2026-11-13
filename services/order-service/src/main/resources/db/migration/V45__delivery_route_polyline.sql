-- Road path kitchen to drop for the customer's map; latest only.
ALTER TABLE order_schema.customer_order ADD COLUMN IF NOT EXISTS delivery_route_polyline TEXT;
