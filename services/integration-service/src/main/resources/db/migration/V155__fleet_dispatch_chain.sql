-- Craves rider dispatch chain (PLAN "Dispatch flow", F8a, F8b, F9). Re-runnable like V152.

-- craves_fleet is a delivery provider so a rider's delivery job can reference it. It stays inactive in the catalog on
-- purpose: routing never quotes or books it; the fleet runs as its own stage before Borzo and Pidge.
INSERT INTO delivery_schema.delivery_provider (provider_id, display_name, adapter_type, is_active, service_areas, capabilities)
VALUES ('craves_fleet', 'Craves riders', 'CRAVES_FLEET', FALSE, '[]'::jsonb,
        '{"QUOTE": true, "CREATE_DELIVERY": false, "CANCEL": true, "TRACK": true, "WEBHOOK": false}'::jsonb)
ON CONFLICT (provider_id) DO NOTHING;

-- After Borzo's 120-second window, Pidge has this long to assign a courier before the order goes to the ops queue.
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS pidge_stage_seconds INTEGER NOT NULL DEFAULT 600 CHECK (pidge_stage_seconds BETWEEN 60 AND 3600);
UPDATE fleet_schema.dispatch_policy SET ranges = ranges || '{"pidge_stage_seconds": [120, 1800]}'
WHERE status = 'DRAFT' AND ranges -> 'pidge_stage_seconds' IS NULL;

-- When the rider accepted: the 90-second watchdog counts from here until a location arrives.
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS trip_before_pickup ON fleet_schema.trip (accepted_at)
    WHERE provider = 'CRAVES_FLEET' AND state IN ('ASSIGNED', 'AT_PICKUP');

-- The chef's "ready" time (ORDER_READY_FOR_PICKUP), kept even when it arrives before the trip exists.
CREATE TABLE IF NOT EXISTS fleet_schema.chef_ready (
    chef_sub_order_id UUID PRIMARY KEY,
    ready_at          TIMESTAMPTZ NOT NULL,
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_stage_open_courier ON fleet_schema.trip_stage (deadline_at)
    WHERE state = 'OPEN' AND provider IN ('BORZO', 'PIDGE', 'OPS_QUEUE');
