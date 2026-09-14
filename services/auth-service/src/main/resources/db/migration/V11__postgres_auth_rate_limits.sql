-- Ephemeral capacity counters only. No credentials, IP addresses or request bodies are retained.
CREATE TABLE auth_rate_limit_counter (
    bucket_key VARCHAR(128) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    request_count BIGINT NOT NULL CHECK (request_count > 0),
    PRIMARY KEY (bucket_key, window_start),
    CHECK (expires_at > window_start)
);
CREATE INDEX auth_rate_limit_expiry ON auth_rate_limit_counter(expires_at);
