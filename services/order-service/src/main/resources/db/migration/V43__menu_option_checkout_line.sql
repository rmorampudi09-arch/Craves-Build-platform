-- M24c slice B: the M05 option prices a checkout line was quoted at (base + chosen options), frozen for Finance and the chef.
CREATE TABLE order_schema.menu_option_checkout_line (
 order_item_id UUID PRIMARY KEY REFERENCES order_schema.order_item(id),
 checkout_id UUID NOT NULL REFERENCES order_schema.checkout(id),
 chef_order_id UUID NOT NULL REFERENCES order_schema.customer_order(id),
 menu_item_id UUID NOT NULL,
 quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
 base_paise BIGINT NOT NULL CHECK (base_paise >= 0),
 unit_paise BIGINT NOT NULL CHECK (unit_paise > 0),
 options_version BIGINT NOT NULL,
 meal_period VARCHAR(40),
 choices JSONB NOT NULL CHECK (jsonb_typeof(choices) = 'array'),
 quoted_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (chef_order_id, menu_item_id)
);
CREATE INDEX menu_option_checkout_line_checkout ON order_schema.menu_option_checkout_line(checkout_id);
CREATE FUNCTION order_schema.guard_menu_option_checkout_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Quoted option prices are immutable' USING ERRCODE='55000';
END; $$;
CREATE TRIGGER menu_option_checkout_line_guard BEFORE UPDATE OR DELETE ON order_schema.menu_option_checkout_line FOR EACH ROW EXECUTE FUNCTION order_schema.guard_menu_option_checkout_line();
CREATE TRIGGER menu_option_checkout_line_no_truncate BEFORE TRUNCATE ON order_schema.menu_option_checkout_line FOR EACH STATEMENT EXECUTE FUNCTION order_schema.guard_menu_option_checkout_line();
