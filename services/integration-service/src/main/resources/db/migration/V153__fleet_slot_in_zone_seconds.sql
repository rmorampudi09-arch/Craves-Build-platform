-- In-zone seconds per slot (PLAN F7b): location ingest adds each gap between two non-mock fixes, clipped to the slot,
-- while the slot is BOOKED and running, so the guaranteed top-up settles on the slot's own seconds rather than on a
-- shift's counter capped at its overlap with the slot. Re-runnable like V152: database tests migrate again.
ALTER TABLE fleet_schema.rider_slot
    ADD COLUMN IF NOT EXISTS in_zone_seconds INTEGER NOT NULL DEFAULT 0 CHECK (in_zone_seconds >= 0);
