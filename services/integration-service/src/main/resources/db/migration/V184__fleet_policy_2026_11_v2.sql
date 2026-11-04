-- Dispatch policy 2026-11-v2 (app 1.3.3, docs/riders/REDESIGN.md R-09): the same timers as the policy riders see now plus
-- two rule lines, "orders near each other are shared out together" and "you may hear of your next order before this one
-- ends". The lines are terms riders are shown; dispatch itself does not read these flags yet (that is a later PR).
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS joint_matching    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS next_order_offers BOOLEAN NOT NULL DEFAULT false;

-- Before any policy is published (a fresh install) the two lines join the draft riders are shown and no version is spent.
-- Once a policy is published, the one riders are shown is copied as 2026-11-v2, published, starting 14 days from the
-- deploy (the notice riders are owed). GOPI: the copy takes its timers from whatever policy is shown at deploy time.
-- A policy already published to start later than now (ops scheduled a change) is never overtaken: then nothing is
-- copied, a NOTICE says so, and ops sets the next version with the lines.
DO $$
DECLARE
    copy fleet_schema.dispatch_policy%ROWTYPE;
BEGIN
    IF EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE version = '2026-11-v2' OR joint_matching) THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED') THEN
        UPDATE fleet_schema.dispatch_policy SET joint_matching = true, next_order_offers = true
        WHERE version = (SELECT version FROM fleet_schema.dispatch_policy WHERE status = 'DRAFT' ORDER BY created_at DESC LIMIT 1);
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from > now()) THEN
        RAISE NOTICE 'V184: a dispatch policy is already published to start later; 2026-11-v2 was not created. Set the next version with the lines.';
        RETURN;
    END IF;
    SELECT * INTO copy FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from <= now()
    ORDER BY effective_from DESC, created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    copy.version := '2026-11-v2';
    copy.status := 'PUBLISHED';
    copy.published_at := now();
    copy.published_by := NULL;
    copy.effective_from := now() + INTERVAL '14 days';
    copy.withdrawn_at := NULL;
    copy.withdrawn_by := NULL;
    copy.created_at := now();
    copy.joint_matching := true;
    copy.next_order_offers := true;
    INSERT INTO fleet_schema.dispatch_policy VALUES (copy.*);
END $$;
