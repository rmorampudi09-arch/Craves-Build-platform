package in.craves.subscription.occurrence;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class OccurrenceRepository {
    private final JdbcTemplate jdbcTemplate;

    public OccurrenceRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public List<ClaimedSubscription> claimDue(int horizonDays, int staleLockMinutes, int batchSize) {
        UUID lockToken = UUID.randomUUID();
        String sql = """
            WITH candidates AS (
                SELECT cs.id
                  FROM subscription_schema.customer_subscription cs
                  JOIN subscription_schema.subscription_plan_schedule ps ON ps.plan_id = cs.plan_id
                 WHERE cs.status = 'ACTIVE'
                   AND cs.next_service_date IS NOT NULL
                   AND cs.next_service_date <= current_date + ?
                   AND ps.status = 'ACTIVE'
                   AND (cs.generation_lock_token IS NULL OR cs.generation_locked_at < now() - (? * INTERVAL '1 minute'))
                 ORDER BY cs.next_service_date, cs.created_at
                 FOR UPDATE OF cs SKIP LOCKED
                 LIMIT ?
            )
            UPDATE subscription_schema.customer_subscription cs
               SET generation_lock_token = ?, generation_locked_at = now()
              FROM candidates c
             WHERE cs.id = c.id
            RETURNING cs.id, cs.customer_identity_id, cs.plan_id, cs.chef_identity_id,
                      cs.delivery_address_id, cs.next_service_date
            """;
        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new ClaimedSubscription(
                rs.getObject("id", UUID.class),
                rs.getObject("customer_identity_id", UUID.class),
                rs.getObject("plan_id", UUID.class),
                rs.getObject("chef_identity_id", UUID.class),
                rs.getObject("delivery_address_id", UUID.class),
                rs.getObject("next_service_date", LocalDate.class),
                lockToken
            ),
            horizonDays,
            staleLockMinutes,
            batchSize,
            lockToken
        );
    }

    public Optional<ActiveSchedule> findActiveSchedule(UUID planId) {
        return jdbcTemplate.query(
            "SELECT plan_id, recurrence_type, timezone, service_time, generation_lead_hours, version " +
                "FROM subscription_schema.subscription_plan_schedule WHERE plan_id = ? AND status = 'ACTIVE'",
            (rs, rowNum) -> new ActiveSchedule(
                rs.getObject("plan_id", UUID.class),
                rs.getString("recurrence_type"),
                rs.getString("timezone"),
                rs.getObject("service_time", LocalTime.class),
                rs.getInt("generation_lead_hours"),
                rs.getInt("version"),
                findScheduleItems(planId)
            ),
            planId
        ).stream().findFirst();
    }

    @Transactional
    public boolean createOccurrence(
        ClaimedSubscription subscription,
        ActiveSchedule schedule,
        LocalDate serviceDate,
        Instant serviceAt,
        List<ScheduleItem> matchingItems,
        LocalDate nextServiceDate
    ) {
        UUID occurrenceId = UUID.randomUUID();
        int inserted = jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_occurrence " +
                "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, delivery_address_id, service_date, service_at, schedule_version, status, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BILLING_PENDING', now(), now()) " +
                "ON CONFLICT (subscription_id, service_date) DO NOTHING",
            occurrenceId,
            subscription.subscriptionId(),
            subscription.planId(),
            subscription.customerIdentityId(),
            subscription.chefIdentityId(),
            subscription.deliveryAddressId(),
            serviceDate,
            serviceAt,
            schedule.version()
        );
        if (inserted == 1) {
            for (ScheduleItem item : matchingItems) {
                jdbcTemplate.update(
                    "INSERT INTO subscription_schema.subscription_occurrence_item " +
                        "(id, occurrence_id, menu_item_id, quantity, sequence_number, created_at) VALUES (?, ?, ?, ?, ?, now())",
                    UUID.randomUUID(), occurrenceId, item.menuItemId(), item.quantity(), item.sequenceNumber()
                );
            }
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_occurrence_history " +
                    "(id, occurrence_id, old_status, new_status, reason, created_at) " +
                    "VALUES (?, ?, NULL, 'BILLING_PENDING', 'Occurrence generated from active plan schedule', now())",
                UUID.randomUUID(), occurrenceId
            );
        }
        releaseAndAdvance(subscription, nextServiceDate);
        return inserted == 1;
    }

    public void releaseAndAdvance(ClaimedSubscription subscription, LocalDate nextServiceDate) {
        int updated = jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET next_service_date = ?, generation_lock_token = NULL, " +
                "generation_locked_at = NULL, updated_at = now() WHERE id = ? AND generation_lock_token = ?",
            nextServiceDate,
            subscription.subscriptionId(),
            subscription.lockToken()
        );
        if (updated != 1) {
            throw new IllegalStateException("Subscription generation claim was lost");
        }
    }

    public void releaseAfterFailure(ClaimedSubscription subscription) {
        jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET generation_lock_token = NULL, generation_locked_at = NULL " +
                "WHERE id = ? AND generation_lock_token = ?",
            subscription.subscriptionId(), subscription.lockToken()
        );
    }

    private List<ScheduleItem> findScheduleItems(UUID planId) {
        return jdbcTemplate.query(
            "SELECT menu_item_id, quantity, iso_day_of_week, day_of_month, sequence_number " +
                "FROM subscription_schema.subscription_plan_schedule_item WHERE plan_id = ? " +
                "ORDER BY COALESCE(iso_day_of_week, day_of_month), sequence_number",
            (rs, rowNum) -> new ScheduleItem(
                rs.getObject("menu_item_id", UUID.class),
                rs.getInt("quantity"),
                nullableInteger(rs, "iso_day_of_week"),
                nullableInteger(rs, "day_of_month"),
                rs.getInt("sequence_number")
            ),
            planId
        );
    }

    private static Integer nullableInteger(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    public record ClaimedSubscription(
        UUID subscriptionId,
        UUID customerIdentityId,
        UUID planId,
        UUID chefIdentityId,
        UUID deliveryAddressId,
        LocalDate serviceDate,
        UUID lockToken
    ) {
    }

    public record ActiveSchedule(
        UUID planId,
        String recurrenceType,
        String timezone,
        LocalTime serviceTime,
        int generationLeadHours,
        int version,
        List<ScheduleItem> items
    ) {
    }

    public record ScheduleItem(
        UUID menuItemId,
        int quantity,
        Integer isoDayOfWeek,
        Integer dayOfMonth,
        int sequenceNumber
    ) {
    }
}
