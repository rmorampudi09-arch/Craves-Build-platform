-- When each rider accepted the privacy notice (WORKPLAN P2-09, DPDP; the lawyer writes the text). The version in force
-- is the CRAVES_FLEET_PRIVACY_NOTICE_VERSION setting, empty until the text exists; a row only once a rider accepts one.
CREATE TABLE IF NOT EXISTS fleet_schema.rider_privacy_acceptance (
    rider_id    UUID        NOT NULL REFERENCES fleet_schema.rider (id),
    version     VARCHAR(40) NOT NULL CHECK (char_length(btrim(version)) >= 1),
    language    VARCHAR(2)  NOT NULL CHECK (language IN ('en', 'te', 'hi')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, version)
);
