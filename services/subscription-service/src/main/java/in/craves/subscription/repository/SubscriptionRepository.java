package in.craves.subscription.repository;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SubscriptionRepository {
    private final JdbcTemplate jdbcTemplate;

    public SubscriptionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public PlanResponse createPlan(
        String planCode,
        UUID chefIdentityId,
        String name,
        String description,
        String billingPeriod,
        BigDecimal amount,
        String currency
    ) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_plan " +
                "(id, plan_code, chef_identity_id, name, description, billing_period, amount, currency, status, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', now(), now())",
            id,
            planCode,
            chefIdentityId,
            name,
            description,
            billingPeriod,
            amount,
            currency
        );
        return findPlanById(id).orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found after creation"));
    }

    public List<PlanResponse> listPlans(boolean activeOnly) {
        String sql = "SELECT id, plan_code, chef_identity_id, name, description, billing_period, amount, currency, status, created_at, updated_at " +
            "FROM subscription_schema.subscription_plan ";
        if (activeOnly) {
            sql += "WHERE status = 'ACTIVE' ";
        }
        sql += "ORDER BY created_at DESC";
        return jdbcTemplate.query(sql, this::mapPlan);
    }

    public Optional<PlanResponse> findPlanById(UUID id) {
        List<PlanResponse> rows = jdbcTemplate.query(
            "SELECT id, plan_code, chef_identity_id, name, description, billing_period, amount, currency, status, created_at, updated_at " +
                "FROM subscription_schema.subscription_plan WHERE id = ?",
            this::mapPlan,
            id
        );
        return rows.stream().findFirst();
    }

    public PlanResponse updatePlanStatus(UUID planId, String status) {
        int updated = jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_plan SET status = ?, updated_at = now() WHERE id = ?",
            status,
            planId
        );
        if (updated == 0) {
            throw ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found");
        }
        return findPlanById(planId).orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
    }

    public SubscriptionResponse createSubscription(
        UUID customerIdentityId,
        PlanResponse plan,
        LocalDate startDate,
        UUID deliveryAddressId,
        String notes
    ) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.customer_subscription " +
                "(id, customer_identity_id, plan_id, chef_identity_id, status, start_date, next_service_date, delivery_address_id, notes, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, now(), now())",
            id,
            customerIdentityId,
            plan.id(),
            plan.chefIdentityId(),
            startDate,
            startDate,
            deliveryAddressId,
            notes
        );
        insertHistory(id, null, "PENDING_PAYMENT", "Subscription created and waiting for payment verification", customerIdentityId);
        return findSubscriptionById(id).orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found after creation"));
    }

    public List<SubscriptionResponse> listCustomerSubscriptions(UUID customerIdentityId) {
        return jdbcTemplate.query(
            "SELECT id, customer_identity_id, plan_id, chef_identity_id, status, start_date, end_date, next_service_date, delivery_address_id, notes, created_at, updated_at " +
                "FROM subscription_schema.customer_subscription WHERE customer_identity_id = ? ORDER BY created_at DESC",
            this::mapSubscription,
            customerIdentityId
        );
    }

    public Optional<SubscriptionResponse> findSubscriptionById(UUID id) {
        List<SubscriptionResponse> rows = jdbcTemplate.query(
            "SELECT id, customer_identity_id, plan_id, chef_identity_id, status, start_date, end_date, next_service_date, delivery_address_id, notes, created_at, updated_at " +
                "FROM subscription_schema.customer_subscription WHERE id = ?",
            this::mapSubscription,
            id
        );
        return rows.stream().findFirst();
    }

    public SubscriptionResponse updateSubscriptionStatus(UUID id, String newStatus, String reason, UUID actorIdentityId) {
        SubscriptionResponse existing = findSubscriptionById(id)
            .orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
        int updated = jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET status = ?, updated_at = now() WHERE id = ?",
            newStatus,
            id
        );
        if (updated == 0) {
            throw ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found");
        }
        insertHistory(id, existing.status(), newStatus, reason, actorIdentityId);
        return findSubscriptionById(id).orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
    }

    private void insertHistory(UUID subscriptionId, String oldStatus, String newStatus, String reason, UUID actorIdentityId) {
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_status_history " +
                "(subscription_id, old_status, new_status, reason, actor_identity_id, created_at) VALUES (?, ?, ?, ?, ?, now())",
            subscriptionId,
            oldStatus,
            newStatus,
            reason,
            actorIdentityId
        );
    }

    private PlanResponse mapPlan(ResultSet rs, int rowNum) throws SQLException {
        return new PlanResponse(
            rs.getObject("id", UUID.class),
            rs.getString("plan_code"),
            rs.getObject("chef_identity_id", UUID.class),
            rs.getString("name"),
            rs.getString("description"),
            rs.getString("billing_period"),
            rs.getBigDecimal("amount"),
            rs.getString("currency"),
            rs.getString("status"),
            rs.getObject("created_at", Instant.class),
            rs.getObject("updated_at", Instant.class)
        );
    }

    private SubscriptionResponse mapSubscription(ResultSet rs, int rowNum) throws SQLException {
        return new SubscriptionResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("plan_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            rs.getString("status"),
            rs.getObject("start_date", LocalDate.class),
            rs.getObject("end_date", LocalDate.class),
            rs.getObject("next_service_date", LocalDate.class),
            rs.getObject("delivery_address_id", UUID.class),
            rs.getString("notes"),
            rs.getObject("created_at", Instant.class),
            rs.getObject("updated_at", Instant.class)
        );
    }
}
