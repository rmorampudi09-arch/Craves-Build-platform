CREATE TABLE IF NOT EXISTS customer_review (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL,
    customer_identity_id uuid NOT NULL,
    chef_identity_id uuid NOT NULL,
    kitchen_id uuid NOT NULL,
    menu_item_id uuid NULL,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title varchar(160),
    review_text text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_review_order_customer
    ON customer_review (order_id, customer_identity_id);

CREATE INDEX IF NOT EXISTS ix_customer_review_chef_created
    ON customer_review (chef_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_customer_review_menu_item_created
    ON customer_review (menu_item_id, created_at DESC)
    WHERE menu_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chef_rating_summary (
    chef_identity_id uuid PRIMARY KEY,
    review_count bigint NOT NULL DEFAULT 0,
    average_rating numeric(4,2),
    updated_at timestamptz NOT NULL DEFAULT now()
);
