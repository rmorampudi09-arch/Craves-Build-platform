-- E03 remembered taste choices: what a signed-in person asked Craves to remember (personal data: covered by
-- the my-taste-data export and erase through PersonalDataContributor).
CREATE TABLE adv_taste_memory.profile (
    person_id   uuid          PRIMARY KEY,
    spice       varchar(8)    CHECK (spice IN ('MILD', 'MEDIUM', 'SPICY')),
    oil         varchar(8)    CHECK (oil IN ('LESS', 'REGULAR')),
    note        varchar(200),
    updated_at  timestamptz   NOT NULL
);

CREATE TABLE adv_taste_memory.dish_memory (
    person_id     uuid          NOT NULL,
    menu_item_id  uuid          NOT NULL,
    choice_ids    uuid[]        NOT NULL DEFAULT '{}' CHECK (cardinality(choice_ids) <= 50),
    spice         varchar(8)    CHECK (spice IN ('MILD', 'MEDIUM', 'SPICY')),
    oil           varchar(8)    CHECK (oil IN ('LESS', 'REGULAR')),
    note          varchar(200),
    updated_at    timestamptz   NOT NULL,
    PRIMARY KEY (person_id, menu_item_id)
);
CREATE INDEX dish_memory_recent_idx ON adv_taste_memory.dish_memory (person_id, updated_at DESC, menu_item_id DESC);
