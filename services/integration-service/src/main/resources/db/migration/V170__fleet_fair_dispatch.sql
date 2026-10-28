-- Phase 4, how an order is offered (docs/riders/DISPATCH.md). offers_at_once riders see it at a time, in up to
-- offer_rounds rounds while the fleet stage lasts. fair_band_m > 0: among the free riders within that many metres of the
-- nearest, it goes first to the one who has earned the least per online hour today. The defaults are today's rules
-- (3 at once, one round, nearest first), so nothing changes until ops publishes a policy that sets them; once a rate card
-- is published, riders get 14 days' notice of a change (FleetPolicyStore.publishDispatchPolicy).
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS offers_at_once INTEGER NOT NULL DEFAULT 3 CHECK (offers_at_once BETWEEN 1 AND 3),
    ADD COLUMN IF NOT EXISTS offer_rounds   INTEGER NOT NULL DEFAULT 1 CHECK (offer_rounds BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS fair_band_m    INTEGER NOT NULL DEFAULT 0 CHECK (fair_band_m BETWEEN 0 AND 5000);

-- The round an offer went out in, and why its rider got it (the rule, their place, distance, earnings per online hour
-- today, minutes free): the rider's "why me" and the record ops reviews a decision from.
ALTER TABLE fleet_schema.trip_offer
    ADD COLUMN IF NOT EXISTS round  INTEGER NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS reason JSONB;

-- The notice rule V159 keeps for the pickup detour now covers how orders are offered too: once a rate card is published,
-- a version that changes the rules riders are shown must start at least 14 days after it is published. Otherwise as V159.
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
        SELECT pickup_detour_percent, offers_at_once, offer_rounds, fair_band_m INTO shown FROM fleet_schema.dispatch_policy
        WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND version <> NEW.version AND effective_from <= now()
        ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT pickup_detour_percent, offers_at_once, offer_rounds, fair_band_m INTO shown FROM fleet_schema.dispatch_policy
            WHERE status = 'DRAFT' AND version <> NEW.version ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF FOUND AND shown.pickup_detour_percent <> NEW.pickup_detour_percent THEN
            RAISE EXCEPTION 'Dispatch policy % changes the pickup detour riders were shown, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
        IF FOUND AND (shown.offers_at_once, shown.offer_rounds, shown.fair_band_m)
           IS DISTINCT FROM (NEW.offers_at_once, NEW.offer_rounds, NEW.fair_band_m) THEN
            RAISE EXCEPTION 'Dispatch policy % changes how orders are offered to riders, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
