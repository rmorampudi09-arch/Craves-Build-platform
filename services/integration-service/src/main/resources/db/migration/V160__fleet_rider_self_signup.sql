-- Riders sign up in the app, like chefs (25 Oct 2026). Ops still checks every document and the payout account by hand.

-- What the rider rides decides which documents they send: a bicycle needs no licence or RC, an electric bike no PUC.
-- NULL for riders ops added before this: they send the petrol two-wheeler set.
ALTER TABLE fleet_schema.rider ADD COLUMN IF NOT EXISTS vehicle_kind VARCHAR(8)
    CHECK (vehicle_kind IN ('PETROL', 'ELECTRIC', 'BICYCLE'));

-- A payout account the rider typed in the app is SUBMITTED: it is never paid (payouts read only ACTIVE) until ops
-- confirms it against the bank proof and the KYC name. It is not seen in person, so verified_in_person may be false.
ALTER TABLE fleet_schema.rider_payout_account DROP CONSTRAINT IF EXISTS rider_payout_account_state_check;
ALTER TABLE fleet_schema.rider_payout_account
    ADD CONSTRAINT rider_payout_account_state_check CHECK (state IN ('ACTIVE', 'REPLACED', 'SUBMITTED'));
ALTER TABLE fleet_schema.rider_payout_account DROP CONSTRAINT IF EXISTS rider_payout_account_verified_in_person_check;
CREATE UNIQUE INDEX IF NOT EXISTS rider_payout_account_one_submitted
    ON fleet_schema.rider_payout_account (rider_id) WHERE state = 'SUBMITTED';
