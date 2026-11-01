-- E36 post-order partner offers. Staff enter every offer (Craves invents no partner terms); a customer's paid order unlocks them.
CREATE TABLE adv_partner_offers.offer (
    id             uuid           PRIMARY KEY,
    partner_name   varchar(80)    NOT NULL,
    title          varchar(120)   NOT NULL,
    description    varchar(1000)  NOT NULL,
    terms          varchar(2000)  NOT NULL,
    link_url       varchar(500)   NOT NULL CHECK (link_url LIKE 'https://%'),
    code           varchar(40),
    starts_at      timestamptz    NOT NULL,
    ends_at        timestamptz    NOT NULL,
    claim_limit    integer        CHECK (claim_limit IS NULL OR claim_limit > 0),
    claimed_count  integer        NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
    status         varchar(8)     NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
    version        bigint         NOT NULL,
    created_by     uuid           NOT NULL,
    updated_by     uuid           NOT NULL,
    created_at     timestamptz    NOT NULL,
    updated_at     timestamptz    NOT NULL,
    CHECK (ends_at > starts_at),
    CHECK (claim_limit IS NULL OR claimed_count <= claim_limit)
);
CREATE INDEX offer_live_idx ON adv_partner_offers.offer (ends_at) WHERE status = 'ACTIVE';

-- A person's claims are deleted when they erase their data; claimed_count keeps counting them against the offer's limit.
CREATE TABLE adv_partner_offers.claim (
    id          uuid         PRIMARY KEY,
    offer_id    uuid         NOT NULL REFERENCES adv_partner_offers.offer (id),
    person_id   uuid         NOT NULL,
    order_id    uuid         NOT NULL,
    claimed_at  timestamptz  NOT NULL,
    UNIQUE (offer_id, person_id)
);
CREATE INDEX claim_person_idx ON adv_partner_offers.claim (person_id);
