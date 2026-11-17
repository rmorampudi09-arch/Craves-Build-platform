-- Finds a booking-journal attempt by the courier's booking id (CourierStrayBookings; CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED,
-- default off: the table is empty until then). Additive only.
CREATE INDEX IF NOT EXISTS provider_create_attempt_provider_ref
    ON delivery_schema.provider_create_attempt (provider_id, provider_ref)
    WHERE provider_ref IS NOT NULL;
