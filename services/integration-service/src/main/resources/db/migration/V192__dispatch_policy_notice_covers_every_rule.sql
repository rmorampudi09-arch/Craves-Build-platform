-- The 14 days' notice of a change to how orders are offered (Telangana Act 21 of 2026, s.13(2); docs/riders/DISPATCH.md §1)
-- now covers every rules column, including ones added later. Until here the trigger named the rules one by one (V170,
-- V174), so joint_matching and next_order_offers (V184) were held only by FleetPolicyStore, and a column added later would
-- have changed riders' terms with no notice unless someone remembered to name it. Now a version is compared with the one
-- riders are shown column for column, leaving out only the columns named below. A new column is a rule unless it is added
-- to that list on purpose (and to NOT_RULES in FleetPolicyStoreDatabaseTest, which tests every other column).
-- Only the function is replaced: no row is read or changed here, and the trigger stays on throughout. Otherwise as V174.
CREATE OR REPLACE FUNCTION fleet_schema.dispatch_policy_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    shown RECORD;
    -- Not rules: a version's identity and lifecycle, its mode (the emergency stop is immediate), and the operations values
    -- that change at once inside their declared ranges (DISPATCH.md §7).
    not_rules CONSTANT TEXT[] := ARRAY['version', 'status', 'effective_from', 'published_at', 'published_by', 'created_at',
        'withdrawn_at', 'withdrawn_by', 'mode', 'ranges', 'offer_seconds', 'fleet_stage_seconds', 'radius_m',
        'per_order_overhead_paise', 'cost_guard_premium_paise', 'pidge_stage_seconds'];
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
        SELECT * INTO shown FROM fleet_schema.dispatch_policy
        WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND version <> NEW.version AND effective_from <= now()
        ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT * INTO shown FROM fleet_schema.dispatch_policy
            WHERE status = 'DRAFT' AND version <> NEW.version ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF FOUND AND shown.pickup_detour_percent <> NEW.pickup_detour_percent THEN
            RAISE EXCEPTION 'Dispatch policy % changes the pickup detour riders were shown, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
        IF FOUND AND to_jsonb(shown) - not_rules <> to_jsonb(NEW) - not_rules THEN
            RAISE EXCEPTION 'Dispatch policy % changes how orders are offered to riders, so it must start at least 14 days after it is published.',
                NEW.version USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
