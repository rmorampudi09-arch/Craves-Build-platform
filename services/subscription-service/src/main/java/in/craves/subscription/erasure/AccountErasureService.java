package in.craves.subscription.erasure;

import in.craves.subscription.erasure.AccountErasureDtos.Blocker;
import in.craves.subscription.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.subscription.erasure.AccountErasureDtos.Scope;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleService;
import in.craves.subscription.security.CurrentUser;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion. CUSTOMER: plans are cancelled when deletion is requested (prepare), erase waits while any is still
 * running, and their free text is blanked at erase. CHEF: plans stop taking subscribers at request and are archived at erase. Money rows (invoices, credits) and
 * status history are never changed. Every step is safe to repeat.
 */
@Service
public class AccountErasureService {
    /** What notes and skip reasons are replaced with. */
    public static final String ERASED_TEXT = "[deleted]";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String SCHEMA = "subscription_schema.";

    private final JdbcTemplate db;
    private final SubscriptionLifecycleService lifecycle;

    public AccountErasureService(JdbcTemplate db, SubscriptionLifecycleService lifecycle) {
        this.db = db;
        this.lifecycle = lifecycle;
    }

    public List<Blocker> blockers(UUID identityId, Scope scope) {
        List<Blocker> blockers = new ArrayList<>();
        if (scope != Scope.CHEF) {
            // Anything not finished waits, even if it started after prepare cancelled the plans (a bill paid during the 30 days).
            addIfAny(blockers, "SUBSCRIPTION_STILL_ACTIVE", "meal plan subscription(s) are still running", count(
                "customer_subscription WHERE customer_identity_id = ? AND status NOT IN ('CANCELLED', 'EXPIRED')", identityId));
            addIfAny(blockers, "SUBSCRIPTION_UNPAID_INVOICE", "meal plan bill(s) are still waiting for payment", count(
                "subscription_invoice WHERE customer_identity_id = ? AND status IN ('PAYMENT_REQUESTED', 'PAYMENT_PENDING')", identityId));
            addIfAny(blockers, "DAY_CREDIT_CHOICE_PENDING", "refund-or-extend choice(s) for missed or paused days are still open", count(
                "subscription_day_credit dc JOIN " + SCHEMA + "customer_subscription cs ON cs.id = dc.subscription_id "
                    + "WHERE cs.customer_identity_id = ? AND dc.status = 'PENDING_CHOICE'", identityId));
        }
        if (scope != Scope.CUSTOMER) {
            // PAYMENT_FAILED can still be paid and come back, so only cancelled and expired subscriptions are finished.
            addIfAny(blockers, "PLAN_HAS_ACTIVE_SUBSCRIBERS", "subscription(s) are still running on this chef's meal plans", count(
                "customer_subscription cs JOIN " + SCHEMA + "subscription_plan p ON p.id = cs.plan_id "
                    + "WHERE p.chef_identity_id = ? AND cs.status NOT IN ('CANCELLED', 'EXPIRED')", identityId));
        }
        return blockers;
    }

