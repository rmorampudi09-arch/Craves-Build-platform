-- E05 small batches with portion holds, and E20 the chef's live extra preparation time.
-- Remaining portions = portions - confirmed holds - held holds that have not expired (no sweeper needed).
CREATE TABLE adv_kitchen_capacity.batch (
    id            uuid          PRIMARY KEY,
    menu_item_id  uuid          NOT NULL,
    kitchen_id    uuid          NOT NULL,
    chef_id       uuid          NOT NULL,
    service_date  date          NOT NULL,
    portions      integer       NOT NULL CHECK (portions BETWEEN 1 AND 1000),
    order_cutoff  timestamptz,
    ready_at      timestamptz,
    status        varchar(6)    NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    version       bigint        NOT NULL,
    created_at    timestamptz   NOT NULL,
    updated_at    timestamptz   NOT NULL
);
CREATE INDEX batch_item_date_idx ON adv_kitchen_capacity.batch (menu_item_id, service_date);
CREATE INDEX batch_kitchen_date_idx ON adv_kitchen_capacity.batch (kitchen_id, service_date);

-- person_id is the nil UUID after the person erased their data (the portions stay counted).
CREATE TABLE adv_kitchen_capacity.hold (
    id          uuid          PRIMARY KEY,
    batch_id    uuid          NOT NULL REFERENCES adv_kitchen_capacity.batch (id),
    person_id   uuid          NOT NULL,
    portions    integer       NOT NULL CHECK (portions BETWEEN 1 AND 50),
    status      varchar(9)    NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED')),
    order_id    uuid,
    expires_at  timestamptz   NOT NULL,
    created_at  timestamptz   NOT NULL,
    updated_at  timestamptz   NOT NULL
);
CREATE INDEX hold_batch_idx ON adv_kitchen_capacity.hold (batch_id, status);
CREATE INDEX hold_person_idx ON adv_kitchen_capacity.hold (person_id, created_at DESC);

CREATE TABLE adv_kitchen_capacity.kitchen_load (
    kitchen_id          uuid          PRIMARY KEY,
    chef_id             uuid          NOT NULL,
    extra_prep_minutes  integer       NOT NULL CHECK (extra_prep_minutes BETWEEN 0 AND 180),
    until               timestamptz   NOT NULL,
    updated_at          timestamptz   NOT NULL
);
