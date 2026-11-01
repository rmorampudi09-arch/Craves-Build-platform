-- R16 item 11: order-service's ORDER_CANCELLED, and cancelling the Borzo or Pidge courier booked for an order Craves no
-- longer delivers. Two new tables, no foreign keys (nothing locks a busy table): older code never reads them.
SET LOCAL lock_timeout = '5s';

-- One row per chef order order-service cancelled (ORDER_CANCELLED, read by DeliveryServiceBusProcessors). This, or a
-- refund for the order, is the cancellation signal (DeliveryCommandRepository.CANCELLED_ORDER): its delivery command books
-- nobody, no rider can accept it, the dispatch tick ends its trip and a courier already booked is cancelled.
CREATE TABLE IF NOT EXISTS delivery_schema.order_cancelled (
    chef_sub_order_id UUID        PRIMARY KEY,
    reason            TEXT        NOT NULL,
    cancelled_at      TIMESTAMPTZ NOT NULL,
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per Borzo or Pidge booking Craves cancels (FleetCourierCancel): the intent, why (the order was cancelled, or ops
-- cancelled the delivery), and each attempt, stored before the courier is called; then the result. requested_by: the
-- last admin whose cancel called the courier (ops calls it before its audited transaction); NULL when no admin did (the
-- ORDER_CANCELLED job). alerted_at: ops was told to cancel it by hand (FLEET_COURIER_CANCEL_FAILED).
CREATE TABLE IF NOT EXISTS delivery_schema.courier_cancel (
    provider_id          VARCHAR(80)  NOT NULL,
    provider_delivery_id VARCHAR(200) NOT NULL,
    chef_sub_order_id    UUID         NOT NULL,
    reason               VARCHAR(40)  NOT NULL CHECK (reason IN ('ORDER_CANCELLED', 'OPS_CANCELLED')),
    requested_by         UUID,
    requested_by_name    VARCHAR(200),
    requested_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    attempts             INTEGER      NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_attempt_at      TIMESTAMPTZ,
    last_error           TEXT,
    cancelled_at         TIMESTAMPTZ,
    alerted_at           TIMESTAMPTZ,
    PRIMARY KEY (provider_id, provider_delivery_id)
);
