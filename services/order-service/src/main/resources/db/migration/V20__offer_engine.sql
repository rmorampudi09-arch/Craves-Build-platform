CREATE TABLE IF NOT EXISTS order_schema.offer_definition (
    id                      UUID PRIMARY KEY,
    code                    VARCHAR(40) NOT NULL,
    title                   VARCHAR(160) NOT NULL,
    description             VARCHAR(500),
    discount_type           VARCHAR(16) NOT NULL,
    discount_value          NUMERIC(12,2) NOT NULL,
    max_discount_amount     NUMERIC(12,2),
    minimum_food_subtotal   NUMERIC(12,2),
    currency                VARCHAR(3) NOT NULL DEFAULT 'INR',
    starts_at               TIMESTAMPTZ,
    ends_at                 TIMESTAMPTZ,
    active                  BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_offer_discount_type CHECK (discount_type IN ('FLAT', 'PERCENT')),
    CONSTRAINT chk_offer_discount_value CHECK (discount_value > 0),
    CONSTRAINT chk_offer_percent_value CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
    CONSTRAINT chk_offer_max_discount CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
    CONSTRAINT chk_offer_minimum_subtotal CHECK (minimum_food_subtotal IS NULL OR minimum_food_subtotal >= 0),
    CONSTRAINT chk_offer_window CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_offer_definition_code_upper
    ON order_schema.offer_definition (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_offer_definition_applicable
    ON order_schema.offer_definition (currency, active, starts_at, ends_at, minimum_food_subtotal)
    WHERE active = true;

COMMENT ON TABLE order_schema.offer_definition IS
    'Server-authoritative offer definitions. No offer values are seeded by this migration; product-approved values must be configured separately.';
