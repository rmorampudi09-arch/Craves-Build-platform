-- E14 party and bulk orders: a customer asks a kitchen for a large order for an event, the chef quotes, the customer accepts.
-- The rules (minimum portions, lead time, how far ahead, deposit share) are entered by staff; each change is a new version and
-- nothing is seeded, so bulk orders stay closed until staff set them. Placing and paying the order is M24 (order-service).
CREATE TABLE adv_bulk_orders.policy (
    version          bigint        PRIMARY KEY,
    min_portions     integer       NOT NULL CHECK (min_portions BETWEEN 1 AND 10000),
    min_lead_hours   integer       NOT NULL CHECK (min_lead_hours BETWEEN 0 AND 720),
    max_days_ahead   integer       NOT NULL CHECK (max_days_ahead BETWEEN 1 AND 365),
    deposit_percent  integer       NOT NULL CHECK (deposit_percent BETWEEN 0 AND 100),
    created_by       uuid          NOT NULL,
    created_at       timestamptz   NOT NULL
);

-- lines: [{menuItemId, name, quantity, listPricePaise, unitPricePaise}]; names and list prices are snapshots from Catalog.
-- customer_id is the nil UUID after the customer erased their data (an accepted order stays visible to the chef, without notes).
CREATE TABLE adv_bulk_orders.request (
    id                 uuid           PRIMARY KEY,
    customer_id        uuid           NOT NULL,
    kitchen_id         uuid           NOT NULL,
    event_at           timestamptz    NOT NULL,
    guests             integer        CHECK (guests BETWEEN 1 AND 10000),
    notes              varchar(500),
    lines              jsonb          NOT NULL,
    status             varchar(9)     NOT NULL CHECK (status IN ('REQUESTED', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    policy_version     bigint         NOT NULL REFERENCES adv_bulk_orders.policy (version),
    total_paise        bigint         CHECK (total_paise >= 1),
    deposit_paise      bigint         CHECK (deposit_paise >= 0),
    deposit_percent    integer        CHECK (deposit_percent BETWEEN 0 AND 100),
    quote_valid_until  timestamptz,
    quote_note         varchar(500),
    decline_reason     varchar(300),
    version            bigint         NOT NULL,
    created_at         timestamptz    NOT NULL,
    updated_at         timestamptz    NOT NULL
);
CREATE INDEX request_customer_idx ON adv_bulk_orders.request (customer_id, created_at DESC);
CREATE INDEX request_kitchen_idx ON adv_bulk_orders.request (kitchen_id, created_at DESC);
