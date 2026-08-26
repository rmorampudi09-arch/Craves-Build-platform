CREATE TABLE IF NOT EXISTS notification_schema.notification_preference (
    user_id uuid NOT NULL,
    topic varchar(64) NOT NULL,
    channel varchar(32) NOT NULL,
    enabled boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification_preference PRIMARY KEY (user_id, topic, channel),
    CONSTRAINT ck_notification_preference_topic CHECK (
        topic IN ('ORDER_UPDATES', 'OFFERS', 'CHEF_ANNOUNCEMENTS', 'REMINDERS', 'REFERRALS', 'REWARDS')
    ),
    CONSTRAINT ck_notification_preference_channel CHECK (
        channel IN ('IN_APP', 'PUSH', 'EMAIL', 'SMS')
    )
);

CREATE INDEX IF NOT EXISTS idx_notification_preference_user_channel
    ON notification_schema.notification_preference (user_id, channel);
