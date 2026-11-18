-- What each courier company charges Craves for a delivery, the courier invoices ops import to compare, and the billing
-- settings an admin keeps (CRAVES_DELIVERY_COURIER_CHARGE_ENABLED, default off: every table stays empty until then).
-- Records only: nothing here pays, refunds, charges or chooses a courier. New tables and views only.

CREATE OR REPLACE FUNCTION delivery_schema.courier_billing_refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

-- One row per charge event of a courier booking. A correction is a new row.
CREATE TABLE IF NOT EXISTS delivery_schema.courier_charge (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id          VARCHAR(80)  NOT NULL,
    -- The courier's own id of the booking: what its invoice lists.
    provider_delivery_id VARCHAR(200) NOT NULL,
    chef_sub_order_id    UUID         NOT NULL,
    order_id             UUID,
    delivery_job_id      UUID,
    -- BOOKING: the price the courier showed when the booking became the order's delivery. CANCEL: the price the courier
    -- showed once the booking was cancelled (it replaces the booking price). ADJUSTMENT: a later change, signed.
    kind                 VARCHAR(10)  NOT NULL,
    -- NULL: the courier's answer carried no price.
    amount_paise         BIGINT,
    currency             CHAR(3)      NOT NULL DEFAULT 'INR',
    source               VARCHAR(8)   NOT NULL,
    charged_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_courier_charge_kind CHECK (kind IN ('BOOKING', 'ADJUSTMENT', 'CANCEL')),
    CONSTRAINT ck_courier_charge_source CHECK (source IN ('API', 'WEBHOOK', 'INVOICE', 'MANUAL')),
    CONSTRAINT ck_courier_charge_currency CHECK (currency = 'INR'),
    CONSTRAINT ck_courier_charge_amount CHECK (kind = 'ADJUSTMENT' OR amount_paise >= 0)
);
-- A booking has one booking price and at most one price at cancel: writing either again changes nothing.
CREATE UNIQUE INDEX IF NOT EXISTS courier_charge_once
    ON delivery_schema.courier_charge (provider_id, provider_delivery_id, kind) WHERE kind IN ('BOOKING', 'CANCEL');
CREATE INDEX IF NOT EXISTS courier_charge_booking ON delivery_schema.courier_charge (provider_id, provider_delivery_id);
CREATE INDEX IF NOT EXISTS courier_charge_at ON delivery_schema.courier_charge (provider_id, charged_at);
CREATE OR REPLACE TRIGGER courier_charge_append_only BEFORE UPDATE OR DELETE ON delivery_schema.courier_charge
    FOR EACH ROW EXECUTE FUNCTION delivery_schema.courier_billing_refuse_change();

-- An admin's billing settings per courier. Every save is a new row; the newest row is in force; no row means the
-- neutral defaults (UNKNOWN, UNDECIDED, no tax rate, no thresholds). Only the two thresholds are read by code, and only
-- to write an alert line.
CREATE TABLE IF NOT EXISTS delivery_schema.courier_billing_setting (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id           VARCHAR(80) NOT NULL,
    billing_mode          VARCHAR(16) NOT NULL,
    tax_note              VARCHAR(500),
    -- Hundredths of a percent; NULL: not known.
    tax_rate_bps          INTEGER,
    disputed_fee_borne_by VARCHAR(10) NOT NULL,
    per_order_alert_paise BIGINT,
    per_day_alert_paise   BIGINT,
    changed_by            UUID        NOT NULL,
    changed_by_name       VARCHAR(80) NOT NULL,
    changed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_courier_billing_setting_mode CHECK (billing_mode IN ('UNKNOWN', 'PREPAID_WALLET', 'POSTPAID_INVOICE')),
    CONSTRAINT ck_courier_billing_setting_borne CHECK (disputed_fee_borne_by IN ('UNDECIDED', 'CRAVES', 'CHEF', 'CUSTOMER')),
    CONSTRAINT ck_courier_billing_setting_tax CHECK (tax_rate_bps BETWEEN 0 AND 10000),
    CONSTRAINT ck_courier_billing_setting_order CHECK (per_order_alert_paise > 0),
    CONSTRAINT ck_courier_billing_setting_day CHECK (per_day_alert_paise > 0)
);
CREATE INDEX IF NOT EXISTS courier_billing_setting_newest ON delivery_schema.courier_billing_setting (provider_id, id DESC);
CREATE OR REPLACE TRIGGER courier_billing_setting_append_only BEFORE UPDATE OR DELETE ON delivery_schema.courier_billing_setting
    FOR EACH ROW EXECUTE FUNCTION delivery_schema.courier_billing_refuse_change();

-- The per-day spending alert was written for this courier and day (India): one alert line a day, whatever the replica.
CREATE TABLE IF NOT EXISTS delivery_schema.courier_spend_alert (
    provider_id VARCHAR(80) NOT NULL,
    day         DATE        NOT NULL,
    alerted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_id, day)
);

