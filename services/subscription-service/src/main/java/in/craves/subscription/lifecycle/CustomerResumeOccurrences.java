package in.craves.subscription.lifecycle;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Customer-only restoration of preserved meals; callers hold the subscription lock throughout. */
final class CustomerResumeOccurrences {
    private static final Set<String> UNDISPATCHED = Set.of("BILLING_PENDING", "PAYMENT_PENDING", "READY_FOR_ORDER");
    private final JdbcTemplate jdbc;

    CustomerResumeOccurrences(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<ResumeOccurrence> lockCandidates(SubscriptionResponse subscription, LocalDate resumeDate) {
        List<Candidate> rows = jdbc.query("""
            SELECT o.id, o.service_date, o.meal_slot_code, o.service_at, o.schedule_version,
                   o.plan_id = ? AND o.customer_identity_id = ? AND o.chef_identity_id = ?
                       AND o.delivery_address_id = ? AS same_booking,
                   o.order_id IS NULL AND o.order_requested_at IS NULL AND o.order_created_at IS NULL
                       AND NOT EXISTS (SELECT 1 FROM subscription_schema.subscription_order_request_outbox b
                                       WHERE b.aggregate_id = o.id) AS undispatched
              FROM subscription_schema.subscription_occurrence o
             WHERE o.subscription_id = ? AND o.service_date >= ? AND o.status = 'CANCELLED'
             ORDER BY o.service_at, o.id FOR UPDATE OF o
            """, (rs, n) -> new Candidate(rs.getObject("id", UUID.class),
                rs.getObject("service_date", LocalDate.class), rs.getString("meal_slot_code"),
                rs.getTimestamp("service_at").toInstant(), rs.getInt("schedule_version"),
                rs.getBoolean("same_booking"), rs.getBoolean("undispatched")),
            subscription.planId(), subscription.customerIdentityId(), subscription.chefIdentityId(),
            subscription.deliveryAddressId(), subscription.id(), resumeDate);
        List<ResumeOccurrence> result = new ArrayList<>();
        History pause = null;
        boolean hasExplicitCancellation = false;
        for (Candidate row : rows) {
            if (hasSkip(subscription.id(), row.serviceDate())) continue;
            List<History> latest = jdbc.query("""
                SELECT old_status, new_status, source, actor_identity_id, created_at
                  FROM subscription_schema.subscription_occurrence_history
                 WHERE occurrence_id = ? AND created_at = (
                     SELECT max(created_at) FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ?)
                """, (rs, n) -> new History(rs.getString("old_status"), rs.getString("new_status"),
                    rs.getString("source"), rs.getObject("actor_identity_id", UUID.class),
                    rs.getTimestamp("created_at").toInstant()), row.id(), row.id());
            require(latest.size() == 1);
            History last = latest.getFirst();
            require("CANCELLED".equals(last.newStatus()) && last.oldStatus() != null && UNDISPATCHED.contains(last.oldStatus())
                && subscription.customerIdentityId().equals(last.actor()));
            // A later explicit customer cancellation is not undone by an older pause record.
            if ("CUSTOMER_CANCEL".equals(last.source())) {
                hasExplicitCancellation = true;
                continue;
            }
            require("CUSTOMER_PAUSE".equals(last.source()) && row.sameBooking() && row.undispatched());
            if (pause == null) pause = currentPause(subscription);
            // Both records are written by pause() with PostgreSQL's transaction timestamp.
            // UUID ordering cannot establish chronology for ambiguous timestamp ties.
            require(pause.at().equals(last.at()));
            result.add(new ResumeOccurrence(row.id(), row.serviceDate(), row.mealSlotCode(), row.serviceAt(),
                row.scheduleVersion(), restorationStatus(subscription, row.serviceDate())));
        }
        if (!result.isEmpty()) {
            // Reacquisition must not reserve meals that a separate explicit cancellation excluded.
            require(!hasExplicitCancellation);
            Boolean otherLiveMeals = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM subscription_schema.subscription_occurrence
                 WHERE subscription_id = ? AND service_date >= ? AND (
                     status NOT IN ('CANCELLED', 'SKIPPED') OR order_id IS NOT NULL
                     OR order_requested_at IS NOT NULL OR order_created_at IS NOT NULL
                     OR EXISTS (SELECT 1 FROM subscription_schema.subscription_order_request_outbox b
                                WHERE b.aggregate_id = subscription_occurrence.id)))
                """, Boolean.class, subscription.id(), resumeDate);
            // Broad reacquisition can reset another meal's materialized reservation. Defer these
            // mixed cases rather than changing the existing dispatch or capacity-release contract.
            require(!Boolean.TRUE.equals(otherLiveMeals));
        }
        return List.copyOf(result);
    }

    private History currentPause(SubscriptionResponse subscription) {
        List<History> latest = jdbc.query("""
            SELECT old_status, new_status, actor_identity_id, created_at
              FROM subscription_schema.subscription_status_history
             WHERE subscription_id = ? AND created_at = (
                 SELECT max(created_at) FROM subscription_schema.subscription_status_history WHERE subscription_id = ?)
            """, (rs, n) -> new History(rs.getString("old_status"), rs.getString("new_status"), null,
                rs.getObject("actor_identity_id", UUID.class), rs.getTimestamp("created_at").toInstant()),
            subscription.id(), subscription.id());
        require(latest.size() == 1);
        History pause = latest.getFirst();
        require("ACTIVE".equals(pause.oldStatus()) && "PAUSED".equals(pause.newStatus())
            && subscription.customerIdentityId().equals(pause.actor()));
        return pause;
    }

    private String restorationStatus(SubscriptionResponse subscription, LocalDate serviceDate) {
        // Do not lock invoices here: payment locks invoice -> subscription, and only mutates
        // after acquiring the subscription lock. A waiting callback will promote restored meals.
        List<Invoice> covering = jdbc.query("""
            SELECT status, plan_id, customer_identity_id, chef_identity_id
              FROM subscription_schema.subscription_invoice
             WHERE subscription_id = ? AND cycle_start <= ? AND cycle_end > ?
            """, (rs, n) -> new Invoice(rs.getString("status"), rs.getObject("plan_id", UUID.class),
                rs.getObject("customer_identity_id", UUID.class), rs.getObject("chef_identity_id", UUID.class)),
            subscription.id(), serviceDate, serviceDate);
        require(covering.size() <= 1);
        if (covering.isEmpty()) {
            LocalDate nextBilling = jdbc.queryForObject(
                "SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id = ?",
                LocalDate.class, subscription.id());
            require(nextBilling != null && !nextBilling.isAfter(serviceDate));
            return "BILLING_PENDING";
        }
        Invoice invoice = covering.getFirst();
        require(subscription.planId().equals(invoice.planId())
            && subscription.customerIdentityId().equals(invoice.customer())
            && Objects.equals(subscription.chefIdentityId(), invoice.chef()));
        if ("PAID".equals(invoice.status())) return "READY_FOR_ORDER";
        require(Set.of("PAYMENT_REQUESTED", "PAYMENT_PENDING").contains(invoice.status()));
        return "BILLING_PENDING";
    }

    void validate(SubscriptionResponse subscription, ResumeOccurrence occurrence, boolean materialized) {
        // reacquireForResume has already acquired the chef lock. Locking the schedule only
        // afterwards preserves approval's chef -> schedule order and closes schedule drift races.
        List<Schedule> schedules = jdbc.query("""
            SELECT s.version, s.timezone, s.recurrence_type, p.chef_identity_id, p.status
              FROM subscription_schema.subscription_plan_schedule s
              JOIN subscription_schema.subscription_plan p ON p.id = s.plan_id
             WHERE s.plan_id = ? AND s.status = 'ACTIVE' FOR SHARE OF s
            """, (rs, n) -> new Schedule(rs.getInt("version"), rs.getString("timezone"),
                rs.getString("recurrence_type"), rs.getObject("chef_identity_id", UUID.class), rs.getString("status")),
            subscription.planId());
        require(schedules.size() == 1);
        Schedule schedule = schedules.getFirst();
        require(schedule.version() == occurrence.scheduleVersion() && "ACTIVE".equals(schedule.planStatus())
            && Objects.equals(schedule.chef(), subscription.chefIdentityId()));
        List<ScheduledItem> scheduled = jdbc.query("""
            SELECT menu_item_id, quantity, sequence_number, service_time
              FROM subscription_schema.subscription_plan_schedule_item
             WHERE plan_id = ? AND meal_slot_code = ?
               AND ((? = 'WEEKLY' AND iso_day_of_week = ?) OR (? = 'MONTHLY' AND day_of_month = ?))
             ORDER BY sequence_number, menu_item_id
            """, (rs, n) -> new ScheduledItem(new Item(rs.getObject("menu_item_id", UUID.class),
                rs.getInt("quantity"), rs.getInt("sequence_number")), rs.getObject("service_time", LocalTime.class)),
            subscription.planId(), occurrence.mealSlotCode(), schedule.recurrence(), occurrence.serviceDate().getDayOfWeek().getValue(),
            schedule.recurrence(), occurrence.serviceDate().getDayOfMonth());
        List<Item> items = jdbc.query("""
            SELECT menu_item_id, quantity, sequence_number FROM subscription_schema.subscription_occurrence_item
             WHERE occurrence_id = ? ORDER BY sequence_number, menu_item_id
            """, (rs, n) -> new Item(rs.getObject("menu_item_id", UUID.class), rs.getInt("quantity"),
                rs.getInt("sequence_number")), occurrence.id());
        require(!items.isEmpty() && items.equals(scheduled.stream().map(ScheduledItem::item).toList()));
        try {
            for (ScheduledItem item : scheduled) {
                require(occurrence.serviceAt().equals(ZonedDateTime.of(occurrence.serviceDate(), item.time(),
                    ZoneId.of(schedule.timezone())).toInstant()));
            }
        } catch (DateTimeException exception) {
            throw unsafeResume();
        }
        require(!hasSkip(subscription.id(), occurrence.serviceDate()));
        List<Allocation> allocations = jdbc.query("""
            SELECT chef_identity_id, menu_item_id, units, status, occurrence_id
              FROM subscription_schema.subscription_capacity_allocation
             WHERE subscription_id = ? AND service_date = ? AND meal_slot_code = ?
             ORDER BY menu_item_id FOR UPDATE
            """, (rs, n) -> new Allocation(rs.getObject("chef_identity_id", UUID.class),
                rs.getObject("menu_item_id", UUID.class), rs.getInt("units"), rs.getString("status"),
                rs.getObject("occurrence_id", UUID.class)), subscription.id(), occurrence.serviceDate(), occurrence.mealSlotCode());
        require(allocations.size() == items.size());
        for (Allocation allocation : allocations) {
            require(Objects.equals(subscription.chefIdentityId(), allocation.chef())
                && (materialized ? "MATERIALIZED" : "COMMITTED").equals(allocation.status())
                && (materialized ? occurrence.id().equals(allocation.occurrenceId())
                    : allocation.occurrenceId() == null || occurrence.id().equals(allocation.occurrenceId()))
                && items.stream().anyMatch(item -> item.menuItemId().equals(allocation.menuItemId())
                    && item.quantity() == allocation.units()));
        }
    }

    void restore(ResumeOccurrence occurrence, UUID actor) {
        int updated = jdbc.update("""
            UPDATE subscription_schema.subscription_occurrence
               SET status = ?, order_dispatch_lock_token = NULL, order_dispatch_locked_at = NULL, updated_at = now()
             WHERE id = ? AND status = 'CANCELLED'
               AND order_id IS NULL AND order_requested_at IS NULL AND order_created_at IS NULL
            """, occurrence.targetStatus(), occurrence.id());
        require(updated == 1);
        jdbc.update("""
            INSERT INTO subscription_schema.subscription_occurrence_history
                (id, occurrence_id, old_status, new_status, reason, actor_identity_id, source, created_at)
            VALUES (?, ?, 'CANCELLED', ?, 'Customer resumed the preserved pause-cancelled meal', ?, 'CUSTOMER_RESUME', now())
            """, UUID.randomUUID(), occurrence.id(), occurrence.targetStatus(), actor);
    }

    private boolean hasSkip(UUID subscriptionId, LocalDate date) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM subscription_schema.subscription_skip_request
             WHERE subscription_id = ? AND service_date = ? AND status IN ('REQUESTED', 'APPLIED'))
            """, Boolean.class, subscriptionId, date));
    }

    private static void require(boolean condition) {
        if (!condition) throw unsafeResume();
    }

    private static ApiException unsafeResume() {
        return ApiException.conflict("SUBSCRIPTION_STATE_CHANGED", "Preserved meals cannot be safely restored for this resume");
    }

    record ResumeOccurrence(UUID id, LocalDate serviceDate, String mealSlotCode, Instant serviceAt,
                            int scheduleVersion, String targetStatus) {}
    private record Candidate(UUID id, LocalDate serviceDate, String mealSlotCode, Instant serviceAt,
                             int scheduleVersion, boolean sameBooking, boolean undispatched) {}
    private record History(String oldStatus, String newStatus, String source, UUID actor, Instant at) {}
    private record Invoice(String status, UUID planId, UUID customer, UUID chef) {}
    private record Schedule(int version, String timezone, String recurrence, UUID chef, String planStatus) {}
    private record Item(UUID menuItemId, int quantity, int sequence) {}
    private record ScheduledItem(Item item, LocalTime time) {}
    private record Allocation(UUID chef, UUID menuItemId, int units, String status, UUID occurrenceId) {}
}
