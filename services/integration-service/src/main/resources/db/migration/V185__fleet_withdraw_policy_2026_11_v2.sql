-- Withdraws dispatch policy 2026-11-v2 before it starts (6 Nov 2026: the owner switches dispatch to live now, with the
-- rules riders are shown). V184 copied the policy riders saw, in Shadow, adding two rule lines the dispatcher does not act
-- on yet, published to start 14 days after the deploy. Until then every version ops set counted as a change of rules
-- needing 14 days' notice, the emergency stop included, and on its start date it would have switched a live dispatch back
-- to Shadow. Withdrawing a version that has not started is what the emergency stop does
-- (FleetPolicyStore.publishDispatchPolicy). Riders keep the rules they have now; the two lines come back, with notice,
-- when the dispatcher acts on them. Only V184's own copy is touched: published by no one, not withdrawn, still to start.
-- Idempotent: a second run, or a database where V184 copied nothing, changes nothing.
UPDATE fleet_schema.dispatch_policy
SET withdrawn_at = now()
WHERE version = '2026-11-v2'
  AND status = 'PUBLISHED'
  AND published_by IS NULL
  AND withdrawn_at IS NULL
  AND effective_from > now();
