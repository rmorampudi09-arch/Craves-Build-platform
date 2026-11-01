-- E17 order amendments and substitutions: changes to a placed order that the customer and the kitchen's chef agree to.
-- changes: [{orderItemId, kind, menuItemId, itemName, quantityBefore, quantityAfter, unitPricePaise, substituteMenuItemId,
-- substituteName, substituteUnitPricePaise, note, deltaPaise}]; prices are the order lines' own prices before order-wide discounts
-- (and Catalog's price of a substitute when proposed). Nothing here can raise an order's total; refunds and the order change itself
-- are M24 (order-service).
-- customer_id, proposer_id and answered_by are the nil UUID after that person erased their data.
CREATE TABLE adv_order_amendments.amendment (
    id                uuid          PRIMARY KEY,
    order_id          uuid          NOT NULL,
    seq               integer       NOT NULL CHECK (seq >= 1),
    kitchen_id        uuid          NOT NULL,
    customer_id       uuid          NOT NULL,
    proposed_by       varchar(8)    NOT NULL CHECK (proposed_by IN ('CUSTOMER', 'CHEF')),
    proposer_id       uuid          NOT NULL,
    changes           jsonb         NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) BETWEEN 1 AND 30),
    food_delta_paise  bigint        NOT NULL CHECK (food_delta_paise <= 0),
    note              varchar(300),
    status            varchar(9)    NOT NULL CHECK (status IN ('PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
    answer_note       varchar(300),
    answered_by       uuid,
    answered_at       timestamptz,
    expires_at        timestamptz   NOT NULL,
    version           bigint        NOT NULL,
    created_at        timestamptz   NOT NULL,
    updated_at        timestamptz   NOT NULL,
    -- The order's proposals in sequence (taken under the order's lock), so accepted changes replay in the order they were agreed.
    UNIQUE (order_id, seq)
);
CREATE INDEX amendment_customer_idx ON adv_order_amendments.amendment (customer_id, created_at DESC);
CREATE INDEX amendment_proposer_idx ON adv_order_amendments.amendment (proposer_id);
CREATE INDEX amendment_answered_by_idx ON adv_order_amendments.amendment (answered_by);
-- What a kitchen still has to answer: open customer proposals by expiry, so lapsed ones (never swept) are skipped by the index.
CREATE INDEX amendment_kitchen_waiting_idx ON adv_order_amendments.amendment (kitchen_id, expires_at)
    WHERE status = 'PROPOSED' AND proposed_by = 'CUSTOMER';