-- A courier invoice as ops imported it, and its lines. Both append-only: a corrected invoice is a new import.
CREATE TABLE IF NOT EXISTS delivery_schema.courier_invoice_import (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id      VARCHAR(80) NOT NULL,
    invoice_ref      VARCHAR(64) NOT NULL,
    -- The India days the invoice covers, both included.
    period_start     DATE        NOT NULL,
    period_end       DATE        NOT NULL,
    content_sha256   CHAR(64)    NOT NULL,
    line_count       INTEGER     NOT NULL,
    total_paise      BIGINT      NOT NULL,
    currency         CHAR(3)     NOT NULL DEFAULT 'INR',
    imported_by      UUID        NOT NULL,
    imported_by_name VARCHAR(80) NOT NULL,
    imported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_courier_invoice_import_ref UNIQUE (provider_id, invoice_ref),
    CONSTRAINT ck_courier_invoice_import_period CHECK (period_end >= period_start),
    CONSTRAINT ck_courier_invoice_import_currency CHECK (currency = 'INR'),
    CONSTRAINT ck_courier_invoice_import_total CHECK (line_count > 0 AND total_paise >= 0)
);
CREATE OR REPLACE TRIGGER courier_invoice_import_append_only BEFORE UPDATE OR DELETE ON delivery_schema.courier_invoice_import
    FOR EACH ROW EXECUTE FUNCTION delivery_schema.courier_billing_refuse_change();

CREATE TABLE IF NOT EXISTS delivery_schema.courier_invoice_line (
    import_id            BIGINT       NOT NULL REFERENCES delivery_schema.courier_invoice_import (id),
    line_no              INTEGER      NOT NULL,
    provider_delivery_id VARCHAR(200) NOT NULL,
    amount_paise         BIGINT       NOT NULL,
    tax_paise            BIGINT,
    invoice_date         DATE,
    PRIMARY KEY (import_id, line_no),
    CONSTRAINT uq_courier_invoice_line_booking UNIQUE (import_id, provider_delivery_id),
    CONSTRAINT ck_courier_invoice_line_amount CHECK (amount_paise >= 0 AND tax_paise >= 0)
);
CREATE OR REPLACE TRIGGER courier_invoice_line_append_only BEFORE UPDATE OR DELETE ON delivery_schema.courier_invoice_line
    FOR EACH ROW EXECUTE FUNCTION delivery_schema.courier_billing_refuse_change();

-- What Craves expects a courier to bill for one booking: the price at cancel when the booking was cancelled, otherwise
-- the booking price; plus adjustments. NULL when that price is not known.
CREATE OR REPLACE VIEW delivery_schema.courier_booking_charge AS
SELECT c.provider_id, c.provider_delivery_id,
       bool_or(c.kind = 'CANCEL') AS cancelled,
       min(c.charged_at) FILTER (WHERE c.kind = 'BOOKING') AS booked_at,
       max(c.delivery_job_id::text)::uuid AS delivery_job_id,
       (CASE WHEN bool_or(c.kind = 'CANCEL') THEN max(c.amount_paise) FILTER (WHERE c.kind = 'CANCEL')
             ELSE max(c.amount_paise) FILTER (WHERE c.kind = 'BOOKING') END
        + COALESCE(sum(c.amount_paise) FILTER (WHERE c.kind = 'ADJUSTMENT'), 0))::bigint AS expected_paise
FROM delivery_schema.courier_charge c
GROUP BY c.provider_id, c.provider_delivery_id;

-- An imported invoice against what Craves recorded, by the courier's booking id, to the paisa. One row per invoice line,
-- and one per booking Craves recorded in the invoice's period that the invoice does not list (unless Craves expects 0).
-- difference_paise: invoice minus Craves.
CREATE OR REPLACE VIEW delivery_schema.courier_invoice_check AS
SELECT i.id AS import_id, i.provider_id, l.provider_delivery_id, l.line_no, l.amount_paise AS invoice_paise,
       b.expected_paise AS craves_paise,
       CASE WHEN b.provider_delivery_id IS NULL THEN 'NOT_IN_CRAVES'
            WHEN b.expected_paise IS NULL THEN 'CRAVES_AMOUNT_UNKNOWN'
            WHEN b.expected_paise = l.amount_paise THEN 'MATCHED'
            ELSE 'AMOUNT_DIFFERS' END AS outcome,
       l.amount_paise - b.expected_paise AS difference_paise,
       COALESCE(b.cancelled, false) AS cancelled, j.status AS delivery_status
FROM delivery_schema.courier_invoice_import i
JOIN delivery_schema.courier_invoice_line l ON l.import_id = i.id
LEFT JOIN LATERAL (SELECT v.* FROM delivery_schema.courier_booking_charge v
                   WHERE v.provider_id = i.provider_id AND v.provider_delivery_id = l.provider_delivery_id) b ON true
LEFT JOIN delivery_schema.delivery_job j ON j.id = b.delivery_job_id AND j.provider_delivery_id = l.provider_delivery_id
UNION ALL
SELECT i.id, i.provider_id, c.provider_delivery_id, NULL, NULL, b.expected_paise, 'NOT_ON_INVOICE', NULL,
       b.cancelled, j.status
FROM delivery_schema.courier_invoice_import i
JOIN delivery_schema.courier_charge c ON c.provider_id = i.provider_id AND c.kind = 'BOOKING'
    AND c.charged_at >= i.period_start::timestamp AT TIME ZONE 'Asia/Kolkata'
    AND c.charged_at < (i.period_end + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
JOIN LATERAL (SELECT v.* FROM delivery_schema.courier_booking_charge v
              WHERE v.provider_id = c.provider_id AND v.provider_delivery_id = c.provider_delivery_id) b ON true
LEFT JOIN delivery_schema.delivery_job j ON j.id = c.delivery_job_id AND j.provider_delivery_id = c.provider_delivery_id
WHERE b.expected_paise IS DISTINCT FROM 0
  AND NOT EXISTS (SELECT 1 FROM delivery_schema.courier_invoice_line l
                  WHERE l.import_id = i.id AND l.provider_delivery_id = c.provider_delivery_id);
