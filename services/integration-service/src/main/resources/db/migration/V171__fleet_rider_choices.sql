-- Phase 4, rider choices (docs/riders/DISPATCH.md), set from the app only while CRAVES_FLEET_RIDER_CHOICES_ENABLED is on.
-- A break while online: no offers from started_at until ends_at; ending it sooner moves ends_at to then, and a new
-- break ends the one running first, so a shift's breaks never overlap. Break time adds nothing to a booked slot's
-- guaranteed minimum and is not online time in earnings per online hour (fair turns compare riders by it). Dispatch
-- always honours a break that is running, so one that started stays whole if the switch goes off.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_break (
    id         UUID        PRIMARY KEY,
    rider_id   UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    shift_id   UUID        NOT NULL REFERENCES fleet_schema.rider_shift (id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at    TIMESTAMPTZ NOT NULL,
    CHECK (ends_at >= started_at AND ends_at <= started_at + INTERVAL '60 minutes')
);
CREATE INDEX IF NOT EXISTS rider_break_shift ON fleet_schema.rider_break (shift_id, ends_at);

-- The farthest pickup and drop a rider wants to hear of, as the offer shows them (pickup: straight line x the policy's
-- detour). NULL: any distance. Dispatch reads them only while the switch is on.
ALTER TABLE fleet_schema.rider
    ADD COLUMN IF NOT EXISTS max_pickup_m INTEGER CHECK (max_pickup_m BETWEEN 500 AND 10000),
    ADD COLUMN IF NOT EXISTS max_drop_m   INTEGER CHECK (max_drop_m BETWEEN 1000 AND 20000);
