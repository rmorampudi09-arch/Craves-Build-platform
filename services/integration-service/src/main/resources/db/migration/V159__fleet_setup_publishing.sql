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

-- A rate card needs 14 days' notice unless no other rate card was ever published.
CREATE OR REPLACE FUNCTION fleet_schema.rate_card_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> 'PUBLISHED' THEN
        RETURN NEW;
    END IF;
    -- One publish at a time, so two first cards cannot both start at once (FleetPolicyStore takes the same lock).
    PERFORM pg_advisory_xact_lock(hashtextextended('fleet-publish/rate_card', 0));
    IF NEW.effective_from < NEW.published_at + INTERVAL '14 days' AND EXISTS (
        SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED' AND version <> NEW.version) THEN
        RAISE EXCEPTION 'Rate card % must start at least 14 days after it is published.', NEW.version
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- A dispatch policy needs 14 days' notice only when its detour differs from the policy in force when it is published
-- (before any is in force, the newest published one). The first policy ever starts at once.
CREATE OR REPLACE FUNCTION fleet_schema.dispatch_policy_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    detour INTEGER;
BEGIN
    IF NEW.status <> 'PUBLISHED' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('fleet-publish/dispatch_policy', 0));
    SELECT pickup_detour_percent INTO detour FROM fleet_schema.dispatch_policy
    WHERE status = 'PUBLISHED' AND version <> NEW.version
    ORDER BY (effective_from <= NEW.published_at) DESC, effective_from DESC LIMIT 1;
    IF FOUND AND detour <> NEW.pickup_detour_percent AND NEW.effective_from < NEW.published_at + INTERVAL '14 days' THEN
        RAISE EXCEPTION 'Dispatch policy % changes the pickup detour, so it must start at least 14 days after it is published.',
            NEW.version USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER rate_card_notice BEFORE INSERT OR UPDATE OF status, published_at, effective_from
    ON fleet_schema.rate_card FOR EACH ROW EXECUTE FUNCTION fleet_schema.rate_card_notice();
CREATE OR REPLACE TRIGGER dispatch_policy_notice BEFORE INSERT OR UPDATE OF status, published_at, effective_from, pickup_detour_percent
    ON fleet_schema.dispatch_policy FOR EACH ROW EXECUTE FUNCTION fleet_schema.dispatch_policy_notice();
