-- E02 recovery: the kitchen and name of each favorited dish as Catalog last showed it, so an unavailable favorite can still be explained.
-- Public Catalog facts only; nothing about who saved it.
CREATE TABLE adv_saved_feed.dish_seen (
    menu_item_id  uuid          PRIMARY KEY,
    kitchen_id    uuid          NOT NULL,
    name          varchar(200),
    seen_at       timestamptz   NOT NULL
);
