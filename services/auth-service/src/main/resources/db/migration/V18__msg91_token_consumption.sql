-- One successful MSG91 verification can mint at most one Firebase custom token.
-- Digests are retained because the provider, not Craves, controls token lifetime.
CREATE TABLE msg91_consumed_token (
    token_hash VARCHAR(43) PRIMARY KEY,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
