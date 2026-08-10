package in.craves.subscription.schedule;

import in.craves.subscription.schedule.PlanScheduleModels.PlanScheduleResponse;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class PlanScheduleRepository {
    private final JdbcTemplate jdbcTemplate;

    public PlanScheduleRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<PlanOwner> findPlanOwner(UUID planId) {
        return jdbcTemplate.query(
            "SELECT id, chef_identity_id, status, billing_period FROM subscription_schema.subscription_plan WHERE id = ?",
            (rs, rowNum) -> new PlanOwner(
                rs.getObject("id", UUID.class),
                rs.getObject("chef_identity_id", UUID.class),
                rs.getString("status"),
                rs.getString("billing_period")
            ),
            planId
        ).stream().findFirst();
    }

    public Optional<PlanScheduleResponse> find(UUID planId) {
        return jdbcTemplate.query(
            "SELECT * FROM subscription_schema.subscription_plan_schedule WHERE plan_id = ?",
            (rs, rowNum) -> map(rs, listItems(planId)),
            planId
        ).stream().findFirst();
    }

    @Transactional
    public PlanScheduleResponse replaceDraft(
        UUID planId,
        String recurrenceType,
        String timezone,
        int generationLeadHours,
        List<ScheduleItemRequest> items,
        UUID actor
    ) {
        Optional<PlanScheduleResponse> existing = find(planId);
        if (existing.isPresent() && "ACTIVE".equals(existing.get().status())) {
            throw new IllegalStateException("Active schedule must be inactivated before replacement");
        }
        int nextVersion = existing.map(value -> value.version() + 1).orElse(1);
        LocalTime earliestServiceTime = items.stream()
            .map(ScheduleItemRequest::serviceTime)
            .min(Comparator.naturalOrder())
            .orElseThrow(() -> new IllegalArgumentException("At least one schedule item is required"));
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_plan_schedule " +
                "(plan_id, recurrence_type, timezone, service_time, generation_lead_hours, status, version, created_by_identity_id, created_at, updated_at, activated_at) " +
                "VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, now(), now(), NULL) " +
                "ON CONFLICT (plan_id) DO UPDATE SET recurrence_type = EXCLUDED.recurrence_type, timezone = EXCLUDED.timezone, " +
                "service_time = EXCLUDED.service_time, generation_lead_hours = EXCLUDED.generation_lead_hours, status = 'DRAFT', " +
                "version = EXCLUDED.version, created_by_identity_id = EXCLUDED.created_by_identity_id, updated_at = now(), activated_at = NULL",
            planId, recurrenceType, timezone, earliestServiceTime, generationLeadHours, nextVersion, actor
        );
        jdbcTemplate.update(
            "DELETE FROM subscription_schema.subscription_plan_schedule_item WHERE plan_id = ?",
            planId
        );
        for (ScheduleItemRequest item : items) {
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_plan_schedule_item " +
                    "(id, plan_id, menu_item_id, quantity, iso_day_of_week, day_of_month, meal_slot_code, service_time, sequence_number, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now())",
                UUID.randomUUID(),
                planId,
                item.menuItemId(),
                item.quantity(),
                item.isoDayOfWeek(),
                item.dayOfMonth(),
                item.mealSlotCode().trim().toUpperCase(Locale.ROOT),
                item.serviceTime(),
                item.sequenceNumber()
            );
        }
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_plan_schedule_audit " +
                "(id, plan_id, actor_identity_id, action, schedule_version, reason, created_at) " +
                "VALUES (?, ?, ?, 'REPLACE_DRAFT', ?, 'Schedule draft replaced', now())",
            UUID.randomUUID(), planId, actor, nextVersion
        );
        return find(planId).orElseThrow();
    }

    @Transactional
    public PlanScheduleResponse activate(UUID planId, UUID actor, String reason) {
        PlanScheduleResponse schedule = find(planId).orElseThrow();
        int updated = jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_plan_schedule SET status = 'ACTIVE', activated_at = now(), updated_at = now() " +
                "WHERE plan_id = ? AND status = 'DRAFT'",
            planId
        );
        if (updated != 1) {
            throw new IllegalStateException("Only a draft schedule can be activated");
        }
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_plan_schedule_audit " +
                "(id, plan_id, actor_identity_id, action, schedule_version, reason, created_at) " +
                "VALUES (?, ?, ?, 'ACTIVATE', ?, ?, now())",
            UUID.randomUUID(), planId, actor, schedule.version(), reason
        );
        return find(planId).orElseThrow();
    }

    private List<ScheduleItemResponse> listItems(UUID planId) {
        return jdbcTemplate.query(
            "SELECT * FROM subscription_schema.subscription_plan_schedule_item WHERE plan_id = ? " +
                "ORDER BY COALESCE(iso_day_of_week, day_of_month), service_time, meal_slot_code, sequence_number, created_at",
            (rs, rowNum) -> new ScheduleItemResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("menu_item_id", UUID.class),
                rs.getInt("quantity"),
                integer(rs, "iso_day_of_week"),
                integer(rs, "day_of_month"),
                rs.getString("meal_slot_code"),
                rs.getObject("service_time", LocalTime.class),
                rs.getInt("sequence_number")
            ),
            planId
        );
    }

    private PlanScheduleResponse map(ResultSet rs, List<ScheduleItemResponse> items) throws SQLException {
        return new PlanScheduleResponse(
            rs.getObject("plan_id", UUID.class),
            rs.getString("recurrence_type"),
            rs.getString("timezone"),
            rs.getObject("service_time", LocalTime.class),
            rs.getInt("generation_lead_hours"),
            rs.getString("status"),
            rs.getInt("version"),
            items,
            rs.getObject("created_at", Instant.class),
            rs.getObject("updated_at", Instant.class),
            rs.getObject("activated_at", Instant.class)
        );
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    public record PlanOwner(UUID planId, UUID chefIdentityId, String status, String billingPeriod) {
    }
}
