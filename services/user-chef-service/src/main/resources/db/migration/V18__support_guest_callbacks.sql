-- Website visitors who are not signed in can ask the support assistant for a callback (13 Oct 2026).
-- Their cases belong to no identity: requester and sender role GUEST, identity NULL. The contact details
-- the visitor gave are in the first message, so the admin inbox shows them without new columns.
ALTER TABLE support_case ALTER COLUMN requester_identity_id DROP NOT NULL;
ALTER TABLE support_case DROP CONSTRAINT chk_support_case_requester_role;
ALTER TABLE support_case ADD CONSTRAINT chk_support_case_requester_role CHECK (
    requester_role IN ('CUSTOMER', 'CHEF', 'GUEST')
    AND (requester_role = 'GUEST') = (requester_identity_id IS NULL)
);

ALTER TABLE support_case_message ALTER COLUMN sender_identity_id DROP NOT NULL;
ALTER TABLE support_case_message DROP CONSTRAINT chk_support_case_message_role;
ALTER TABLE support_case_message ADD CONSTRAINT chk_support_case_message_role CHECK (
    sender_role IN ('CUSTOMER', 'CHEF', 'SUPPORT_ADMIN', 'PLATFORM_ADMIN', 'GUEST')
    AND (sender_role = 'GUEST') = (sender_identity_id IS NULL)
);

ALTER TABLE support_case_status_history ALTER COLUMN actor_identity_id DROP NOT NULL;
ALTER TABLE support_case_status_history ADD CONSTRAINT chk_support_case_history_actor CHECK (
    (actor_role = 'GUEST') = (actor_identity_id IS NULL)
);
