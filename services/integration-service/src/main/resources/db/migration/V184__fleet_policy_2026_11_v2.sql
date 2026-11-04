-- Dispatch policy 2026-11-v2 (app 1.3.3, docs/riders/REDESIGN.md R-09): the same timers as the policy riders see now plus
-- two rule lines, "orders near each other are shared out together" and "you may hear of your next order before this one
-- ends". The lines are terms riders are shown; dispatch itself does not read these flags yet (that is a later PR).
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS joint_matching    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS next_order_offers BOOLEAN NOT NULL DEFAULT false;

-- Before any policy is published (a fresh install) the two lines join the draft riders are shown and no version is spent.
-- Once a policy is published, the one riders are shown is copied as 2026-11-v2, published, starting 14 days from the
-- deploy (the notice riders are owed). GOPI: the copy takes its timers from whatever policy is shown at deploy time.
DO $$
DECLARE
    source VARCHAR(40);
BEGIN
    IF EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE version = '2026-11-v2' OR joint_matching) THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED') THEN
        UPDATE fleet_schema.dispatch_policy SET joint_matching = true, next_order_offers = true
        WHERE version = (SELECT version FROM fleet_schema.dispatch_policy WHERE status = 'DRAFT' ORDER BY created_at DESC LIMIT 1);
        RETURN;
    END IF;
    SELECT version INTO source FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL
    ORDER BY CASE WHEN effective_from <= now() THEN 0 ELSE 1 END,
             CASE WHEN effective_from <= now() THEN effective_from END DESC NULLS LAST,
             effective_from ASC
    LIMIT 1;
    IF source IS NULL THEN
        RETURN;
    END IF;
    CREATE TEMP TABLE policy_copy ON COMMIT DROP AS SELECT * FROM fleet_schema.dispatch_policy WHERE version = source;
    UPDATE policy_copy SET
        version = '2026-11-v2',
        status = 'PUBLISHED',
        published_at = now(),
        published_by = NULL,
        effective_from = now() + INTERVAL '14 days',
        withdrawn_at = NULL,
        withdrawn_by = NULL,
        created_at = now(),
        joint_matching = true,
        next_order_offers = true;
    INSERT INTO fleet_schema.dispatch_policy SELECT * FROM policy_copy;
END $$;
