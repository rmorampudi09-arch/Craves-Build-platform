-- A person's choices about how their own taste data may be used. Absence means "not decided" (treated as no).
CREATE TABLE adv_taste_data.consent (
    person_id          uuid        PRIMARY KEY,
    personalization    boolean     NOT NULL,
    product_analytics  boolean     NOT NULL,
    updated_at         timestamptz NOT NULL
);

-- Proof that an erase request ran, without keeping any of the erased content.
CREATE TABLE adv_taste_data.erasure_receipt (
    id          uuid        PRIMARY KEY,
    person_id   uuid        NOT NULL,
    records     integer     NOT NULL,
    modules     text[]      NOT NULL,
    created_at  timestamptz NOT NULL
);
CREATE INDEX erasure_receipt_person_idx ON adv_taste_data.erasure_receipt (person_id, created_at DESC);
