-- Rider-booked peak slots (app 1.3.3, docs/riders/REDESIGN.md R-07). Append-only, like every migration here.
--
-- A booked slot is an ordinary fleet_schema.rider_slot row (zone name, window, hourly guarantee), so the location
-- heartbeat, the settlement and the money phase treat it exactly like an ops-assigned slot. What is new: where the
-- demand is (slot_cluster), how many riders each cluster can carry in each peak window (slot_capacity, approved by ops),
-- who booked (slot_booking) and who waits for a place (slot_standby).

-- A slot's zone as geometry: the heartbeat counts in-zone seconds only inside it. NULL (ops slots) keeps the old rule.
ALTER TABLE fleet_schema.rider_slot
    ADD COLUMN IF NOT EXISTS zone_lat      DOUBLE PRECISION CHECK (zone_lat BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS zone_lng      DOUBLE PRECISION CHECK (zone_lng BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS zone_radius_m INTEGER CHECK (zone_radius_m BETWEEN 100 AND 10000);

-- Where orders come from: 0.01 degree cells with at least 2 orders an hour at lunch or dinner over the last 14 days,
-- touching cells joined. The centre may drift up to 500 m between rebuilds and the id stays; farther is a new cluster.
CREATE TABLE IF NOT EXISTS fleet_schema.slot_cluster (
    id                     UUID PRIMARY KEY,
    n                      INTEGER          NOT NULL UNIQUE CHECK (n > 0),
    name                   VARCHAR(120)     NOT NULL,
    centre_lat             DOUBLE PRECISION NOT NULL CHECK (centre_lat BETWEEN -90 AND 90),
    centre_lng             DOUBLE PRECISION NOT NULL CHECK (centre_lng BETWEEN -180 AND 180),
    radius_m               INTEGER          NOT NULL DEFAULT 1500 CHECK (radius_m BETWEEN 100 AND 10000),
    cells                  JSONB            NOT NULL,
    lunch_orders_per_hour  NUMERIC(8, 2)    NOT NULL CHECK (lunch_orders_per_hour >= 0),
    dinner_orders_per_hour NUMERIC(8, 2)    NOT NULL CHECK (dinner_orders_per_hour >= 0),
    active                 BOOLEAN          NOT NULL DEFAULT true,
    first_seen_at          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- One peak window of one cluster on one day: places = ceil(expected orders an hour / 1.4), rate within the rate card's
-- declared slot guarantee range. Riders see it only once ops approved it (approved_at).
CREATE TABLE IF NOT EXISTS fleet_schema.slot_capacity (
    id                       UUID PRIMARY KEY,
    cluster_id               UUID          NOT NULL REFERENCES fleet_schema.slot_cluster (id),
    starts_at                TIMESTAMPTZ   NOT NULL,
    ends_at                  TIMESTAMPTZ   NOT NULL,
    places                   INTEGER       NOT NULL CHECK (places >= 0),
    rate_per_hour_paise      BIGINT        NOT NULL CHECK (rate_per_hour_paise > 0),
    expected_orders_per_hour NUMERIC(8, 2) NOT NULL CHECK (expected_orders_per_hour >= 0),
    approved_at              TIMESTAMPTZ,
    approved_by              UUID,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    UNIQUE (cluster_id, starts_at)
);
CREATE INDEX IF NOT EXISTS slot_capacity_starts ON fleet_schema.slot_capacity (starts_at);

CREATE TABLE IF NOT EXISTS fleet_schema.slot_booking (
    id            UUID PRIMARY KEY,
    capacity_id   UUID        NOT NULL REFERENCES fleet_schema.slot_capacity (id),
    rider_id      UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    rider_slot_id UUID        NOT NULL REFERENCES fleet_schema.rider_slot (id),
    status        VARCHAR(10) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CANCELLED', 'NO_SHOW', 'COMPLETED')),
    booked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at  TIMESTAMPTZ,
    no_show_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS slot_booking_one_per_rider ON fleet_schema.slot_booking (capacity_id, rider_id) WHERE status = 'BOOKED';
CREATE INDEX IF NOT EXISTS slot_booking_rider ON fleet_schema.slot_booking (rider_id, booked_at);

CREATE TABLE IF NOT EXISTS fleet_schema.slot_standby (
    id                  UUID PRIMARY KEY,
    capacity_id         UUID        NOT NULL REFERENCES fleet_schema.slot_capacity (id),
    rider_id            UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    promoted_booking_id UUID        REFERENCES fleet_schema.slot_booking (id),
    UNIQUE (capacity_id, rider_id)
);

-- The slot rules as riders' terms. Before the first rate card is published (a fresh install, the pilot not yet live) the
-- three slot lines join the current draft's summary, so ops publishes them with the first card and no version is spent.
-- Once a card is published, the card riders see now is copied as 2026-11-v1 with the lines added, published 14 days ahead
-- (riders get the notice as Terms.upcoming, the 14-day rule from REDESIGN.md).
-- GOPI: if the first rate card was published before this lands, this copies it and the copy starts 14 days after the deploy.
DO $$
DECLARE
    source    VARCHAR(40);
    anyPub    BOOLEAN;
    slotLines JSONB := jsonb_build_array(
        'Booked peak slots: book a lunch or dinner slot in a cluster near you from the Slots tab. Riders who completed a slot in the last 14 days book from Thursday 10 am; everyone from Friday 10 am.',
        'In a booked slot you are paid at least the slot''s hourly rate (₹60 to ₹150 an hour, shown on the slot) for the time you are online within 1.5 km of the cluster, even when orders are slow.',
        'At most 6 booked hours a day. Cancel before the slot starts and the place goes to the first rider on standby. Two no-shows in 14 days: for the next 14 days you book from Friday only.');
BEGIN
    IF EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE version = '2026-11-v1')
       OR EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE summary_of_changes::text LIKE '%Booked peak slots%') THEN
        RETURN;
    END IF;
    SELECT EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED') INTO anyPub;
    IF NOT anyPub THEN
        UPDATE fleet_schema.rate_card
        SET summary_of_changes = jsonb_set(summary_of_changes, '{en}', COALESCE(summary_of_changes -> 'en', '[]'::jsonb) || slotLines)
        WHERE version = (SELECT version FROM fleet_schema.rate_card WHERE status = 'DRAFT' ORDER BY created_at DESC LIMIT 1);
        RETURN;
    END IF;
    SELECT version INTO source FROM fleet_schema.rate_card WHERE status = 'PUBLISHED'
    ORDER BY CASE WHEN effective_from <= now() THEN 0 ELSE 1 END,
             CASE WHEN effective_from <= now() THEN effective_from END DESC NULLS LAST,
             effective_from ASC
    LIMIT 1;
    CREATE TEMP TABLE slot_terms_copy ON COMMIT DROP AS SELECT * FROM fleet_schema.rate_card WHERE version = source;
    UPDATE slot_terms_copy SET
        version = '2026-11-v1',
        status = 'PUBLISHED',
        published_at = now(),
        published_by = NULL,
        effective_from = now() + INTERVAL '14 days',
        created_at = now(),
        summary_of_changes = jsonb_set(summary_of_changes, '{en}', COALESCE(summary_of_changes -> 'en', '[]'::jsonb) || slotLines);
    INSERT INTO fleet_schema.rate_card SELECT * FROM slot_terms_copy;
END $$;
