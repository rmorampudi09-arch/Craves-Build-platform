CREATE TABLE notification_schema.notification_preference (
    id uuid PRIMARY KEY,
    recipient_identity_id uuid NOT NULL,
    user_role varchar(30),
    category_key varchar(50) NOT NULL,
    in_app_enabled boolean NOT NULL DEFAULT true,
    push_enabled boolean NOT NULL DEFAULT true,
    email_enabled boolean NOT NULL DEFAULT true,
    sms_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_notification_preference_identity_category UNIQUE (recipient_identity_id, category_key)
);

CREATE INDEX idx_notification_preference_identity
    ON notification_schema.notification_preference (recipient_identity_id, category_key);

INSERT INTO notification_schema.notification_preference (
    id,
    recipient_identity_id,
    user_role,
    category_key,
    in_app_enabled,
    push_enabled,
    email_enabled,
    sms_enabled,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    nr.recipient_identity_id,
    max(nr.recipient_role),
    category_key.category_key,
    true,
    true,
    true,
    false,
    now(),
    now()
FROM notification_schema.notification_request nr
CROSS JOIN (
    VALUES
        ('ORDER_UPDATES'),
        ('PROMOTIONAL'),
        ('REMINDERS'),
        ('LOYALTY'),
        ('CHEF_UPDATES')
) AS category_key(category_key)
GROUP BY nr.recipient_identity_id, category_key.category_key;
