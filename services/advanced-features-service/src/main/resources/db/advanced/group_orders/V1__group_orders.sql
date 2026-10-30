CREATE TABLE adv_group_orders.group_order (
    id               uuid         PRIMARY KEY,
    host_id          uuid         NOT NULL,
    kitchen_id       uuid         NOT NULL,
    title            varchar(60)  NOT NULL,
    join_code        char(8)      NOT NULL UNIQUE,
    status           varchar(16)  NOT NULL CHECK (status IN ('OPEN', 'LOCKED', 'CHECKED_OUT', 'CANCELLED')),
    join_until       timestamptz  NOT NULL,
    max_participants integer      NOT NULL CHECK (max_participants BETWEEN 2 AND 50),
    version          bigint       NOT NULL DEFAULT 0,
    created_at       timestamptz  NOT NULL,
    updated_at       timestamptz  NOT NULL,
    locked_at        timestamptz,
    closed_at        timestamptz
);
CREATE INDEX group_order_host_idx ON adv_group_orders.group_order (host_id, created_at DESC);
CREATE INDEX group_order_status_idx ON adv_group_orders.group_order (status, join_until);

CREATE TABLE adv_group_orders.group_participant (
    group_id       uuid         NOT NULL REFERENCES adv_group_orders.group_order (id) ON DELETE CASCADE,
    participant_id uuid         NOT NULL,
    display_name   varchar(40)  NOT NULL,
    role           varchar(8)   NOT NULL CHECK (role IN ('HOST', 'MEMBER')),
    joined_at      timestamptz  NOT NULL,
    removed_at     timestamptz,
    PRIMARY KEY (group_id, participant_id)
);
CREATE INDEX group_participant_member_idx ON adv_group_orders.group_participant (participant_id, joined_at DESC);

CREATE TABLE adv_group_orders.group_item (
    group_id         uuid          NOT NULL,
    participant_id   uuid          NOT NULL,
    menu_item_id     uuid          NOT NULL,
    quantity         integer       NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    note             varchar(140),
    item_name        varchar(200)  NOT NULL,
    unit_price_paise bigint        NOT NULL CHECK (unit_price_paise >= 0),
    updated_at       timestamptz   NOT NULL,
    PRIMARY KEY (group_id, participant_id, menu_item_id),
    FOREIGN KEY (group_id, participant_id)
        REFERENCES adv_group_orders.group_participant (group_id, participant_id) ON DELETE CASCADE
);

CREATE TABLE adv_group_orders.group_checkout (
    group_id        uuid         PRIMARY KEY REFERENCES adv_group_orders.group_order (id) ON DELETE CASCADE,
    host_id         uuid         NOT NULL,
    lines           jsonb        NOT NULL,
    subtotal_paise  bigint       NOT NULL,
    applied_to_cart boolean      NOT NULL,
    created_at      timestamptz  NOT NULL
);
