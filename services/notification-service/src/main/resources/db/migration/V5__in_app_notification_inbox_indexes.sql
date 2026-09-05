-- Stable cursor pagination reads newest notifications by recipient and uses id
-- as the deterministic tie-breaker when multiple notices share created_at.
CREATE INDEX IF NOT EXISTS idx_in_app_notification_recipient_cursor
    ON notification_schema.in_app_notification (
        recipient_identity_id,
        created_at DESC,
        id DESC
    );

-- The partial unread index supports unread-only inbox pages and badge counts
-- without scanning the recipient's full historical notification stream.
CREATE INDEX IF NOT EXISTS idx_in_app_notification_recipient_unread_cursor
    ON notification_schema.in_app_notification (
        recipient_identity_id,
        created_at DESC,
        id DESC
    )
    WHERE read_at IS NULL;
