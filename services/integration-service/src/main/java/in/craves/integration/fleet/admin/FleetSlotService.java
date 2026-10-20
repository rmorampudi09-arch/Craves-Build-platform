package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.pay.FleetPay;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Ops-assigned slots with a guaranteed hourly minimum (PLAN F7b, admin-fleet-v1 slots). When a slot ends, the fleet pool
 * computes the top-up = max(0, guarantee x online in-zone hours - trip pay earned in the slot) into rider_slot_settlement;
 * the money phase credits it. Declines and missed offers never enter the sum.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSlotService {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetSlotService.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /**
     * Seconds online inside the zone during slot s, from location ingest's per-shift in-zone counter (non-mock fixes only).
     * shortcut: the counter is per shift, so a shift reaching past the slot counts at most its overlap with the slot, not
     * when inside the shift it was in the zone; count per slot during location ingest if riders work long shifts around slots.
     */
    static final String ONLINE_IN_ZONE_SECONDS = """
        (SELECT COALESCE(SUM(LEAST(sh.in_zone_seconds::bigint, GREATEST(0, EXTRACT(EPOCH FROM
                  LEAST(COALESCE(sh.ended_at, now()), s.ends_at) - GREATEST(sh.started_at, s.starts_at)))::bigint)), 0)::int
           FROM fleet_schema.rider_shift sh
          WHERE sh.rider_id = s.rider_id AND sh.started_at < s.ends_at AND COALESCE(sh.ended_at, now()) > s.starts_at)""";
    private static final String SLOT = "SELECT s.id, s.rider_id, r.name, s.zone_name, s.starts_at, s.ends_at, s.guaranteed_per_hour_paise, "
        + "s.status, st.online_in_zone_seconds AS settled_seconds, st.top_up_paise, "
        + "CASE WHEN s.status = 'BOOKED' AND s.starts_at <= now() THEN " + ONLINE_IN_ZONE_SECONDS + " END AS live_seconds "
        + "FROM fleet_schema.rider_slot s JOIN fleet_schema.rider r ON r.id = s.rider_id "
        + "LEFT JOIN fleet_schema.rider_slot_settlement st ON st.slot_id = s.id ";

    private final JdbcTemplate jdbc;
    private final FleetPolicyStore policies;
    private final FleetAdminService admin;
    private final TransactionTemplate transaction;

    public FleetSlotService(JdbcTemplate jdbc, FleetPolicyStore policies, FleetAdminService admin, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.admin = admin;
        this.transaction = new TransactionTemplate(transactions);
    }

    /** Slots starting on the IST dates from to to (at most 31 days), earliest first. */
    @Transactional(readOnly = true)
    public SlotPage list(LocalDate from, LocalDate to, UUID riderId) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 30) {
            throw FleetApiException.invalid("Choose up to 31 days, from before to.");
        }
        return new SlotPage(jdbc.query(SLOT + "WHERE s.starts_at >= ? AND s.starts_at < ? AND (CAST(? AS uuid) IS NULL OR s.rider_id = ?) "
                + "ORDER BY s.starts_at, s.id LIMIT 500", (row, n) -> slot(row),
            Timestamp.from(from.atStartOfDay(IST).toInstant()), Timestamp.from(to.plusDays(1).atStartOfDay(IST).toInstant()), riderId, riderId));
    }

    @Transactional
    public Object create(Admin by, UUID key, SlotInput input) {
        if (input == null || input.riderId() == null || input.startsAt() == null || input.endsAt() == null
            || input.guaranteedPerHourPaise() == null || input.zoneName() == null || input.zoneName().isBlank()
            || input.zoneName().trim().length() > 80) {
            throw FleetApiException.invalid("Choose the rider, a zone name of up to 80 characters, the start, the end and the hourly guarantee.");
        }
        if (!input.endsAt().isAfter(input.startsAt())) {
            throw FleetApiException.unprocessable("SLOT_END_NOT_AFTER_START", "The slot must end after it starts.");
        }
        if (!input.endsAt().isAfter(Instant.now())) {
            throw FleetApiException.invalid("The slot must end in the future.");
        }
        RateCard card = policies.currentRateCard()
            .orElseThrow(() -> FleetApiException.unprocessable("GUARANTEE_OUT_OF_RANGE", "There is no rate card to check the guarantee against."));
        List<Long> range = card.ranges().get("slot_guarantee_per_hour_paise");
        long guarantee = input.guaranteedPerHourPaise();
        if (guarantee < 1 || range == null || range.size() != 2 || guarantee < range.get(0) || guarantee > range.get(1)) {
            throw FleetApiException.unprocessable("GUARANTEE_OUT_OF_RANGE", range == null || range.size() != 2
                ? "The rate card declares no range for the slot guarantee."
                : "The hourly guarantee must be between " + range.get(0) + " and " + range.get(1) + " paise (rate card " + card.version() + ").");
        }
        String zone = input.zoneName().trim();
        String request = input.riderId() + "\n" + zone + "\n" + input.startsAt() + "\n" + input.endsAt() + "\n" + guarantee;
        return admin.once(by, key, "SLOT_BOOKED", request, () -> {
            String rider = jdbc.queryForList("SELECT name FROM fleet_schema.rider WHERE id = ? FOR UPDATE", String.class, input.riderId())
                .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("RIDER_NOT_FOUND", "No such rider."));
            // The rider row lock serialises bookings for one rider, so two overlapping requests cannot both pass this check.
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_slot WHERE rider_id = ? "
                + "AND status IN ('BOOKED', 'COMPLETED') AND starts_at < ? AND ends_at > ?)", Boolean.class, input.riderId(),
                Timestamp.from(input.endsAt()), Timestamp.from(input.startsAt())))) {
                throw FleetApiException.conflict("SLOT_OVERLAP", "The rider already has a booked slot in this window.");
            }
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise, "
                + "created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", id, input.riderId(), zone, Timestamp.from(input.startsAt()),
                Timestamp.from(input.endsAt()), guarantee, by.id());
            return new Done(read(id), input.riderId(), id.toString(), "Booked " + rider + " into " + zone + " from " + input.startsAt()
                + " to " + input.endsAt() + " at " + guarantee + " paise an hour.");
        });
    }

    @Transactional
    public Object cancel(Admin by, UUID key, UUID slotId, String reason) {
        String text = FleetAdminService.reason(reason);
        return admin.once(by, key, "SLOT_CANCELLED", slotId + "\n" + text, () -> {
            UUID rider = jdbc.queryForList("UPDATE fleet_schema.rider_slot SET status = 'CANCELLED', cancelled_reason = ?, cancelled_by = ?, "
                + "cancelled_at = now() WHERE id = ? AND status = 'BOOKED' RETURNING rider_id", UUID.class, text, by.id(), slotId)
                .stream().findFirst().orElseThrow(() -> jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_slot WHERE id = ?)",
                    Boolean.class, slotId)
                    ? FleetApiException.conflict("SLOT_NOT_BOOKED", "This slot is already cancelled or completed.")
                    : FleetApiException.notFound("SLOT_NOT_FOUND", "No such slot."));
            return new Done(read(slotId), rider, slotId.toString(), "Cancelled the slot: " + text);
        });
    }

    /** Settles every booked slot that has ended, one transaction each; returns how many settled. */
    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.slot-settlement-interval-ms:60000}")
    public int settleDue() {
        int settled = 0;
        while (Boolean.TRUE.equals(transaction.execute(status -> settleOne()))) {
            settled++;
        }
        return settled;
    }

    private boolean settleOne() {
        List<Due> due = jdbc.query("SELECT s.id, s.rider_id, s.starts_at, s.ends_at, s.guaranteed_per_hour_paise, "
            + ONLINE_IN_ZONE_SECONDS + " AS seconds FROM fleet_schema.rider_slot s WHERE s.status = 'BOOKED' AND s.ends_at <= now() "
            + "ORDER BY s.ends_at LIMIT 1 FOR UPDATE OF s SKIP LOCKED", (row, n) -> new Due(row.getObject("id", UUID.class),
            row.getObject("rider_id", UUID.class), row.getTimestamp("starts_at"), row.getTimestamp("ends_at"),
            (Long) row.getObject("guaranteed_per_hour_paise"), row.getInt("seconds")));
        if (due.isEmpty()) {
            return false;
        }
        Due slot = due.get(0);
        if (slot.guaranteedPerHourPaise() != null) {
            long tripPay = jdbc.queryForObject("SELECT COALESCE(SUM(final_pay_paise), 0) FROM fleet_schema.trip WHERE rider_id = ? "
                + "AND final_pay_paise IS NOT NULL AND finished_at >= ? AND finished_at < ?", Long.class, slot.riderId(), slot.startsAt(),
                slot.endsAt());
            long guaranteed = FleetPay.slotGuarantee(slot.guaranteedPerHourPaise(), slot.onlineSeconds());
            long topUp = FleetPay.slotTopUp(guaranteed, tripPay);
            jdbc.update("INSERT INTO fleet_schema.rider_slot_settlement (slot_id, rider_id, guaranteed_per_hour_paise, online_in_zone_seconds, "
                + "guaranteed_paise, trip_pay_paise, top_up_paise) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (slot_id) DO NOTHING",
                slot.id(), slot.riderId(), slot.guaranteedPerHourPaise(), slot.onlineSeconds(), guaranteed, tripPay, topUp);
            LOGGER.info("FLEET_SLOT_SETTLED slot={} rider={} onlineInZoneSeconds={} guaranteedPaise={} tripPayPaise={} topUpPaise={}",
                slot.id(), slot.riderId(), slot.onlineSeconds(), guaranteed, tripPay, topUp);
        }
        jdbc.update("UPDATE fleet_schema.rider_slot SET status = 'COMPLETED' WHERE id = ?", slot.id());
        return true;
    }

    private Slot read(UUID slotId) {
        return jdbc.queryForObject(SLOT + "WHERE s.id = ?", (row, n) -> slot(row), slotId);
    }

    private static Slot slot(ResultSet row) throws SQLException {
        Integer seconds = (Integer) (row.getObject("settled_seconds") != null ? row.getObject("settled_seconds") : row.getObject("live_seconds"));
        return new Slot(row.getObject("id", UUID.class), row.getObject("rider_id", UUID.class), row.getString("name"),
            row.getString("zone_name"), row.getTimestamp("starts_at").toInstant(), row.getTimestamp("ends_at").toInstant(),
            (Long) row.getObject("guaranteed_per_hour_paise"), row.getString("status"), seconds == null ? null : seconds / 60,
            (Long) row.getObject("top_up_paise"));
    }

    private record Due(UUID id, UUID riderId, Timestamp startsAt, Timestamp endsAt, Long guaranteedPerHourPaise, int onlineSeconds) {
    }

    public record SlotInput(UUID riderId, String zoneName, Instant startsAt, Instant endsAt, Long guaranteedPerHourPaise) {
    }

    /** onlineInZoneMinutes once the slot has started; topUpPaise once it is COMPLETED. Nullable fields are sent as null. */
    public record Slot(UUID slotId, UUID riderId, String riderName, String zoneName, Instant startsAt, Instant endsAt,
                       Long guaranteedPerHourPaise, String status, Integer onlineInZoneMinutes, Long topUpPaise) {
    }

    public record SlotPage(List<Slot> slots) {
    }
}
