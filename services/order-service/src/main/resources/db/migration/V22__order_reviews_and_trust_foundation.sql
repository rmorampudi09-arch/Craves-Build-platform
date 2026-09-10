-- Review and home-chef trust foundation.
-- No tag taxonomy, ranking weight, compensation rule, or moderation SLA is seeded here.
-- Those remain configurable/product-owned. Public reads include only explicitly PUBLISHED reviews.

CREATE TABLE order_schema.review_tag_definition (
    code VARCHAR(64) PRIMARY KEY,
    display_label VARCHAR(100) NOT NULL,
    dimension VARCHAR(40) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by_identity_id UUID NOT NULL,
    updated_by_identity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_review_tag_code CHECK (code ~ '^[A-Z0-9_]{1,64}$'),
    CONSTRAINT chk_review_tag_label CHECK (char_length(btrim(display_label)) BETWEEN 1 AND 100),
    CONSTRAINT chk_review_tag_dimension CHECK (dimension IN (
        'OVERALL', 'FOOD_TASTE', 'PORTION_VALUE', 'PACKAGING',
        'ACCURACY', 'CHEF_PREPARATION', 'DELIVERY'
    )),
    CONSTRAINT chk_review_tag_sort_order CHECK (sort_order BETWEEN -100000 AND 100000)
);

CREATE TABLE order_schema.order_review (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES order_schema.customer_order(id) ON DELETE RESTRICT,
    customer_identity_id UUID NOT NULL,
    kitchen_id UUID NOT NULL,
    chef_identity_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_MODERATION',
    version INTEGER NOT NULL DEFAULT 1,
    overall_rating SMALLINT NOT NULL,
    food_taste_rating SMALLINT,
    portion_value_rating SMALLINT,
    packaging_rating SMALLINT,
    accuracy_rating SMALLINT,
    chef_preparation_rating SMALLINT,
    delivery_rating SMALLINT,
    review_text VARCHAR(2000),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    hidden_at TIMESTAMPTZ,
    CONSTRAINT uk_order_review_customer_order UNIQUE (order_id, customer_identity_id),
    CONSTRAINT chk_order_review_status CHECK (status IN (
        'PENDING_MODERATION', 'PUBLISHED', 'HIDDEN', 'REJECTED'
    )),
    CONSTRAINT chk_order_review_version CHECK (version > 0),
    CONSTRAINT chk_order_review_overall CHECK (overall_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_food_taste CHECK (food_taste_rating IS NULL OR food_taste_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_portion_value CHECK (portion_value_rating IS NULL OR portion_value_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_packaging CHECK (packaging_rating IS NULL OR packaging_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_accuracy CHECK (accuracy_rating IS NULL OR accuracy_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_chef_preparation CHECK (chef_preparation_rating IS NULL OR chef_preparation_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_delivery CHECK (delivery_rating IS NULL OR delivery_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_order_review_text CHECK (review_text IS NULL OR char_length(review_text) <= 2000)
);

CREATE TABLE order_schema.order_review_tag (
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE CASCADE,
    tag_code VARCHAR(64) NOT NULL REFERENCES order_schema.review_tag_definition(code) ON DELETE RESTRICT,
    PRIMARY KEY (review_id, tag_code)
);

CREATE TABLE order_schema.order_review_media (
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL,
    position SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, media_asset_id),
    CONSTRAINT uk_order_review_media_position UNIQUE (review_id, position),
    CONSTRAINT chk_order_review_media_position CHECK (position BETWEEN 0 AND 4)
);

CREATE TABLE order_schema.order_review_revision (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    status_snapshot VARCHAR(32) NOT NULL,
    overall_rating SMALLINT NOT NULL,
    food_taste_rating SMALLINT,
    portion_value_rating SMALLINT,
    packaging_rating SMALLINT,
    accuracy_rating SMALLINT,
    chef_preparation_rating SMALLINT,
    delivery_rating SMALLINT,
    review_text VARCHAR(2000),
    tag_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    media_asset_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    actor_identity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_order_review_revision UNIQUE (review_id, revision_number)
);

CREATE TABLE order_schema.order_review_moderation_audit (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE RESTRICT,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    actor_identity_id UUID NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_order_review_moderation_reason CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500)
);

CREATE TABLE order_schema.order_review_helpful_vote (
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE CASCADE,
    voter_identity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, voter_identity_id)
);

CREATE TABLE order_schema.order_review_report (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES order_schema.order_review(id) ON DELETE RESTRICT,
    reporter_identity_id UUID NOT NULL,
    reason_code VARCHAR(64) NOT NULL,
    detail VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_order_review_reporter UNIQUE (review_id, reporter_identity_id),
    CONSTRAINT chk_order_review_report_reason CHECK (reason_code ~ '^[A-Z0-9_]{1,64}$'),
    CONSTRAINT chk_order_review_report_detail CHECK (detail IS NULL OR char_length(detail) <= 1000)
);

CREATE INDEX idx_order_review_public_kitchen_cursor
    ON order_schema.order_review (kitchen_id, published_at DESC, id DESC)
    WHERE status = 'PUBLISHED';

CREATE INDEX idx_order_review_chef_cursor
    ON order_schema.order_review (chef_identity_id, published_at DESC, id DESC)
    WHERE status = 'PUBLISHED';

CREATE INDEX idx_order_review_customer_cursor
    ON order_schema.order_review (customer_identity_id, updated_at DESC, id DESC);

CREATE INDEX idx_order_review_moderation_queue
    ON order_schema.order_review (status, updated_at ASC, id ASC);

CREATE INDEX idx_order_review_tag_active
    ON order_schema.review_tag_definition (active, dimension, sort_order, code);

CREATE INDEX idx_order_review_report_queue
    ON order_schema.order_review_report (created_at DESC, id DESC);

CREATE INDEX idx_order_review_moderation_audit_review
    ON order_schema.order_review_moderation_audit (review_id, created_at ASC, id ASC);

COMMENT ON TABLE order_schema.order_review IS
    'Customer review for one owned delivered order; public visibility requires explicit moderation publication.';
COMMENT ON COLUMN order_schema.order_review.delivery_rating IS
    'Delivery experience rating kept separate from chef/food dimensions; it must not be silently attributed to the chef.';
COMMENT ON TABLE order_schema.review_tag_definition IS
    'Configurable tag allow-list. No product taxonomy is seeded by engineering.';
