-- E16 menu modifiers and meal-period menus. Option prices are set by each chef (integer paise, never negative);
-- the dish's base price always comes live from Catalog.
CREATE TABLE adv_menu_options.dish_options (
    menu_item_id  uuid         PRIMARY KEY,
    chef_id       uuid         NOT NULL,
    kitchen_id    uuid         NOT NULL,
    option_groups jsonb        NOT NULL DEFAULT '[]'::jsonb,
    meal_periods  text[]       NOT NULL DEFAULT '{}',
    version       bigint       NOT NULL,
    updated_at    timestamptz  NOT NULL
);
CREATE INDEX dish_options_kitchen_idx ON adv_menu_options.dish_options (kitchen_id);

-- The hours of each meal a kitchen serves, in India time; a window may cross midnight (ends_at < starts_at).
CREATE TABLE adv_menu_options.meal_period (
    kitchen_id  uuid         NOT NULL,
    period      varchar(10)  NOT NULL CHECK (period IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER', 'LATE_NIGHT')),
    starts_at   time         NOT NULL,
    ends_at     time         NOT NULL CHECK (ends_at <> starts_at),
    days        text[]       NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7),
    chef_id     uuid         NOT NULL,
    updated_at  timestamptz  NOT NULL,
    PRIMARY KEY (kitchen_id, period)
);
