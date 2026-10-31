-- Chef-declared ingredient, allergen and nutrition facts with provenance and staff verification.
CREATE TABLE adv_food_facts.menu_item_facts (
    menu_item_id       uuid          PRIMARY KEY,
    chef_id            uuid          NOT NULL,
    kitchen_id         uuid,
    status             varchar(12)   NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED')),
    content            jsonb         NOT NULL,
    version            bigint        NOT NULL,
    submitted_at       timestamptz,
    reviewed_by        uuid,
    reviewed_at        timestamptz,
    review_note        varchar(300),
    verified_snapshot  jsonb,
    published          jsonb,
    published_label    varchar(16)   CHECK (published_label IN ('CHEF_DECLARED', 'VERIFIED')),
    published_at       timestamptz,
    updated_at         timestamptz   NOT NULL
);
CREATE INDEX menu_item_facts_queue_idx ON adv_food_facts.menu_item_facts (status, submitted_at, menu_item_id);
CREATE INDEX menu_item_facts_chef_idx ON adv_food_facts.menu_item_facts (chef_id);
CREATE INDEX menu_item_facts_published_idx ON adv_food_facts.menu_item_facts (menu_item_id) WHERE published IS NOT NULL;

CREATE TABLE adv_food_facts.facts_revision (
    id           bigserial    PRIMARY KEY,
    menu_item_id uuid         NOT NULL,
    version      bigint       NOT NULL,
    action       varchar(16)  NOT NULL,
    actor_id     uuid         NOT NULL,
    payload      jsonb        NOT NULL,
    created_at   timestamptz  NOT NULL
);
CREATE INDEX facts_revision_item_idx ON adv_food_facts.facts_revision (menu_item_id, id DESC);
