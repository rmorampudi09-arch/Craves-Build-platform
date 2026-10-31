-- E23 promotions and coupons. Every commercial value (discount, cap, minimum order, budget, limits, dates, funding) is
-- entered by Craves staff through the admin API; nothing is seeded. Checkout honours a redemption only through M24.
-- Committed budget = discounts of confirmed redemptions + reserved ones that have not expired (no sweeper needed).
CREATE TABLE adv_promotions.promotion (
    id                  uuid          PRIMARY KEY,
    name                varchar(80)   NOT NULL,
    title               varchar(80)   NOT NULL,
    description         varchar(300),
    code                varchar(20)   UNIQUE CHECK (code ~ '^[A-Z0-9]{4,20}$'),
    discount_kind       varchar(7)    NOT NULL CHECK (discount_kind IN ('PERCENT', 'FLAT')),
    percent_off         integer       CHECK (percent_off BETWEEN 1 AND 100),
    flat_paise          bigint        CHECK (flat_paise >= 1),
    max_discount_paise  bigint        CHECK (max_discount_paise >= 1),
    min_order_paise     bigint        NOT NULL CHECK (min_order_paise >= 0),
    kitchen_ids         uuid[]        NOT NULL,
    funded_by           varchar(7)    NOT NULL CHECK (funded_by IN ('CRAVES', 'KITCHEN')),
    per_person_limit    integer       NOT NULL CHECK (per_person_limit BETWEEN 1 AND 100),
    total_budget_paise  bigint        NOT NULL CHECK (total_budget_paise >= 1),
    max_redemptions     integer       CHECK (max_redemptions >= 1),
    starts_at           timestamptz   NOT NULL,
    ends_at             timestamptz   NOT NULL,
    listed              boolean       NOT NULL,
    status              varchar(7)    NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
    activated_at        timestamptz,
    version             bigint        NOT NULL,
    created_by          uuid          NOT NULL,
    updated_by          uuid          NOT NULL,
    created_at          timestamptz   NOT NULL,
    updated_at          timestamptz   NOT NULL,
    CHECK (ends_at > starts_at),
    CHECK ((discount_kind = 'PERCENT' AND percent_off IS NOT NULL AND flat_paise IS NULL)
        OR (discount_kind = 'FLAT' AND flat_paise IS NOT NULL AND percent_off IS NULL AND max_discount_paise IS NULL)),
    CHECK (funded_by = 'CRAVES' OR cardinality(kitchen_ids) >= 1)
);
CREATE INDEX promotion_status_idx ON adv_promotions.promotion (status, ends_at);

-- person_id is the nil UUID after the person erased their data (the discount stays counted against the budget).
CREATE TABLE adv_promotions.redemption (
    id                       uuid          PRIMARY KEY,
    promotion_id             uuid          NOT NULL REFERENCES adv_promotions.promotion (id),
    person_id                uuid          NOT NULL,
    discount_paise           bigint        NOT NULL CHECK (discount_paise >= 1),
    subtotal_paise           bigint        NOT NULL CHECK (subtotal_paise >= 0),
    eligible_subtotal_paise  bigint        NOT NULL CHECK (eligible_subtotal_paise >= 0),
    status                   varchar(9)    NOT NULL CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED', 'VOIDED')),
    order_id                 uuid,
    expires_at               timestamptz   NOT NULL,
    created_at               timestamptz   NOT NULL,
    updated_at               timestamptz   NOT NULL
);
CREATE INDEX redemption_promotion_idx ON adv_promotions.redemption (promotion_id, created_at DESC, id DESC);
CREATE INDEX redemption_person_idx ON adv_promotions.redemption (person_id, promotion_id);
-- Budget counts read only rows that still count, so released and lapsed history never slows a reservation.
CREATE INDEX redemption_reserved_idx ON adv_promotions.redemption (promotion_id, expires_at) INCLUDE (discount_paise) WHERE status = 'RESERVED';
CREATE INDEX redemption_confirmed_idx ON adv_promotions.redemption (promotion_id) INCLUDE (discount_paise) WHERE status = 'CONFIRMED';
-- One promotion per order: promotions never stack.
CREATE UNIQUE INDEX redemption_order_idx ON adv_promotions.redemption (order_id) WHERE status = 'CONFIRMED';