    /** Not one transaction: each cancel commits on its own, as it does for a customer, so a retry only redoes what is left. */
    public ErasureResponse prepare(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CHEF) {
            counts.put("customer_subscription", cancelSubscriptions(identityId));
        }
        if (scope != Scope.CUSTOMER) {
            counts.put("subscription_plan", closePlansToNewSubscribers(identityId));
        }
        return ErasureResponse.done(counts);
    }

    @Transactional
    public ErasureResponse erase(UUID identityId, Scope scope, UUID requestId) {
        List<Blocker> blockers = blockers(identityId, scope);
        if (!blockers.isEmpty()) {
            return ErasureResponse.blocked(blockers);
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CHEF) {
            counts.put("customer_subscription", db.update(
                "UPDATE " + SCHEMA + "customer_subscription SET notes = ? WHERE customer_identity_id = ? AND notes IS NOT NULL AND notes <> ?",
                ERASED_TEXT, identityId, ERASED_TEXT));
            counts.put("subscription_skip_request", db.update(
                "UPDATE " + SCHEMA + "subscription_skip_request SET reason = ? WHERE reason IS NOT NULL AND reason <> ? "
                    + "AND subscription_id IN (SELECT id FROM " + SCHEMA + "customer_subscription WHERE customer_identity_id = ?)",
                ERASED_TEXT, ERASED_TEXT, identityId));
        }
        if (scope != Scope.CUSTOMER) {
            counts.put("subscription_plan", archivePlans(identityId));
        }
        LOGGER.info("account erasure service=subscription requestId={} scope={} counts={}", requestId, scope, counts);
        return ErasureResponse.done(counts);
    }

    /** Through the same service call as the customer's own cancel, so policy, history, meals and capacity behave identically. */
    private int cancelSubscriptions(UUID identityId) {
        List<UUID> open = db.queryForList(
            "SELECT id FROM " + SCHEMA + "customer_subscription WHERE customer_identity_id = ? AND status IN ('ACTIVE', 'PAUSED') ORDER BY created_at",
            UUID.class, identityId);
        CurrentUser customer = new CurrentUser(identityId, null, null, List.of("CUSTOMER"));
        int cancelled = 0;
        ApiException refused = null;
        for (UUID subscriptionId : open) {
            try {
                lifecycle.cancel(subscriptionId, "Account deletion requested", customer);
                cancelled++;
            } catch (ApiException exception) {
                // The plan's own rules (cancellation switched off, cutoff passed) refuse this one; cancel the rest, then fail so the call is retried.
                if (refused == null) {
                    refused = exception;
                }
            }
        }
        if (refused != null) {
            throw refused;
        }
        return cancelled;
    }

    /** One statement, so the flag change and its audit row cannot part. */
    private int closePlansToNewSubscribers(UUID chefId) {
        return db.update(
            "WITH closed AS (UPDATE " + SCHEMA + "subscription_plan SET accepting_subscribers = FALSE, updated_at = now() "
                + "WHERE chef_identity_id = ? AND accepting_subscribers RETURNING id, status) "
                + "INSERT INTO " + SCHEMA + "subscription_plan_audit (id, plan_id, actor_identity_id, action, old_status, new_status, reason, created_at) "
                + "SELECT gen_random_uuid(), id, ?, 'CHEF_ACCEPTING_OFF', status, status, 'Chef account deletion requested', now() FROM closed",
            chefId, chefId);
    }

    /** INACTIVE is the status an admin gives a retired plan; the old status is read from the row as it was before the update. */
    private int archivePlans(UUID chefId) {
        return db.update(
            "WITH archived AS (UPDATE " + SCHEMA + "subscription_plan p SET status = 'INACTIVE', accepting_subscribers = FALSE, updated_at = now() "
                + "FROM " + SCHEMA + "subscription_plan prev WHERE prev.id = p.id AND p.chef_identity_id = ? "
                + "AND (p.status <> 'INACTIVE' OR p.accepting_subscribers) RETURNING p.id, prev.status AS old_status) "
                + "INSERT INTO " + SCHEMA + "subscription_plan_audit (id, plan_id, actor_identity_id, action, old_status, new_status, reason, created_at) "
                + "SELECT gen_random_uuid(), id, ?, 'ACCOUNT_ERASURE', old_status, 'INACTIVE', 'Chef account deleted', now() FROM archived",
            chefId, chefId);
    }

    private int count(String fromAndWhere, UUID identityId) {
        Integer value = db.queryForObject("SELECT count(*) FROM " + SCHEMA + fromAndWhere, Integer.class, identityId);
        return value == null ? 0 : value;
    }

    private static void addIfAny(List<Blocker> blockers, String code, String what, int found) {
        if (found > 0) {
            blockers.add(new Blocker(code, found + " " + what));
        }
    }
}
