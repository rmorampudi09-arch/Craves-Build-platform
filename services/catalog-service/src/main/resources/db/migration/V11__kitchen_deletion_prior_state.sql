-- Account deletion closes a kitchen; these columns keep how it was, so "Keep my account" can put it back exactly.
ALTER TABLE catalog_schema.kitchen_schedule_config
    ADD COLUMN deletion_prior_accepting     BOOLEAN,
    ADD COLUMN deletion_prior_paused_until  TIMESTAMPTZ,
    ADD COLUMN deletion_prior_pause_reason  VARCHAR(160),
    ADD COLUMN deletion_prior_saved         BOOLEAN NOT NULL DEFAULT false;
