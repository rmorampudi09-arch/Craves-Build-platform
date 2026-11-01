-- Ops can give a rider's trip before pickup to another rider (WORKPLAN P2-06 f). A trip row is one rider's pay record,
-- so the second rider gets a new trip for the same order: the first gets replaced_at, the new one names it in replaces.
-- Expand only: one current trip per order is now an index, but the old one-trip-per-order constraint stays, because
-- integration-service images before this release insert trips with ON CONFLICT (chef_sub_order_id) and need it. A
-- later migration, shipped once no older image can run, drops trip_chef_sub_order_id_key; handovers wait for it.
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS replaces UUID REFERENCES fleet_schema.trip (id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_current_per_order ON fleet_schema.trip (chef_sub_order_id) WHERE replaced_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trip_replaced_once ON fleet_schema.trip (replaces) WHERE replaces IS NOT NULL;
