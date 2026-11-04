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
 * Account deletion. CUSTOMER: plans are cancelled at request (prepare); erase waits while any still runs, then blanks the
 * customer's free text. CHEF: plans stop taking subscribers at request and are deactivated at erase. Invoices and day
 * credits are never changed. Release (the person kept the account) reopens the plans prepare closed. Every step is safe to repeat.
 */
@Service
public class AccountErasureService {
    /** What notes and skip reasons are replaced with. */
    public static final String ERASED_TEXT = "[deleted]";
    /** The reason prepare writes on each cancel; it says nothing about the person, so erase keeps it. */
    public static final String DELETION_CANCEL_REASON = "Account deletion requested";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String SCHEMA = "subscription_schema.";
    /** The reason on the audit row prepare writes when it closes a plan; release finds the plans to reopen by it. */
    private static final String CLOSED_REASON = "Chef account deletion requested";
    private static final String REOPENED_REASON = "Account deletion cancelled";
    /** A checkout still unpaid after a day counts as abandoned, the same window as order-service; a payment that lands later finds an anonymised subscription. */
    private static final int PENDING_PAYMENT_PAYABLE_HOURS = 24;
    /** The first checkout of a plan (alias cs) that nobody paid in time: it blocks nothing and is anonymised like a cancelled one. */
    private static final String ABANDONED_CHECKOUT = "(cs.status = 'PENDING_PAYMENT' AND cs.created_at <= now() - interval '"
        + PENDING_PAYMENT_PAYABLE_HOURS + " hours')";

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
                "customer_subscription cs WHERE cs.customer_identity_id = ? AND cs.status NOT IN ('CANCELLED', 'EXPIRED') AND NOT "
                    + ABANDONED_CHECKOUT, identityId));
            addIfAny(blockers, "SUBSCRIPTION_UNPAID_INVOICE", "meal plan bill(s) are still waiting for payment", count(
                "subscription_invoice i JOIN " + SCHEMA + "customer_subscription cs ON cs.id = i.subscription_id "
                    + "WHERE i.customer_identity_id = ? AND i.status IN ('PAYMENT_REQUESTED', 'PAYMENT_PENDING') AND NOT "
                    + ABANDONED_CHECKOUT, identityId));
            addIfAny(blockers, "DAY_CREDIT_CHOICE_PENDING", "refund-or-extend choice(s) for missed or paused days are still open", count(
                "subscription_day_credit dc JOIN " + SCHEMA + "customer_subscription cs ON cs.id = dc.subscription_id "
                    + "WHERE cs.customer_identity_id = ? AND dc.status = 'PENDING_CHOICE'", identityId));
        }
        if (scope != Scope.CUSTOMER) {
            // PAYMENT_FAILED can still be paid and come back, so only cancelled and expired subscriptions are finished.
            addIfAny(blockers, "PLAN_HAS_ACTIVE_SUBSCRIBERS", "subscription(s) are still running on this chef's meal plans", count(
                "customer_subscription cs JOIN " + SCHEMA + "subscription_plan p ON p.id = cs.plan_id "
                    + "WHERE p.chef_identity_id = ? AND cs.status NOT IN ('CANCELLED', 'EXPIRED') AND NOT " + ABANDONED_CHECKOUT, identityId));
        }
        return blockers;
    }

    /** Not one transaction: each cancel commits on its own, as it does for a customer, so a retry only redoes what is left. */
    public ErasureResponse prepare(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        // Chef part first: a customer cancel the plan's rules refuse throws, and must not leave this chef's plans taking subscribers.
        if (scope != Scope.CUSTOMER) {
            counts.put("subscription_plan", closePlansToNewSubscribers(identityId));
        }
        if (scope != Scope.CHEF) {
            counts.put("customer_subscription", cancelSubscriptions(identityId));
        }
        return ErasureResponse.done(counts);
    }

    /** The person kept their account: chef plans go back to taking subscribers. Customer plans were cancelled for good and stay so. */
    public ErasureResponse release(UUID identityId, Scope scope, UUID requestId) {
        int reopened = scope == Scope.CUSTOMER ? 0 : reopenPlans(identityId);
        return ErasureResponse.done(Map.of("subscription_plan", reopened));
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
                "UPDATE " + SCHEMA + "customer_subscription SET notes = ?, updated_at = now() WHERE customer_identity_id = ? AND notes IS NOT NULL AND notes <> ?",
                ERASED_TEXT, identityId, ERASED_TEXT));
            counts.put("subscription_skip_request", db.update(
                "UPDATE " + SCHEMA + "subscription_skip_request SET reason = ? WHERE reason IS NOT NULL AND reason <> ? "
                    + "AND subscription_id IN (SELECT id FROM " + SCHEMA + "customer_subscription WHERE customer_identity_id = ?)",
                ERASED_TEXT, ERASED_TEXT, identityId));
            // Cancel, pause and resume reasons are typed by the customer, who is then the actor; system-written rows have no or another actor.
            counts.put("subscription_status_history", db.update(
                "UPDATE " + SCHEMA + "subscription_status_history SET reason = ? WHERE actor_identity_id = ? AND reason IS NOT NULL "
                    + "AND reason NOT IN (?, ?) AND subscription_id IN (SELECT id FROM " + SCHEMA + "customer_subscription WHERE customer_identity_id = ?)",
                ERASED_TEXT, identityId, ERASED_TEXT, DELETION_CANCEL_REASON, identityId));
        }
        if (scope != Scope.CUSTOMER) {
            counts.put("subscription_plan", deactivatePlans(identityId));
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
                lifecycle.cancel(subscriptionId, DELETION_CANCEL_REASON, customer);
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
                + "SELECT gen_random_uuid(), id, ?, 'CHEF_ACCEPTING_OFF', status, status, ?, now() FROM closed",
            chefId, chefId, CLOSED_REASON);
    }

    /**
     * One statement. Only a plan whose latest accepting change is prepare's close comes back: one the chef closed themselves,
     * or closed again after prepare, stays closed; so does a plan an admin has since retired. Prepare closes plans of any status
     * (a new DRAFT already accepts), so release reopens them whatever their status.
     */
    private int reopenPlans(UUID chefId) {
        return db.update(
            "WITH reopened AS (UPDATE " + SCHEMA + "subscription_plan p SET accepting_subscribers = TRUE, updated_at = now() "
                + "WHERE p.chef_identity_id = ? AND p.status <> 'INACTIVE' AND NOT p.accepting_subscribers "
                + "AND (SELECT a.reason FROM " + SCHEMA + "subscription_plan_audit a WHERE a.plan_id = p.id "
                + "AND a.action IN ('CHEF_ACCEPTING_ON', 'CHEF_ACCEPTING_OFF') ORDER BY a.created_at DESC LIMIT 1) = ? RETURNING p.id, p.status) "
                + "INSERT INTO " + SCHEMA + "subscription_plan_audit (id, plan_id, actor_identity_id, action, old_status, new_status, reason, created_at) "
                + "SELECT gen_random_uuid(), id, ?, 'CHEF_ACCEPTING_ON', status, status, ?, now() FROM reopened",
            chefId, CLOSED_REASON, chefId, REOPENED_REASON);
    }

    /** INACTIVE is the status an admin gives a retired plan; the old status is read from the row as it was before the update. */
    private int deactivatePlans(UUID chefId) {
        return db.update(
            "WITH deactivated AS (UPDATE " + SCHEMA + "subscription_plan p SET status = 'INACTIVE', accepting_subscribers = FALSE, updated_at = now() "
                + "FROM " + SCHEMA + "subscription_plan prev WHERE prev.id = p.id AND p.chef_identity_id = ? "
                + "AND (p.status <> 'INACTIVE' OR p.accepting_subscribers) RETURNING p.id, prev.status AS old_status) "
                + "INSERT INTO " + SCHEMA + "subscription_plan_audit (id, plan_id, actor_identity_id, action, old_status, new_status, reason, created_at) "
                + "SELECT gen_random_uuid(), id, ?, 'ACCOUNT_ERASURE', old_status, 'INACTIVE', 'Chef account deleted', now() FROM deactivated",
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
