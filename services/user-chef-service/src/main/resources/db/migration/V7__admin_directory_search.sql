CREATE INDEX IF NOT EXISTS ix_customer_profile_phone
    ON customer_profile (registered_phone_number);

CREATE INDEX IF NOT EXISTS ix_customer_profile_email_lower
    ON customer_profile (lower(email))
    WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_customer_profile_name_lower
    ON customer_profile (lower(first_name), lower(last_name));

CREATE INDEX IF NOT EXISTS ix_chef_application_phone
    ON chef_application (phone_number);

CREATE INDEX IF NOT EXISTS ix_chef_application_email_lower
    ON chef_application (lower(email));

CREATE INDEX IF NOT EXISTS ix_chef_application_name_lower
    ON chef_application (lower(first_name), lower(last_name));

CREATE TABLE IF NOT EXISTS admin_directory_lookup_audit (
    id UUID PRIMARY KEY,
    admin_identity_id UUID NOT NULL,
    correlation_id UUID NOT NULL UNIQUE,
    action_type VARCHAR(40) NOT NULL,
    query_type VARCHAR(40) NOT NULL,
    query_sha256 VARCHAR(64) NOT NULL,
    target_identity_id UUID,
    result_count INTEGER NOT NULL DEFAULT 0,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_admin_directory_action CHECK (action_type IN ('SEARCH', 'CUSTOMER_CASE', 'CHEF_CASE')),
    CONSTRAINT ck_admin_directory_result_count CHECK (result_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_admin_directory_lookup_admin_created
    ON admin_directory_lookup_audit (admin_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_admin_directory_lookup_target_created
    ON admin_directory_lookup_audit (target_identity_id, created_at DESC)
    WHERE target_identity_id IS NOT NULL;
