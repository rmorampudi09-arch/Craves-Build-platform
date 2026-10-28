-- Phase 5, the travel-time model (ml/fleet-eta/README.md; docs/riders/DISPATCH.md §2). Versions trained in Python on
-- Craves's own finished trips are kept here (python -m fleet_eta sql writes the INSERT); integration-service loads the one
-- CRAVES_FLEET_ETA_MODEL_VERSION names and publishes it to the fleet engine. A model holds trees over roads, never people:
-- no rider, customer or order is in it. Live (CRAVES_FLEET_ETA_MODE=live), each offer keeps the minutes the model predicted
-- for its two legs, which the rider's offer shows, and the trip keeps the pickup minutes, which the chef's arrival time uses.
-- Without a model these stay NULL and today's 20 km/h rule applies. Additive and empty: it applies in moments.
-- Who hears of an order first becomes the riders soonest at the kitchen by the model, instead of the nearest, only when the
-- dispatch policy says so (rank_by_travel_time): a rule of how orders are offered, which riders read under Terms and, once
-- a rate card is published, get 14 days' notice of, held by the same trigger as the other rules (V170's, with it added).
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS fleet_schema.eta_model (
    version    VARCHAR(64) PRIMARY KEY CHECK (version ~ '^[A-Za-z0-9._-]{1,64}$'),
    model      JSONB       NOT NULL,
    metrics    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (model ->> 'version' = version)
);

ALTER TABLE fleet_schema.trip_offer
    ADD COLUMN IF NOT EXISTS pickup_minutes REAL CHECK (pickup_minutes >= 0),
    ADD COLUMN IF NOT EXISTS drop_minutes   REAL CHECK (drop_minutes >= 0);

ALTER TABLE fleet_schema.trip
    ADD COLUMN IF NOT EXISTS pickup_minutes REAL CHECK (pickup_minutes >= 0);

ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS rank_by_travel_time BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fleet_schema.dispatch_policy_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    shown RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'PUBLISHED' THEN
            RAISE EXCEPTION 'Dispatch policy % is published, so it cannot be deleted.', OLD.version USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN
        IF OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
           AND to_jsonb(NEW) - 'withdrawn_at' - 'withdrawn_by' = to_jsonb(OLD) - 'withdrawn_at' - 'withdrawn_by' THEN
            NEW.withdrawn_at := now();
            IF OLD.effective_from <= NEW.withdrawn_at THEN
                RAISE EXCEPTION 'Dispatch policy % has started, so it cannot be withdrawn.', OLD.version
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Dispatch policy % is published, so it cannot change; only one that has not started can be withdrawn.',
            OLD.version USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by IS NOT NULL THEN
        RAISE EXCEPTION 'Dispatch policy % is not published, so it cannot be withdrawn.', NEW.version USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> 'PUBLISHED' THEN
        RETURN NEW;
    END IF;
    NEW.published_at := now();
    PERFORM pg_advisory_xact_lock(hashtextextended('fleet-publish/dispatch_policy', 0));
    IF NEW.effective_from > NEW.published_at AND EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED'
        AND withdrawn_at IS NULL AND version <> NEW.version AND effective_from = NEW.effective_from) THEN
        RAISE EXCEPTION 'Dispatch policy %: another version starts at that moment. Pick another start time.', NEW.version
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.effective_from < NEW.published_at + INTERVAL '14 days'
       AND EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED') THEN
        SELECT pickup_detour_percent, offers_at_once, offer_rounds, fair_band_m, rank_by_travel_time INTO shown FROM fleet_schema.dispatch_policy
        WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND version <> NEW.version AND effective_from <= now()
        ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT pickup_detour_percent, offers_at_once, offer_rounds, fair_band_m, rank_by_travel_time INTO shown FROM fleet_schema.dispatch_policy
            WHERE status = 'DRAFT' AND version <> NEW.version ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF FOUND AND shown.pickup_detour_percent <> NEW.pickup_detour_percent THEN
            RAISE EXCEPTION 'Dispatch policy % changes the pickup detour riders were shown, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
        IF FOUND AND (shown.offers_at_once, shown.offer_rounds, shown.fair_band_m, shown.rank_by_travel_time)
           IS DISTINCT FROM (NEW.offers_at_once, NEW.offer_rounds, NEW.fair_band_m, NEW.rank_by_travel_time) THEN
            RAISE EXCEPTION 'Dispatch policy % changes how orders are offered to riders, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
