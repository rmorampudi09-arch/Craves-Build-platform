-- The owner's rule of 11 Nov 2026 (docs/riders/DISPATCH.md §2 and §7): every order goes to Craves riders first, one rider
-- at a time with 20 seconds each, for 5 minutes; once every rider nearby has been asked the same riders are asked again;
-- only after the 5 minutes does Borzo get it. That is a policy with 20 s offers, a 300 s fleet stage, one rider at a time
-- and no limit on rounds (offer_rounds 0, which every server has understood since V186's release). The policy in force
-- starts again with those values, and FleetPolicyStore's built-in values are the same from this release on.
SET LOCAL lock_timeout = '5s';

-- Riders have terms (a rate card is published), so the notice trigger would hold a change to how orders are offered for
-- 14 days. The owner chose to start this one now, so the trigger is off for these statements only and back on before the
-- migration commits; every later change keeps its notice.
ALTER TABLE fleet_schema.dispatch_policy DISABLE TRIGGER dispatch_policy_notice;

-- Before any policy is published the draft's ranges are the declared ones: 20 seconds and 5 minutes must fit them.
UPDATE fleet_schema.dispatch_policy
SET ranges = ranges || '{"offer_seconds": [20, 60], "fleet_stage_seconds": [45, 300]}'
WHERE status = 'DRAFT' AND ranges ? 'offer_seconds';

-- A version scheduled for later would bring the old rules back on its start date: withdrawn, as the emergency stop does.
UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now()
WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from > now();

-- The policy in force starts again as a new version with the rule, in the mode it has now (production: live), published
-- by no one. Where no policy is in force (a fresh database), nothing is inserted: the first one set takes the built-in values.
INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, fleet_stage_seconds,
    radius_m, ranges, pickup_detour_percent, per_order_overhead_paise, cost_guard_premium_paise, pidge_stage_seconds,
    offers_at_once, offer_rounds, fair_band_m, rank_by_travel_time, joint_matching, next_order_offers)
SELECT month.prefix || '-v' || (SELECT COALESCE(max(substring(version FROM '-v([0-9]+)$')::int), 0) + 1
                                FROM fleet_schema.dispatch_policy WHERE version LIKE month.prefix || '-v%'),
       'PUBLISHED', now(), now(), mode, 20, 300, radius_m,
       ranges || '{"offer_seconds": [20, 60], "fleet_stage_seconds": [45, 300]}', pickup_detour_percent, per_order_overhead_paise,
       cost_guard_premium_paise, pidge_stage_seconds, 1, 0, fair_band_m, rank_by_travel_time, joint_matching, next_order_offers
FROM fleet_schema.dispatch_policy, (SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS prefix) month
WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from <= now()
ORDER BY effective_from DESC, created_at DESC
LIMIT 1;

ALTER TABLE fleet_schema.dispatch_policy ENABLE TRIGGER dispatch_policy_notice;
