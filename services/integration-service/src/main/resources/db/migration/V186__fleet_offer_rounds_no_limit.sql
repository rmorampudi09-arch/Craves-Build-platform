-- A dispatch policy may run with no limit on rounds: offer_rounds 0 (FleetPolicyStore.DispatchPolicy.wholeStage,
-- docs/riders/DISPATCH.md §2). The order then stays with Craves riders for the whole fleet stage, one rider after another
-- and the same riders again, so an offer's round is no longer capped at 5. Nothing changes for the policies there are:
-- no policy has 0 until one is published with it.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
    found record;
BEGIN
    FOR found IN
        SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
        WHERE contype = 'c'
          AND ((conrelid = 'fleet_schema.dispatch_policy'::regclass AND pg_get_constraintdef(oid) LIKE '%offer_rounds%')
            OR (conrelid = 'fleet_schema.trip_offer'::regclass AND pg_get_constraintdef(oid) LIKE '%round%'))
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', found.tbl, found.conname);
    END LOOP;
END $$;
ALTER TABLE fleet_schema.dispatch_policy ADD CONSTRAINT dispatch_policy_offer_rounds_check CHECK (offer_rounds BETWEEN 0 AND 5);
ALTER TABLE fleet_schema.trip_offer ADD CONSTRAINT trip_offer_round_check CHECK (round >= 1);
