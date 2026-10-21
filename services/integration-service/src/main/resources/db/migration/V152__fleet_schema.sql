-- Craves rider fleet (rider-app/PLAN.md, Architecture): every table the in.craves.integration.fleet package uses.
-- Re-runnable on purpose (IF NOT EXISTS, ON CONFLICT DO NOTHING): database tests drop payment_schema and migrate
-- again without dropping fleet_schema. No foreign key leaves this schema for the same reason.
-- Money is BIGINT paise. Aadhaar numbers and images are never stored: no column or document type takes them.
CREATE SCHEMA IF NOT EXISTS fleet_schema;

-- Riders. Ops creates the row (name as on the KYC documents, phone); the rider's first GET /me links identity_id.
CREATE TABLE IF NOT EXISTS fleet_schema.rider (
    id                 UUID PRIMARY KEY,
    identity_id        UUID UNIQUE,
    name               VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) >= 2),
    phone              VARCHAR(13)  NOT NULL UNIQUE CHECK (phone ~ '^\+91[6-9][0-9]{9}$'),
    language           VARCHAR(2)   NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'te', 'hi')),
    status             VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('NOT_RIDER', 'PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    photo_blob         VARCHAR(400),
    vehicle_label      VARCHAR(80)  NOT NULL DEFAULT 'Two-wheeler',
    vehicle_reg_number VARCHAR(20),
    min_app_version    VARCHAR(20)  CHECK (min_app_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
    created_by         UUID         NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_newest ON fleet_schema.rider (created_at DESC, id DESC);

-- One bound phone per rider; a new phone waits for ops approval.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_device (
    id               UUID PRIMARY KEY,
    rider_id         UUID         NOT NULL REFERENCES fleet_schema.rider (id),
    fcm_token        TEXT,
    app_version      VARCHAR(40)  NOT NULL,
    model            VARCHAR(120) NOT NULL,
    state            VARCHAR(16)  NOT NULL CHECK (state IN ('BOUND', 'PENDING_APPROVAL', 'REPLACED')),
    first_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_by      UUID,
    approved_by_name VARCHAR(120),
    approved_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_device_one_bound ON fleet_schema.rider_device (rider_id) WHERE state = 'BOUND';
CREATE INDEX IF NOT EXISTS rider_device_rider ON fleet_schema.rider_device (rider_id, first_seen_at DESC);

-- Documents are reviewed by hand, as chefs' are: approve, or reject with a reason the rider sees.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_document (
    id               UUID PRIMARY KEY,
    rider_id         UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    type             VARCHAR(24)   NOT NULL CHECK (type IN ('DRIVING_LICENCE', 'VEHICLE_RC', 'VEHICLE_INSURANCE', 'PUC',
                                                           'PAN', 'PHOTO', 'ADDRESS_PROOF', 'BANK_PROOF')),
    status           VARCHAR(16)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    expires_on       DATE,
    reason           VARCHAR(1000),
    blob_name        VARCHAR(400)  NOT NULL,
    content_type     VARCHAR(40)   NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes       INTEGER       NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    uploaded_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    reviewed_by      UUID,
    reviewed_by_name VARCHAR(120),
    reviewed_at      TIMESTAMPTZ,
    CHECK (status <> 'REJECTED' OR reason IS NOT NULL),
    CHECK (status = 'PENDING' OR reviewed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS rider_document_rider ON fleet_schema.rider_document (rider_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS rider_document_pending ON fleet_schema.rider_document (rider_id) WHERE status = 'PENDING';

-- Set in person by ops. Stored like chef bank details (payment_schema.finance_bank_request): AES-GCM
-- encrypted_details from BankDataCipher, a keyed fingerprint, and a masked copy for display.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_payout_account (
    id                 UUID PRIMARY KEY,
    rider_id           UUID         NOT NULL REFERENCES fleet_schema.rider (id),
    method             VARCHAR(4)   NOT NULL CHECK (method IN ('UPI', 'BANK')),
    encrypted_details  TEXT         NOT NULL,
    fingerprint        VARCHAR(110) NOT NULL,
    masked_account     VARCHAR(80)  NOT NULL,
    ifsc               VARCHAR(11)  CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    holder_name        VARCHAR(120) NOT NULL,
    state              VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'REPLACED')),
    verified_in_person BOOLEAN      NOT NULL CHECK (verified_in_person),
    set_by             UUID         NOT NULL,
    set_by_name        VARCHAR(120) NOT NULL,
    set_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK ((method = 'BANK') = (ifsc IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_payout_account_one_active
    ON fleet_schema.rider_payout_account (rider_id) WHERE state = 'ACTIVE';
-- The same UPI ID or bank account can be the current account of only one rider.
CREATE UNIQUE INDEX IF NOT EXISTS rider_payout_account_unique_number
    ON fleet_schema.rider_payout_account (fingerprint) WHERE state = 'ACTIVE';
CREATE INDEX IF NOT EXISTS rider_payout_account_fingerprint ON fleet_schema.rider_payout_account (fingerprint);

-- Due process (Telangana Act 21 of 2026): a person decides; reason, evidence and approver on every change.
-- SAFETY_PAUSE needs a review within 72 h; NOTICE gives at least 7 days; created_at is the decision time.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_status_event (
    id               UUID PRIMARY KEY,
    rider_id         UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    kind             VARCHAR(16)   NOT NULL CHECK (kind IN ('SAFETY_PAUSE', 'NOTICE', 'RESTORE', 'DEACTIVATE')),
    reason           VARCHAR(1000) NOT NULL CHECK (char_length(btrim(reason)) >= 3),
    evidence_summary VARCHAR(2000) NOT NULL CHECK (char_length(btrim(evidence_summary)) >= 3),
    deadline         TIMESTAMPTZ,
    review_by        TIMESTAMPTZ,
    appeal_phone     VARCHAR(13)   CHECK (appeal_phone ~ '^\+91[0-9]{10}$'),
    approver_id      UUID          NOT NULL,
    approver_name    VARCHAR(120)  NOT NULL,
    status_before    VARCHAR(16)   NOT NULL,
    status_after     VARCHAR(16)   NOT NULL CHECK (status_after IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    created_at       TIMESTAMPTZ   NOT NULL,
    CHECK ((kind = 'NOTICE') = (deadline IS NOT NULL)),
    CHECK ((kind = 'SAFETY_PAUSE') = (review_by IS NOT NULL)),
    CHECK (kind = 'RESTORE' OR appeal_phone IS NOT NULL),
    CHECK (deadline IS NULL OR deadline >= created_at + INTERVAL '7 days'),
    CHECK (review_by IS NULL OR (review_by > created_at AND review_by <= created_at + INTERVAL '72 hours'))
);
CREATE INDEX IF NOT EXISTS rider_status_event_rider ON fleet_schema.rider_status_event (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rider_status_event_joins_exits
    ON fleet_schema.rider_status_event (created_at) WHERE kind IN ('RESTORE', 'DEACTIVATE');

-- Versioned rate card. Publishing needs effective_from at least 14 days later and values inside the declared
-- ranges ({"column": [min, max]}); the service checks both, the table keeps the 14 days.
CREATE TABLE IF NOT EXISTS fleet_schema.rate_card (
    version                       VARCHAR(40) PRIMARY KEY CHECK (version ~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$'),
    status                        VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    effective_from                TIMESTAMPTZ NOT NULL,
    published_at                  TIMESTAMPTZ,
    published_by                  UUID,
    base_paise                    BIGINT      NOT NULL CHECK (base_paise >= 0),
    base_drop_m                   INTEGER     NOT NULL CHECK (base_drop_m >= 0),
    drop_per_km_paise             BIGINT      NOT NULL CHECK (drop_per_km_paise >= 0),
    pickup_free_m                 INTEGER     NOT NULL CHECK (pickup_free_m >= 0),
    pickup_per_km_paise           BIGINT      NOT NULL CHECK (pickup_per_km_paise >= 0),
    wait_free_minutes             INTEGER     NOT NULL CHECK (wait_free_minutes >= 0),
    wait_per_minute_paise         BIGINT      NOT NULL CHECK (wait_per_minute_paise >= 0),
    slot_guarantee_per_hour_paise BIGINT      NOT NULL CHECK (slot_guarantee_per_hour_paise >= 0),
    ranges                        JSONB       NOT NULL,
    summary_of_changes            JSONB       NOT NULL,
    full_text_url                 VARCHAR(400),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL)),
    CHECK (published_at IS NULL OR effective_from >= published_at + INTERVAL '14 days')
);

CREATE TABLE IF NOT EXISTS fleet_schema.dispatch_policy (
    version             VARCHAR(40) PRIMARY KEY CHECK (version ~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$'),
    status              VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    effective_from      TIMESTAMPTZ NOT NULL,
    published_at        TIMESTAMPTZ,
    published_by        UUID,
    mode                VARCHAR(8)  NOT NULL CHECK (mode IN ('off', 'shadow', 'live')),
    offer_seconds       INTEGER     NOT NULL CHECK (offer_seconds > 0),
    fleet_stage_seconds INTEGER     NOT NULL CHECK (fleet_stage_seconds > 0),
    radius_m            INTEGER     NOT NULL CHECK (radius_m > 0),
    ranges              JSONB       NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL)),
    CHECK (published_at IS NULL OR effective_from >= published_at + INTERVAL '14 days')
);

-- Terms version = rate card version.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_terms_acceptance (
    rider_id    UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    version     VARCHAR(40) NOT NULL REFERENCES fleet_schema.rate_card (version),
    language    VARCHAR(2)  NOT NULL CHECK (language IN ('en', 'te', 'hi')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, version)
);

-- Test mode: while on, dispatch touches only these riders and kitchens.
CREATE TABLE IF NOT EXISTS fleet_schema.test_mode_rider (
    rider_id UUID PRIMARY KEY REFERENCES fleet_schema.rider (id),
    note     VARCHAR(200),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fleet_schema.test_mode_kitchen (
    chef_id  UUID PRIMARY KEY,
    note     VARCHAR(200),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ops-assigned slots (pilot) and banners, shown on the rider's Home.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_slot (
    id              UUID PRIMARY KEY,
    rider_id        UUID         NOT NULL REFERENCES fleet_schema.rider (id),
    zone_name       VARCHAR(120) NOT NULL,
    starts_at       TIMESTAMPTZ  NOT NULL,
    ends_at         TIMESTAMPTZ  NOT NULL,
    rest_point_name VARCHAR(120),
    rest_point_area VARCHAR(120),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK ((rest_point_name IS NULL) = (rest_point_area IS NULL))
);
CREATE INDEX IF NOT EXISTS rider_slot_rider ON fleet_schema.rider_slot (rider_id, ends_at);
CREATE TABLE IF NOT EXISTS fleet_schema.ops_banner (
    id         UUID PRIMARY KEY,
    tone       VARCHAR(8)   NOT NULL CHECK (tone IN ('info', 'warning')),
    text       VARCHAR(300) NOT NULL,
    starts_at  TIMESTAMPTZ  NOT NULL,
    ends_at    TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

-- Shifts: the opaque shift credential is stored hashed and lasts at most 12 hours.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_shift (
    id                      UUID PRIMARY KEY,
    rider_id                UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    device_id               UUID          REFERENCES fleet_schema.rider_device (id),
    credential_hash         CHAR(64)      NOT NULL UNIQUE,
    credential_expires_at   TIMESTAMPTZ   NOT NULL,
    credential_revoked_at   TIMESTAMPTZ,
    started_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    ended_at                TIMESTAMPTZ,
    selfie_blob             VARCHAR(400),
    selfie_size_bytes       INTEGER       CHECK (selfie_size_bytes BETWEEN 1 AND 5242880),
    selfie_state            VARCHAR(10)   NOT NULL DEFAULT 'PENDING' CHECK (selfie_state IN ('PENDING', 'APPROVED', 'REJECTED')),
    selfie_reason           VARCHAR(1000),
    selfie_reviewed_by      UUID,
    selfie_reviewed_by_name VARCHAR(120),
    selfie_reviewed_at      TIMESTAMPTZ,
    in_zone_seconds         INTEGER       NOT NULL DEFAULT 0 CHECK (in_zone_seconds >= 0),
    CHECK (credential_expires_at <= started_at + INTERVAL '12 hours'),
    CHECK ((selfie_blob IS NULL) = (selfie_size_bytes IS NULL)),
    CHECK (selfie_state <> 'REJECTED' OR selfie_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_shift_one_open ON fleet_schema.rider_shift (rider_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS rider_shift_rider ON fleet_schema.rider_shift (rider_id, started_at DESC);
CREATE INDEX IF NOT EXISTS rider_shift_selfie_queue
    ON fleet_schema.rider_shift (selfie_state, started_at) WHERE selfie_blob IS NOT NULL;

-- One trip per chef sub-order. State names follow the ops console; the rider app's steps map onto them.
CREATE TABLE IF NOT EXISTS fleet_schema.trip (
    id                  UUID PRIMARY KEY,
    chef_sub_order_id   UUID          NOT NULL UNIQUE,
    order_id            UUID          NOT NULL,
    chef_id             UUID          NOT NULL,
    delivery_job_id     UUID,
    order_code          VARCHAR(9)    NOT NULL CHECK (order_code ~ '^#[0-9A-F]{8}$'),
    state               VARCHAR(12)   NOT NULL DEFAULT 'SEARCHING'
                        CHECK (state IN ('SEARCHING', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP', 'DELIVERED', 'FAILED', 'CANCELLED')),
    provider            VARCHAR(12)   NOT NULL DEFAULT 'CRAVES_FLEET' CHECK (provider IN ('CRAVES_FLEET', 'BORZO', 'PIDGE', 'OPS_QUEUE')),
    rider_id            UUID          REFERENCES fleet_schema.rider (id),
    version             INTEGER       NOT NULL DEFAULT 1 CHECK (version >= 1),
    items_count         INTEGER       NOT NULL CHECK (items_count >= 0),
    sealed              BOOLEAN       NOT NULL DEFAULT false,
    kitchen_name        VARCHAR(160)  NOT NULL,
    kitchen_area        VARCHAR(160)  NOT NULL,
    kitchen_address     VARCHAR(500)  NOT NULL,
    kitchen_landmark    VARCHAR(200),
    kitchen_lat         DOUBLE PRECISION NOT NULL CHECK (kitchen_lat BETWEEN -90 AND 90),
    kitchen_lng         DOUBLE PRECISION NOT NULL CHECK (kitchen_lng BETWEEN -180 AND 180),
    chef_phone          VARCHAR(16)   NOT NULL,
    customer_first_name VARCHAR(80)   NOT NULL,
    customer_phone      VARCHAR(16)   NOT NULL,
    drop_area           VARCHAR(160)  NOT NULL,
    drop_address        VARCHAR(500)  NOT NULL,
    drop_landmark       VARCHAR(200),
    drop_lat            DOUBLE PRECISION NOT NULL CHECK (drop_lat BETWEEN -90 AND 90),
    drop_lng            DOUBLE PRECISION NOT NULL CHECK (drop_lng BETWEEN -180 AND 180),
    pickup_distance_m   INTEGER       CHECK (pickup_distance_m >= 0),
    drop_distance_m     INTEGER       CHECK (drop_distance_m >= 0),
    rate_card_version   VARCHAR(40)   REFERENCES fleet_schema.rate_card (version),
    pay_paise           BIGINT        CHECK (pay_paise >= 0),
    chef_ready_at       TIMESTAMPTZ,
    arrived_kitchen_at  TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    arrived_drop_at     TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    cancel_reason       VARCHAR(500),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (provider = 'CRAVES_FLEET' OR rider_id IS NULL)
);
CREATE INDEX IF NOT EXISTS trip_unfinished ON fleet_schema.trip (created_at) WHERE state NOT IN ('DELIVERED', 'FAILED', 'CANCELLED');
CREATE UNIQUE INDEX IF NOT EXISTS trip_one_active_per_rider
    ON fleet_schema.trip (rider_id) WHERE state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP');

-- An offer locks the pay, the rate card version and both distances. One ACTIVE offer per rider; one winner per trip.
CREATE TABLE IF NOT EXISTS fleet_schema.trip_offer (
    id                UUID PRIMARY KEY,
    trip_id           UUID        NOT NULL REFERENCES fleet_schema.trip (id),
    rider_id          UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    state             VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                      CHECK (state IN ('ACTIVE', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'LOST', 'WITHDRAWN')),
    pay_paise         BIGINT      NOT NULL CHECK (pay_paise >= 0),
    pay_lines         JSONB       NOT NULL DEFAULT '[]',
    rate_card_version VARCHAR(40) NOT NULL REFERENCES fleet_schema.rate_card (version),
    pickup_distance_m INTEGER     NOT NULL CHECK (pickup_distance_m >= 0),
    drop_distance_m   INTEGER     NOT NULL CHECK (drop_distance_m >= 0),
    offered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    decided_at        TIMESTAMPTZ,
    CHECK (expires_at > offered_at),
    CHECK ((state = 'ACTIVE') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS trip_offer_one_active_per_rider ON fleet_schema.trip_offer (rider_id) WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS trip_offer_one_accepted_per_trip ON fleet_schema.trip_offer (trip_id) WHERE state = 'ACCEPTED';
CREATE INDEX IF NOT EXISTS trip_offer_trip ON fleet_schema.trip_offer (trip_id);

CREATE TABLE IF NOT EXISTS fleet_schema.trip_event (
    id              UUID PRIMARY KEY,
    trip_id         UUID         NOT NULL REFERENCES fleet_schema.trip (id),
    kind            VARCHAR(40)  NOT NULL,
    actor_type      VARCHAR(8)   NOT NULL CHECK (actor_type IN ('RIDER', 'CHEF', 'OPS', 'SYSTEM')),
    actor_id        UUID,
    idempotency_key VARCHAR(128),
    trip_version    INTEGER,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    mock            BOOLEAN,
    detail          JSONB        NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trip_event_idempotent
    ON fleet_schema.trip_event (trip_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS trip_event_trip ON fleet_schema.trip_event (trip_id, created_at);

-- Dispatch chain: fleet, Borzo, Pidge, ops queue. A stage is closed before the next opens.
CREATE TABLE IF NOT EXISTS fleet_schema.trip_stage (
    id          UUID PRIMARY KEY,
    trip_id     UUID        NOT NULL REFERENCES fleet_schema.trip (id),
    seq         SMALLINT    NOT NULL CHECK (seq >= 1),
    provider    VARCHAR(12) NOT NULL CHECK (provider IN ('CRAVES_FLEET', 'BORZO', 'PIDGE', 'OPS_QUEUE')),
    state       VARCHAR(8)  NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'CLOSED')),
    outcome     VARCHAR(60),
    opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at TIMESTAMPTZ NOT NULL,
    closed_at   TIMESTAMPTZ,
    UNIQUE (trip_id, seq),
    CHECK (deadline_at > opened_at),
    CHECK ((state = 'CLOSED') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS trip_stage_one_open ON fleet_schema.trip_stage (trip_id) WHERE state = 'OPEN';
CREATE INDEX IF NOT EXISTS trip_stage_due ON fleet_schema.trip_stage (deadline_at) WHERE state = 'OPEN';

CREATE TABLE IF NOT EXISTS fleet_schema.rider_position_latest (
    rider_id    UUID             PRIMARY KEY REFERENCES fleet_schema.rider (id),
    shift_id    UUID             REFERENCES fleet_schema.rider_shift (id),
    trip_id     UUID             REFERENCES fleet_schema.trip (id),
    lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    accuracy_m  REAL             NOT NULL CHECK (accuracy_m >= 0),
    mock        BOOLEAN          NOT NULL DEFAULT false,
    recorded_at TIMESTAMPTZ      NOT NULL,
    received_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- On-trip GPS points, partitioned by IST day. No foreign keys: an append-only, high-volume table.
-- New days: CREATE TABLE fleet_schema.trip_track_YYYYMMDD PARTITION OF fleet_schema.trip_track
--   FOR VALUES FROM ('<day> 00:00+05:30') TO ('<next day> 00:00+05:30'), before the day starts
--   (docs/riders/BACKEND.md). Rows outside every day partition land in trip_track_default.
CREATE TABLE IF NOT EXISTS fleet_schema.trip_track (
    trip_id     UUID             NOT NULL,
    rider_id    UUID             NOT NULL,
    recorded_at TIMESTAMPTZ      NOT NULL,
    lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    accuracy_m  REAL             NOT NULL CHECK (accuracy_m >= 0),
    mock        BOOLEAN          NOT NULL,
    received_at TIMESTAMPTZ      NOT NULL DEFAULT now()
) PARTITION BY RANGE (recorded_at);
CREATE INDEX IF NOT EXISTS trip_track_trip ON fleet_schema.trip_track (trip_id, recorded_at);
CREATE TABLE IF NOT EXISTS fleet_schema.trip_track_default PARTITION OF fleet_schema.trip_track DEFAULT;
DO $$
DECLARE
    day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS fleet_schema.%I PARTITION OF fleet_schema.trip_track FOR VALUES FROM (%L) TO (%L)',
            'trip_track_' || to_char(day + i, 'YYYYMMDD'),
            ((day + i)::timestamp AT TIME ZONE 'Asia/Kolkata'),
            ((day + i + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END LOOP;
END $$;

-- Pay per trip, component and revision: one business key each, so a credit can never be written twice.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_earning (
    id                UUID PRIMARY KEY,
    rider_id          UUID         NOT NULL REFERENCES fleet_schema.rider (id),
    trip_id           UUID         NOT NULL REFERENCES fleet_schema.trip (id),
    component         VARCHAR(32)  NOT NULL CHECK (component ~ '^[a-z][a-z0-9-]{1,31}$'),
    revision          INTEGER      NOT NULL CHECK (revision >= 1),
    business_key      VARCHAR(160) NOT NULL UNIQUE,
    gross_paise       BIGINT       NOT NULL,
    withheld_paise    BIGINT       NOT NULL DEFAULT 0 CHECK (withheld_paise >= 0),
    net_paise         BIGINT       NOT NULL,
    rate_card_version VARCHAR(40)  NOT NULL REFERENCES fleet_schema.rate_card (version),
    withdrawable_at   TIMESTAMPTZ  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (business_key = 'fleet-trip-pay/' || trip_id::text || '/' || component || '/' || revision::text),
    CHECK (net_paise = gross_paise - withheld_paise)
);
CREATE INDEX IF NOT EXISTS rider_earning_rider ON fleet_schema.rider_earning (rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet_schema.rider_payout_instruction (
    id                UUID PRIMARY KEY,
    rider_id          UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    kind              VARCHAR(16)   NOT NULL CHECK (kind IN ('WEEKLY', 'DAILY_WITHDRAWAL')),
    payout_date       DATE          NOT NULL,
    amount_paise      BIGINT        NOT NULL CHECK (amount_paise > 0),
    payout_account_id UUID          NOT NULL REFERENCES fleet_schema.rider_payout_account (id),
    state             VARCHAR(10)   NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PAID', 'FAILED')),
    utr               VARCHAR(40),
    failure_reason    VARCHAR(1000),
    marked_by         UUID,
    marked_by_name    VARCHAR(120),
    marked_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (rider_id, kind, payout_date),
    CHECK (state <> 'PAID' OR utr IS NOT NULL),
    CHECK (state <> 'FAILED' OR failure_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_payout_instruction_utr ON fleet_schema.rider_payout_instruction (utr) WHERE utr IS NOT NULL;

-- One free withdrawal per rider per IST day.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_withdrawal_day (
    rider_id       UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    request_date   DATE        NOT NULL,
    amount_paise   BIGINT      NOT NULL CHECK (amount_paise > 0),
    instruction_id UUID        REFERENCES fleet_schema.rider_payout_instruction (id),
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, request_date)
);

CREATE TABLE IF NOT EXISTS fleet_schema.support_issue (
    id              UUID PRIMARY KEY,
    rider_id        UUID          NOT NULL REFERENCES fleet_schema.rider (id),
    trip_id         UUID,
    payout_id       UUID,
    category        VARCHAR(24)   NOT NULL CHECK (category IN ('MISSING_PAY', 'WRONG_DISTANCE', 'PAYOUT_NOT_RECEIVED',
                                                               'WRONG_DEDUCTION', 'APP_PROBLEM', 'OTHER')),
    note            VARCHAR(2000),
    state           VARCHAR(12)   NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'ACKNOWLEDGED', 'FIXED')),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    acknowledge_by  TIMESTAMPTZ   NOT NULL,
    fix_by          TIMESTAMPTZ   NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    fixed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS support_issue_open ON fleet_schema.support_issue (state, created_at);

CREATE TABLE IF NOT EXISTS fleet_schema.sos_event (
    id              UUID PRIMARY KEY,
    rider_id        UUID             NOT NULL REFERENCES fleet_schema.rider (id),
    trip_id         UUID,
    lat             DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
    lng             DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
    fix_recorded_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
    alerted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sos_event_recent ON fleet_schema.sos_event (created_at DESC);

-- Every admin action on the fleet. A mutation's row also holds its Idempotency-Key and first response,
-- written in the same transaction as the action, so a retry replays it.
CREATE TABLE IF NOT EXISTS fleet_schema.admin_audit (
    id            UUID PRIMARY KEY,
    at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actor_id      UUID          NOT NULL,
    actor_name    VARCHAR(120)  NOT NULL,
    action        VARCHAR(60)   NOT NULL,
    rider_id      UUID          REFERENCES fleet_schema.rider (id),
    target_id     VARCHAR(64),
    summary       VARCHAR(1000) NOT NULL,
    idem_key      UUID,
    request_hash  CHAR(64),
    response_body TEXT,
    CHECK ((idem_key IS NULL) = (request_hash IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_idempotency ON fleet_schema.admin_audit (actor_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_newest ON fleet_schema.admin_audit (at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_rider ON fleet_schema.admin_audit (rider_id, at DESC, id DESC);

-- The audit trail and the status history are append-only.
CREATE OR REPLACE FUNCTION fleet_schema.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE OR REPLACE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON fleet_schema.admin_audit
    FOR EACH ROW EXECUTE FUNCTION fleet_schema.refuse_change();
CREATE OR REPLACE TRIGGER rider_status_event_append_only BEFORE UPDATE OR DELETE ON fleet_schema.rider_status_event
    FOR EACH ROW EXECUTE FUNCTION fleet_schema.refuse_change();

-- Draft rate card 2026-10-v1 (BACKEND-PROMPT T5). Ranges are the declared limits a later version must stay inside;
-- they are a business input to confirm before publishing.
INSERT INTO fleet_schema.rate_card (version, status, effective_from, base_paise, base_drop_m, drop_per_km_paise,
                                    pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise,
                                    slot_guarantee_per_hour_paise, ranges, summary_of_changes)
VALUES ('2026-10-v1', 'DRAFT', TIMESTAMPTZ '2026-11-04 00:00:00+05:30', 4000, 2000, 900, 1000, 900, 8, 150, 8000,
        '{"base_paise": [3000, 6000], "base_drop_m": [1000, 3000], "drop_per_km_paise": [600, 1500],
          "pickup_free_m": [0, 2500], "pickup_per_km_paise": [0, 1500], "wait_free_minutes": [5, 10],
          "wait_per_minute_paise": [100, 300], "slot_guarantee_per_hour_paise": [0, 15000]}',
        '{"en": ["First version of the Craves rider terms. Draft pricing, not final."]}')
ON CONFLICT (version) DO NOTHING;

-- Dispatch stays off (offers 40 s, fleet stage 60 s). The 5 km radius is a placeholder until ops sets the pilot area.
INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, mode, offer_seconds, fleet_stage_seconds,
                                          radius_m, ranges)
VALUES ('2026-10-v1', 'DRAFT', TIMESTAMPTZ '2026-11-04 00:00:00+05:30', 'off', 40, 60, 5000,
        '{"offer_seconds": [30, 60], "fleet_stage_seconds": [45, 120], "radius_m": [1000, 10000]}')
ON CONFLICT (version) DO NOTHING;
