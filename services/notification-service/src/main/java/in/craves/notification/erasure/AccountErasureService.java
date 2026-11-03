package in.craves.notification.erasure;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion for notification-service. In-app notices are deleted per role. Request rows stay (the delivery
 * attempt and dead-letter tables point at them) but lose their text, address and payload, and a request that was not
 * sent yet is stopped first so it can never go out blank. Devices and channel preferences belong to the whole account,
 * so only ALL removes them, and only the customer/chef app's devices: a rider phone is another app's.
 * pdf_document, its audit and e-mail rows and the verification receipts are legal records behind triggers; never touched.
 */
@Service
public class AccountErasureService {
    /** ALL is CUSTOMER and CHEF together. */
    public enum Scope { CUSTOMER, CHEF, ALL }

    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String NS = "notification_schema.";
    // Roles are compared case-insensitively like the inbox does; ALL also takes rows that have no role (old rows).
    private static final String ROLE = " AND upper(recipient_role) = ?";

    private final JdbcTemplate jdbc;

    public AccountErasureService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Integer> erase(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        // Stop first, in the same transaction: the delivery worker skips locked rows, so no request can be claimed half-erased.
        // The statuses are the ones the worker claims (PENDING, FAILED, a PROCESSING lease) plus DEAD_LETTER, which an admin can requeue.
        counts.put("notification_request_stopped", update(identityId, scope, """
            UPDATE notification_schema.notification_request
               SET status = 'SKIPPED', last_error = 'Account erased; not sent', next_attempt_at = NULL, lock_token = NULL,
                   locked_at = NULL, updated_at = now()
             WHERE recipient_identity_id = ?%s AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER')
            """));
        counts.put("notification_request", update(identityId, scope, """
            UPDATE notification_schema.notification_request
               SET body = '', payload = '{}'::jsonb, delivery_address = NULL, updated_at = now()
             WHERE recipient_identity_id = ?%s AND (body <> '' OR payload <> '{}'::jsonb OR delivery_address IS NOT NULL)
            """));
        counts.put("in_app_notification", update(identityId, scope,
            "DELETE FROM " + NS + "in_app_notification WHERE recipient_identity_id = ?%s"));
        if (scope == Scope.ALL) {
            counts.put("notification_preference", jdbc.update(
                "DELETE FROM " + NS + "notification_preference WHERE recipient_identity_id = ?", identityId));
            counts.put("push_device_registration", jdbc.update(
                "DELETE FROM " + NS + "push_device_registration WHERE recipient_identity_id = ? AND app = 'customer'", identityId));
        }
        LOGGER.info("Account erasure service=notification requestId={} scope={} counts={}", requestId, scope, counts);
        return counts;
    }

    /** Runs a statement for the identity, narrowed to one role unless the scope is ALL; "%s" marks where the role goes. */
    private int update(UUID identityId, Scope scope, String sql) {
        return scope == Scope.ALL
            ? jdbc.update(sql.formatted(""), identityId)
            : jdbc.update(sql.formatted(ROLE), identityId, scope.name());
    }
}
