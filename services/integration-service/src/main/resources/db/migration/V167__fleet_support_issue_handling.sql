-- Ops acknowledge and fix riders' support issues in the console (WORKPLAN P2-06 c): who did each, and what was
-- done. acknowledged_at and fixed_at exist since V152; nothing else changes.
ALTER TABLE fleet_schema.support_issue ADD COLUMN IF NOT EXISTS acknowledged_by_name VARCHAR(120);
ALTER TABLE fleet_schema.support_issue ADD COLUMN IF NOT EXISTS fixed_by_name VARCHAR(120);
ALTER TABLE fleet_schema.support_issue ADD COLUMN IF NOT EXISTS resolution VARCHAR(1000);
