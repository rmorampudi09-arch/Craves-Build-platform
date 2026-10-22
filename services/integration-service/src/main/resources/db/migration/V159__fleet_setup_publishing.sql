-- Rider pilot go-live: ops publishes rate cards and dispatch policies from the console. Re-runnable like V152.
-- Telangana Act 21 of 2026, s.13(2) asks for 14 days' notice of changed terms. The first rate card ever changes no
-- earlier terms, so it may start at once. A dispatch policy is operations, not terms, except its pickup detour
-- (pickup km = straight line x detour, so it changes pay). Triggers replace the two 14-day CHECKs with these rules.

DO $$
DECLARE
    found record;
BEGIN
    FOR found IN
        SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
        WHERE conrelid IN ('fleet_schema.rate_card'::regclass, 'fleet_schema.dispatch_policy'::regclass)
          AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%14 days%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', found.tbl, found.conname);
    END LOOP;
END $$;

-- An immediate "off" (the emergency stop) withdraws every version scheduled for later, so none switches dispatch back on.
-- A withdrawn version never counts as in force.
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS withdrawn_by UUID;

-- Published versions are the record of what riders were told, so they never change or go away: a published rate card
-- not at all, a published dispatch policy only by its one withdrawal. published_at and withdrawn_at come from the database clock, so a
-- caller cannot backdate them; the in-force reads use the same clock.

-- A rate card needs 14 days' notice unless no other rate card was ever published.
CREATE OR REPLACE FUNCTION fleet_schema.rate_card_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'PUBLISHED' THEN
            RAISE EXCEPTION 'Rate card % is published, so it cannot be deleted.', OLD.version USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Rate card % is published, so it cannot change.', OLD.version USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> 'PUBLISHED' THEN
        RETURN NEW;
    END IF;
    NEW.published_at := now();
    -- One publish at a time, so two first cards cannot both start at once (FleetPolicyStore takes the same lock).
    PERFORM pg_advisory_xact_lock(hashtextextended('fleet-publish/rate_card', 0));
    -- A version that starts later needs a moment of its own, or which one is in force (or next) would be a guess.
    IF NEW.effective_from > NEW.published_at AND EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED'
        AND version <> NEW.version AND effective_from = NEW.effective_from) THEN
        RAISE EXCEPTION 'Rate card %: another version starts at that moment. Pick another start time.', NEW.version
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.effective_from < NEW.published_at + INTERVAL '14 days' AND EXISTS (
        SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED' AND version <> NEW.version) THEN
        RAISE EXCEPTION 'Rate card % must start at least 14 days after it is published.', NEW.version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- The pickup detour is part of rider pay. Once a rate card is published (riders have terms), a policy whose detour
-- differs from the one riders were shown (the policy in force, not withdrawn; else the newest draft's) needs 14 days'
-- notice. A published version that has not started may be withdrawn once, and stays withdrawn.
CREATE OR REPLACE FUNCTION fleet_schema.dispatch_policy_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    detour INTEGER;
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
        SELECT pickup_detour_percent INTO detour FROM fleet_schema.dispatch_policy
        WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND version <> NEW.version AND effective_from <= now()
        ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT pickup_detour_percent INTO detour FROM fleet_schema.dispatch_policy
            WHERE status = 'DRAFT' AND version <> NEW.version ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF FOUND AND detour <> NEW.pickup_detour_percent THEN
            RAISE EXCEPTION 'Dispatch policy % changes the pickup detour riders were shown, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER rate_card_notice BEFORE INSERT OR UPDATE OR DELETE
    ON fleet_schema.rate_card FOR EACH ROW EXECUTE FUNCTION fleet_schema.rate_card_notice();
CREATE OR REPLACE TRIGGER dispatch_policy_notice BEFORE INSERT OR UPDATE OR DELETE
    ON fleet_schema.dispatch_policy FOR EACH ROW EXECUTE FUNCTION fleet_schema.dispatch_policy_notice();
