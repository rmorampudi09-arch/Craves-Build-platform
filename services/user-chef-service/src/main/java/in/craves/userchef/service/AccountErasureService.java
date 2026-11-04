package in.craves.userchef.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion for user-chef-service, one side at a time (a person can hold both roles).
 * <ul>
 *   <li>CUSTOMER: profile, every address (hard delete), the four favourite tables and launch alerts are deleted.</li>
 *   <li>CHEF: the chef application and its onboarding draft, help requests, visit and history copies lose name, contact,
 *       address and date of birth. The rows stay, the application is marked erased_at (a later re-application reopens
 *       it as a fresh draft). KYC documents, their blobs and evidence references (FSSAI number, proof kind) are kept.</li>
 *   <li>Both: the person's own support text is blanked (staff replies and history stay) and their notice outbox rows are deleted.</li>
 * </ul>
 * Nothing here is ever blocked, and a second call changes nothing and reports zero counts.
 */
@Service
public class AccountErasureService {
    /** ALL is CUSTOMER and CHEF together. */
    public enum Scope { CUSTOMER, CHEF, ALL }

    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    /** Fills every NOT NULL text column that held a personal value. */
    static final String DELETED = "Deleted";
    /**
     * Personal keys inside the JSON copies of an application (camelCase in the draft, snake_case in row snapshots).
     * Not listed on purpose: fssaiNumber, proofKind, otherGovernmentId, reference_code, blob and file names. They point at the kept KYC evidence.
     */
    private static final String PERSONAL_KEYS = "ARRAY['email','firstName','lastName','dateOfBirth','kitchenName','kitchenDescription',"
        + "'addressLine1','addressLine2','landmark','city','state','postalCode','latitude','longitude',"
        + "'phone_number','first_name','last_name','address_line1','address_line2','postal_code']::text[]";
    /** The help request's support case holds the applicant's name, phone and email, so it belongs to the chef side. */
    private static final String HELP_CASE = "EXISTS (SELECT 1 FROM chef_onboarding_help h WHERE h.support_case_id = c.id)";

    private final JdbcTemplate jdbc;

    public AccountErasureService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Integer> erase(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CHEF) {
            for (String table : new String[] {"customer_profile", "customer_address", "customer_favorite_chef", "customer_favorite_kitchen",
                "customer_favorite_menu_item", "customer_favorite_watch", "customer_kitchen_launch_alert"}) {
                counts.put(table, jdbc.update("DELETE FROM " + table + " WHERE identity_id = ?", identityId));
            }
        }
        if (scope != Scope.CUSTOMER) {
            eraseChef(identityId, counts);
        }
        String cases = switch (scope) {
            case CUSTOMER -> "c.requester_role = 'CUSTOMER' AND NOT " + HELP_CASE;
            case CHEF -> "(c.requester_role = 'CHEF' OR " + HELP_CASE + ")";
            case ALL -> "TRUE";
        };
        counts.put("support_case", jdbc.update(
            "UPDATE support_case c SET subject = ? WHERE c.requester_identity_id = ? AND c.subject <> ? AND " + cases,
            DELETED, identityId, DELETED));
        counts.put("support_case_message", jdbc.update(
            "UPDATE support_case_message m SET body = ? FROM support_case c "
                + "WHERE c.id = m.case_id AND c.requester_identity_id = ? AND m.sender_identity_id = ? AND m.body <> ? AND " + cases,
            DELETED, identityId, identityId, DELETED));
        counts.put("notification_outbox", switch (scope) {
            case ALL -> jdbc.update("DELETE FROM notification_outbox WHERE user_identity_id = ?", identityId);
            default -> jdbc.update("DELETE FROM notification_outbox WHERE user_identity_id = ? AND user_role = ?", identityId, scope.name());
        });
        LOGGER.info("ACCOUNT_ERASURE service=user-chef requestId={} scope={} counts={}", requestId, scope, counts);
        return counts;
    }

    private void eraseChef(UUID identityId, Map<String, Integer> counts) {
        counts.put("chef_application", jdbc.update(
            "UPDATE chef_application SET phone_number = ?, email = ?, first_name = ?, last_name = ?, address_line1 = ?, address_line2 = NULL, "
                + "landmark = NULL, city = ?, state = ?, postal_code = NULL, latitude = NULL, longitude = NULL, erased_at = now(), updated_at = now() "
                + "WHERE identity_id = ? AND erased_at IS NULL",
            DELETED, DELETED, DELETED, DELETED, DELETED, DELETED, DELETED, identityId));
        counts.put("chef_onboarding_draft", jdbc.update(
            "UPDATE chef_onboarding_draft SET details = " + stripped("details") + " WHERE identity_id = ? AND " + hasPersonal("details"),
            identityId));
        // An erased person's callback request cannot be served: it leaves the staff queue and frees the one-open-request slot.
        counts.put("chef_onboarding_help", jdbc.update(
            "UPDATE chef_onboarding_help SET phone_number = ?, message = ?, status = 'RESOLVED', details = " + stripped("details")
                + " WHERE identity_id = ? AND (phone_number <> ? OR message <> ? OR status <> 'RESOLVED' OR " + hasPersonal("details") + ")",
            DELETED, DELETED, identityId, DELETED, DELETED));
        counts.put("chef_onboarding_visit", jdbc.update(
            "UPDATE chef_onboarding_visit SET phone_number = ? WHERE identity_id = ? AND phone_number <> ?", DELETED, identityId, DELETED));
        // REOPENED_AFTER_ERASURE snapshots are the kept KYC record of an erased application: never rewritten.
        for (String table : new String[] {"chef_onboarding_document_history", "chef_onboarding_action_audit"}) {
            counts.put(table, jdbc.update(
                "UPDATE " + table + " SET snapshot = " + stripped("snapshot") + " WHERE identity_id = ? AND action <> 'REOPENED_AFTER_ERASURE' AND "
                    + hasPersonal("snapshot"),
                identityId));
        }
    }

    /** The JSON without personal keys, also inside its "application" and "details" parts (the reopened-application audit snapshot). */
    private static String stripped(String column) {
        String top = "(" + column + " - " + PERSONAL_KEYS + ")";
        String application = "COALESCE(jsonb_set(" + top + ", '{application}', (" + top + "->'application') - " + PERSONAL_KEYS + ", false), " + top + ")";
        return "COALESCE(jsonb_set(" + application + ", '{details}', (" + application + "->'details') - " + PERSONAL_KEYS + ", false), " + application + ")";
    }

    /** jsonb_exists_any is the function form of the ?| operator, which JDBC would read as a parameter. */
    private static String hasPersonal(String column) {
        return "(jsonb_exists_any(" + column + ", " + PERSONAL_KEYS + ") OR jsonb_exists_any(" + column + "->'application', " + PERSONAL_KEYS
            + ") OR jsonb_exists_any(" + column + "->'details', " + PERSONAL_KEYS + "))";
    }
}
