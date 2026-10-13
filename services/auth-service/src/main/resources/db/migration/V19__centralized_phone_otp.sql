CREATE TABLE auth_phone_otp (
    phone_hash varchar(64) PRIMARY KEY,
    phone_number varchar(16) NOT NULL,
    challenge_hash varchar(64) UNIQUE,
    state varchar(16) NOT NULL DEFAULT 'FAILED',
    operation_id uuid,
    lease_until bigint NOT NULL DEFAULT 0,
    expires_at bigint NOT NULL DEFAULT 0,
    resend_at bigint NOT NULL DEFAULT 0,
    attempts integer NOT NULL DEFAULT 0,
    resends integer NOT NULL DEFAULT 0,
    updated_at bigint NOT NULL
);
CREATE INDEX auth_phone_otp_cleanup ON auth_phone_otp(updated_at);
CREATE TABLE auth_phone_otp_limits (
    scope varchar(80) NOT NULL,
    bucket bigint NOT NULL,
    count integer NOT NULL,
    PRIMARY KEY(scope, bucket)
);
CREATE INDEX auth_phone_otp_limits_cleanup ON auth_phone_otp_limits(bucket);
