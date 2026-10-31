-- E15 corporate and team meals. Companies, their billing terms and the share of meals they pay are entered by Craves staff
-- as agreed with each company; nothing is seeded or defaulted, so a company pays for nothing until staff set its terms.
-- Checkout honours a company charge only through M24 (order-service hook, flag default off).
CREATE TABLE adv_corporate_meals.company (
    id                        uuid          PRIMARY KEY,
    name                      varchar(120)  NOT NULL,
    seat_limit                integer       NOT NULL CHECK (seat_limit BETWEEN 1 AND 100000),
    status                    varchar(9)    NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    share_percent             integer       CHECK (share_percent BETWEEN 1 AND 100),
    max_per_meal_paise        bigint        CHECK (max_per_meal_paise BETWEEN 1 AND 10000000),
    meals_per_day             integer       CHECK (meals_per_day BETWEEN 1 AND 5),
    meal_days                 text[]        CHECK (cardinality(meal_days) BETWEEN 1 AND 7),
    window_start              time,
    window_end                time,
    monthly_budget_paise      bigint        CHECK (monthly_budget_paise >= 1),
    member_monthly_cap_paise  bigint        CHECK (member_monthly_cap_paise >= 1),
    payment_terms_days        integer       CHECK (payment_terms_days BETWEEN 0 AND 120),
    terms_set_at              timestamptz,
    version                   bigint        NOT NULL,
    created_by                uuid          NOT NULL,
    updated_by                uuid          NOT NULL,
    created_at                timestamptz   NOT NULL,
    updated_at                timestamptz   NOT NULL,
    -- Terms are set all together (the per-member cap is optional) or not at all.
    CHECK ((terms_set_at IS NULL AND share_percent IS NULL AND max_per_meal_paise IS NULL AND meals_per_day IS NULL AND meal_days IS NULL
            AND window_start IS NULL AND window_end IS NULL AND monthly_budget_paise IS NULL AND member_monthly_cap_paise IS NULL
            AND payment_terms_days IS NULL)
        OR (terms_set_at IS NOT NULL AND share_percent IS NOT NULL AND max_per_meal_paise IS NOT NULL AND meals_per_day IS NOT NULL
            AND meal_days IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end
            AND monthly_budget_paise IS NOT NULL AND payment_terms_days IS NOT NULL))
);

-- One company per person at a time. display_name is how the person chose to appear to their company.
CREATE TABLE adv_corporate_meals.member (
    person_id     uuid          PRIMARY KEY,
    company_id    uuid          NOT NULL REFERENCES adv_corporate_meals.company (id),
    role          varchar(7)    NOT NULL CHECK (role IN ('MEMBER', 'MANAGER')),
    display_name  varchar(60)   NOT NULL,
    joined_at     timestamptz   NOT NULL
);
CREATE INDEX member_company_idx ON adv_corporate_meals.member (company_id, joined_at, person_id);

-- Invite codes are shown once to the manager and stored only as SHA-256.
CREATE TABLE adv_corporate_meals.invite (
    id          uuid          PRIMARY KEY,
    company_id  uuid          NOT NULL REFERENCES adv_corporate_meals.company (id),
    code_hash   char(64)      NOT NULL UNIQUE,
    max_uses    integer       NOT NULL CHECK (max_uses BETWEEN 1 AND 100000),
    uses        integer       NOT NULL CHECK (uses BETWEEN 0 AND max_uses),
    expires_at  timestamptz   NOT NULL,
    revoked_at  timestamptz,
    created_by  uuid          NOT NULL,
    created_at  timestamptz   NOT NULL
);
CREATE INDEX invite_company_idx ON adv_corporate_meals.invite (company_id, created_at DESC);

-- What a company pays towards one order. Committed = confirmed + reserved and not expired (no sweeper needed).
-- person_id is the nil UUID after the person erased their data; the amount stays on the company's statement.
CREATE TABLE adv_corporate_meals.charge (
    id                   uuid          PRIMARY KEY,
    company_id           uuid          NOT NULL REFERENCES adv_corporate_meals.company (id),
    person_id            uuid          NOT NULL,
    member_name          varchar(60),
    kind                 varchar(9)    NOT NULL CHECK (kind IN ('MEAL', 'TEAM_MEAL')),
    headcount            integer       CHECK (headcount BETWEEN 2 AND 100000),
    india_date           date          NOT NULL,
    subtotal_paise       bigint        NOT NULL CHECK (subtotal_paise >= 1),
    company_share_paise  bigint        NOT NULL CHECK (company_share_paise >= 1 AND company_share_paise <= subtotal_paise),
    status               varchar(9)    NOT NULL CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED', 'VOIDED')),
    order_id             uuid,
    expires_at           timestamptz   NOT NULL,
    created_at           timestamptz   NOT NULL,
    updated_at           timestamptz   NOT NULL,
    CHECK ((kind = 'TEAM_MEAL') = (headcount IS NOT NULL))
);
-- Budget counts read only rows that still count, so released and voided history never slows a reservation.
CREATE INDEX charge_company_day_idx ON adv_corporate_meals.charge (company_id, india_date) INCLUDE (company_share_paise)
    WHERE status IN ('RESERVED', 'CONFIRMED');
CREATE INDEX charge_person_idx ON adv_corporate_meals.charge (person_id, company_id, india_date);
CREATE INDEX charge_statement_idx ON adv_corporate_meals.charge (company_id, india_date) WHERE status = 'CONFIRMED';
-- One company payment per order.
CREATE UNIQUE INDEX charge_order_idx ON adv_corporate_meals.charge (order_id) WHERE status = 'CONFIRMED';
