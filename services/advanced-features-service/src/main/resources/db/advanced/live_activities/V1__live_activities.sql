-- E39 live order activity (iOS Live Activities / Dynamic Island): the activity push token the app registers for one of its own orders.
-- A token is personal data: ending the activity clears it, and my-taste-data erase deletes the rows.
CREATE TABLE adv_live_activities.activity (
    id           uuid          PRIMARY KEY,
    person_id    uuid          NOT NULL,
    order_id     uuid          NOT NULL,
    push_token   varchar(256),
    created_at   timestamptz   NOT NULL,
    updated_at   timestamptz   NOT NULL,
    ended_at     timestamptz,
    UNIQUE (person_id, order_id),
    CHECK ((ended_at IS NULL) = (push_token IS NOT NULL))
);
CREATE INDEX activity_order_live_idx ON adv_live_activities.activity (order_id) WHERE ended_at IS NULL;
