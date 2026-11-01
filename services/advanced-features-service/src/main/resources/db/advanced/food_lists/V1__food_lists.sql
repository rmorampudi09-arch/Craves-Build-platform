CREATE TABLE adv_food_lists.food_list (
    id          uuid         PRIMARY KEY,
    owner_id    uuid         NOT NULL,
    name        varchar(60)  NOT NULL,
    description varchar(280),
    item_count  integer      NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    version     bigint       NOT NULL DEFAULT 0,
    created_at  timestamptz  NOT NULL,
    updated_at  timestamptz  NOT NULL
);
CREATE UNIQUE INDEX food_list_owner_name_uq ON adv_food_lists.food_list (owner_id, lower(name));
CREATE INDEX food_list_owner_updated_idx ON adv_food_lists.food_list (owner_id, updated_at DESC, id);

CREATE TABLE adv_food_lists.food_list_item (
    list_id        uuid         NOT NULL REFERENCES adv_food_lists.food_list (id) ON DELETE CASCADE,
    menu_item_id   uuid         NOT NULL,
    note           varchar(140),
    position       integer      NOT NULL,
    item_name      varchar(200),
    kitchen_id     uuid,
    added_at       timestamptz  NOT NULL,
    PRIMARY KEY (list_id, menu_item_id)
);
CREATE INDEX food_list_item_position_idx ON adv_food_lists.food_list_item (list_id, position);

-- A share link stores only the SHA-256 of its token; one active link per list.
CREATE TABLE adv_food_lists.food_list_share (
    id          uuid         PRIMARY KEY,
    list_id     uuid         NOT NULL REFERENCES adv_food_lists.food_list (id) ON DELETE CASCADE,
    token_hash  char(64)     NOT NULL UNIQUE,
    created_by  uuid         NOT NULL,
    created_at  timestamptz  NOT NULL,
    expires_at  timestamptz,
    revoked_at  timestamptz,
    view_count  bigint       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX food_list_share_active_uq ON adv_food_lists.food_list_share (list_id) WHERE revoked_at IS NULL;
