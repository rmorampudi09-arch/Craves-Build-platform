package in.craves.subscription.credit;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The refund-or-extend choices: one row per declined day or per resume. */
@Repository
public class DayCreditRepository {
    private static final String COLUMNS = "id, subscription_id, kind, first_date, last_date, meal_slot_code, days, status,"
        + " refund_amount, chosen_by, choice_deadline, chosen_at, created_at";

    public record DayCredit(
        UUID id,
        UUID subscriptionId,
        String kind,
        LocalDate firstDate,
        LocalDate lastDate,
        String mealSlotCode,
        Integer days,
        String status,
        BigDecimal refundAmount,
        String chosenBy,
        Instant choiceDeadline,
        Instant chosenAt,
        Instant createdAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public DayCreditRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Empty when this plan already has a choice of this kind starting that day. */
    public Optional<UUID> insertPending(
        UUID subscriptionId,
        String kind,
        LocalDate firstDate,
        LocalDate lastDate,
        String mealSlotCode,
        Integer days,
        Instant deadline
    ) {
        List<UUID> ids = jdbcTemplate.query(
            "INSERT INTO subscription_schema.subscription_day_credit"
                + " (id, subscription_id, kind, first_date, last_date, meal_slot_code, days, choice_deadline)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                + " ON CONFLICT (subscription_id, kind, first_date) DO NOTHING RETURNING id",
            (rs, row) -> rs.getObject("id", UUID.class),
            UUID.randomUUID(), subscriptionId, kind, Date.valueOf(firstDate), Date.valueOf(lastDate), mealSlotCode, days,
            Timestamp.from(deadline)
        );
        return ids.stream().findFirst();
    }

    public Optional<DayCredit> lockForSubscription(UUID creditId, UUID subscriptionId) {
        return jdbcTemplate.query(
            "SELECT " + COLUMNS + " FROM subscription_schema.subscription_day_credit WHERE id = ? AND subscription_id = ? FOR UPDATE",
            this::map, creditId, subscriptionId
        ).stream().findFirst();
    }

    /** Settles a choice once: false when it was already settled. */
    public boolean settle(UUID creditId, String status, String chosenBy) {
        return jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_day_credit SET status = ?, chosen_by = ?, chosen_at = now(), updated_at = now()"
                + " WHERE id = ? AND status = 'PENDING_CHOICE'",
            status, chosenBy, creditId
        ) == 1;
    }

    /** Pending choices plus everything since {@code since}, newest first. */
    public List<DayCredit> listForCustomer(UUID subscriptionId, Instant since) {
        return jdbcTemplate.query(
            "SELECT " + COLUMNS + " FROM subscription_schema.subscription_day_credit"
                + " WHERE subscription_id = ? AND (status = 'PENDING_CHOICE' OR created_at >= ?)"
                + " ORDER BY created_at DESC, first_date DESC LIMIT 20",
            this::map, subscriptionId, Timestamp.from(since)
        );
    }

    public List<DayCredit> dueDeadlines(Instant now, int limit) {
        return jdbcTemplate.query(
            "SELECT " + COLUMNS + " FROM subscription_schema.subscription_day_credit"
                + " WHERE status = 'PENDING_CHOICE' AND choice_deadline <= ? ORDER BY choice_deadline LIMIT ?",
            this::map, Timestamp.from(now), limit
        );
    }

    private DayCredit map(ResultSet rs, int row) throws SQLException {
        return new DayCredit(
            rs.getObject("id", UUID.class),
            rs.getObject("subscription_id", UUID.class),
            rs.getString("kind"),
            rs.getObject("first_date", LocalDate.class),
            rs.getObject("last_date", LocalDate.class),
            rs.getString("meal_slot_code"),
            (Integer) rs.getObject("days"),
            rs.getString("status"),
            rs.getBigDecimal("refund_amount"),
            rs.getString("chosen_by"),
            instant(rs.getTimestamp("choice_deadline")),
            instant(rs.getTimestamp("chosen_at")),
            instant(rs.getTimestamp("created_at"))
        );
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
