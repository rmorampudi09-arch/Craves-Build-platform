package in.craves.integration.fleet.rider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.rider.FleetRiderModels.ActiveTrip;
import in.craves.integration.fleet.rider.FleetRiderModels.DeviceHealth;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatchResponse;
import in.craves.integration.fleet.rider.FleetRiderModels.OfferReceipt;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.trip.FleetTripModels;
import in.craves.integration.fleet.trip.FleetTripModels.Offer;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /locations: the native service's fix upload, heartbeat and second offer channel. Each call runs at most five
 * statements (docs/riders/BACKEND.md, "Location ingest"): one read of the shift, rider, position, trip and current
 * slot that locks the shift row; then, only for fixes newer than the stored one, the position upsert and one trip_track
 * insert while on a trip; then, on every call, the shift update (heartbeat, survival counters, in-zone seconds); then
 * the offers read. A stop runs the read and one shift update.
 */
@Service
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled", "craves.fleet.location-ingest-enabled"},
    havingValue = "true")
public class FleetLocationService {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetLocationService.class);
    static final int MAX_FIXES = 5;
    /** The most one gap between fixes adds to in-zone time; the phone may sleep longer than that. */
    static final Duration MAX_GAP = Duration.ofSeconds(60);
    /** Fixes stamped further ahead of the database clock are dropped. */
    static final Duration CLOCK_AHEAD = Duration.ofMinutes(5);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /** On-trip fixes are kept this many days (blueprint E6). */
    static final int TRACK_DAYS_KEPT = 90;
    /** Phone health on a shift is kept this many days (blueprint E6). */
    static final int HEALTH_DAYS_KEPT = 90;
    /** A fix's ageMs is capped at an hour: older is no use to dispatch or the track. */
    static final long MAX_FIX_AGE_MS = 3_600_000;
    static final int MAX_RECEIPTS = 10;
    static final long MAX_RECEIPT_AGE_MS = 3_600_000;
    private static final Set<String> RECEIPT_CHANNELS = Set.of("fcm", "locations");
    private static final String CONTEXT = """
        SELECT s.id AS shift_id, s.started_at, s.ended_at, s.credential_revoked_at, s.credential_expires_at <= now() AS expired,
               r.id AS rider_id, r.status, p.shift_id AS last_shift_id, p.recorded_at AS last_at, p.mock AS last_mock,
               p.trip_id AS last_trip_id, a.id AS trip_id, a.state AS trip_state, a.version AS trip_version,
               e.rider_id AS last_trip_rider_id, e.state AS last_trip_state, e.version AS last_trip_version,
               z.id AS slot_id, z.starts_at AS slot_starts_at, z.ends_at AS slot_ends_at, now() AS db_now
        FROM fleet_schema.rider_shift s
        JOIN fleet_schema.rider r ON r.id = s.rider_id
        LEFT JOIN fleet_schema.rider_position_latest p ON p.rider_id = s.rider_id
        LEFT JOIN fleet_schema.trip a ON a.rider_id = s.rider_id AND a.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP')
        LEFT JOIN fleet_schema.trip e ON e.id = p.trip_id
        LEFT JOIN LATERAL (SELECT id, starts_at, ends_at FROM fleet_schema.rider_slot
          WHERE rider_id = s.rider_id AND status = 'BOOKED' AND starts_at <= now() AND ends_at > now() ORDER BY starts_at DESC LIMIT 1) z ON true
        WHERE %s
        FOR UPDATE OF s""";
    private static final String UPSERT = """
        INSERT INTO fleet_schema.rider_position_latest AS p (rider_id, shift_id, trip_id, lat, lng, accuracy_m, mock, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (rider_id) DO UPDATE SET shift_id = excluded.shift_id, trip_id = excluded.trip_id, lat = excluded.lat,
          lng = excluded.lng, accuracy_m = excluded.accuracy_m, mock = excluded.mock, recorded_at = excluded.recorded_at, received_at = now()
        WHERE p.recorded_at < excluded.recorded_at OR p.shift_id IS DISTINCT FROM excluded.shift_id""";
    /**
     * The shift row on every call: the heartbeat (dispatch and the watchdog read last_seen_at), the longest gap between
     * calls and the gaps over 60 s (the first gap counts from started_at), and the in-zone seconds of the shift and its
     * slot. The slot's settle the guarantee; a slot that settled meanwhile is COMPLETED and keeps its settled seconds.
     * The same statement records the offer receipts: the first arrival of each of this rider's offers, never earlier than
     * the offer itself; and the phone's health, each key keeping its latest value, with can_ring for dispatch.
     */
    private static final String HEARTBEAT = """
        WITH slot AS (UPDATE fleet_schema.rider_slot SET in_zone_seconds = in_zone_seconds + ? WHERE id = ? AND status = 'BOOKED'),
        receipt AS (
          UPDATE fleet_schema.trip_offer o
          SET rang_at = GREATEST(o.offered_at, now() - make_interval(secs => r.age_ms / 1000.0)), rang_channel = r.channel
          FROM jsonb_to_recordset(CAST(? AS jsonb)) AS r(offer_id uuid, channel text, age_ms bigint)
          WHERE o.id = r.offer_id AND o.rider_id = ? AND o.rang_at IS NULL)
        UPDATE fleet_schema.rider_shift SET in_zone_seconds = in_zone_seconds + ?, last_seen_at = now(),
          max_silence_seconds = GREATEST(max_silence_seconds, EXTRACT(EPOCH FROM now() - COALESCE(last_seen_at, started_at))::integer),
          silences_over_60s = silences_over_60s
            + CASE WHEN now() - COALESCE(last_seen_at, started_at) > INTERVAL '60 seconds' THEN 1 ELSE 0 END,
          health = CASE WHEN CAST(? AS jsonb) IS NULL THEN health ELSE COALESCE(health, '{}'::jsonb) || CAST(? AS jsonb) END,
          can_ring = COALESCE(?, can_ring)
        WHERE id = ?""";
    private static final String OFFERS = "SELECT " + FleetTripModels.OFFER_COLUMNS + """

        FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id
        WHERE o.rider_id = ? AND o.state = 'ACTIVE' AND o.expires_at > now()
        ORDER BY o.expires_at""";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public FleetLocationService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * Records the fixes of the rider's shift and answers with their offers and trip, or a stop. With a credential the
     * shift is the credential's (unknown: 401); with a JWT it is the rider's open shift (none: stop).
     */
    @Transactional
    public LocationBatchResponse ingest(UUID identityId, String credential, LocationBatch batch) {
        if (batch == null || batch.fixes() == null || batch.fixes().size() > MAX_FIXES) {
            throw FleetApiException.invalid("Send at most 5 fixes.");
        }
        boolean byCredential = credential != null;
        // The cast keeps the credential_hash unique index usable whatever type the driver binds.
        String where = byCredential ? "s.credential_hash = CAST(? AS CHAR(64))" : "r.identity_id = ? AND s.ended_at IS NULL";
        Context shift = jdbc.query(CONTEXT.formatted(where), (row, n) -> context(row),
            byCredential ? FleetShiftService.hash(credential) : identityId).stream().findFirst().orElse(null);
        if (shift == null) {
            if (byCredential) {
                throw FleetShiftService.credentialInvalid();
            }
            return stop("You're offline. Go online to get orders.");
        }
        String stopReason = stopReason(shift);
        if (stopReason != null) {
            jdbc.update(FleetShiftService.endShifts("id = ?"), shift.shiftId());
            return stop(stopReason);
        }
        boolean sameShift = shift.shiftId().equals(shift.lastShiftId());
        Instant after = sameShift ? shift.lastAt() : null;
        // Resent fixes (a lost response) are at or before the stored one, so nothing is counted or tracked twice.
        List<RiderFix> fresh = batch.fixes().stream().map(fix -> timed(fix, shift.now())).filter(fix -> usable(fix, shift.startedAt(), shift.now()))
            .map(fix -> new RiderFix(fix.lat(), fix.lng(), fix.accuracyM(), fix.at().truncatedTo(ChronoUnit.MICROS), Boolean.TRUE.equals(fix.mock())))
            .filter(fix -> after == null || fix.at().isAfter(after)).sorted(Comparator.comparing(RiderFix::at)).toList();
        long seconds = 0;
        if (!fresh.isEmpty()) {
            RiderFix newest = fresh.get(fresh.size() - 1);
            jdbc.update(UPSERT, shift.riderId(), shift.shiftId(), shift.tripId(), newest.lat(), newest.lng(), newest.accuracyM(), newest.mock(),
                Timestamp.from(newest.at()));
            if (shift.tripId() != null) {
                List<Object> args = new ArrayList<>();
                fresh.forEach(fix -> args.addAll(List.of(shift.tripId(), shift.riderId(), Timestamp.from(fix.at()), fix.lat(), fix.lng(),
                    fix.accuracyM(), fix.mock())));
                jdbc.update("INSERT INTO fleet_schema.trip_track (trip_id, rider_id, recorded_at, lat, lng, accuracy_m, mock) VALUES "
                    + String.join(", ", Collections.nCopies(fresh.size(), "(?, ?, ?, ?, ?, ?, ?)")), args.toArray());
            }
            seconds = inZoneSeconds(after, sameShift && Boolean.TRUE.equals(shift.lastMock()), fresh, shift.slotStart(), shift.slotEnd());
        }
        String health = health(batch.health());
        jdbc.update(HEARTBEAT, seconds, seconds > 0 ? shift.slotId() : null, receipts(batch.offerReceipts()), shift.riderId(), seconds,
            health, health, batch.health() == null ? null : batch.health().canRing(), shift.shiftId());
        if (batch.health() != null && batch.health().lastExitReason() != null) {
            LOGGER.info("FLEET_APP_EXIT rider={} reason={}", shift.riderId(), oneLine(batch.health().lastExitReason()));
        }
        List<Offer> offers = jdbc.query(OFFERS, (row, n) -> FleetTripModels.offer(row, json), shift.riderId());
        return new LocationBatchResponse(offers, activeTrip(shift), null, null);
    }

    /**
     * Creates the trip_track partitions for the next 7 IST days, a minute after start-up and every 6 hours. Never today:
     * fixes may already sit in trip_track_default for it, and the partition would then be refused. Then drops the days
     * past retention (dropOldTrackDays).
     */
    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "PT6H", scheduler = FleetConfiguration.FLEET_SCHEDULER)
    public void createTrackDays() {
        LocalDate today = LocalDate.now(IST);
        for (int i = 1; i <= 7; i++) {
            LocalDate day = today.plusDays(i);
            try {
                jdbc.execute("CREATE TABLE IF NOT EXISTS fleet_schema.trip_track_" + day.format(DateTimeFormatter.BASIC_ISO_DATE)
                    + " PARTITION OF fleet_schema.trip_track FOR VALUES FROM ('" + day + " 00:00+05:30') TO ('" + day.plusDays(1) + " 00:00+05:30')");
            } catch (DataAccessException exception) {
                LOGGER.error("CRAVES_ALERT alert=TRIP_TRACK_PARTITION_FAILED day={} reason={}", day, exception.getMostSpecificCause().getMessage());
            }
        }
        dropOldTrackDays(today);
        forgetOldHealth();
    }

    /** Retention (BACKEND.md "Data retention", blueprint E6): a shift's phone health is kept 90 days. */
    void forgetOldHealth() {
        try {
            jdbc.update("UPDATE fleet_schema.rider_shift SET health = NULL WHERE health IS NOT NULL AND started_at < now() - make_interval(days => ?)",
                HEALTH_DAYS_KEPT);
        } catch (DataAccessException exception) {
            LOGGER.error("CRAVES_ALERT alert=SHIFT_HEALTH_RETENTION_FAILED reason={}", exception.getMostSpecificCause().getMessage());
        }
    }

    /**
     * Retention (BACKEND.md "Data retention", blueprint E6): on-trip fixes are kept 90 days. Day partitions that ended
     * before then are dropped, and older rows that landed in trip_track_default are deleted.
     */
    void dropOldTrackDays(LocalDate today) {
        LocalDate oldestKept = today.minusDays(TRACK_DAYS_KEPT);
        try {
            List<String> days = jdbc.queryForList("""
                SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
                JOIN pg_namespace n ON n.oid = p.relnamespace
                WHERE n.nspname = 'fleet_schema' AND p.relname = 'trip_track' AND c.relname ~ '^trip_track_[0-9]{8}$'""", String.class);
            for (String name : days) {
                LocalDate day = LocalDate.parse(name.substring("trip_track_".length()), DateTimeFormatter.BASIC_ISO_DATE);
                if (day.isBefore(oldestKept)) {
                    dropPartition(name);
                    LOGGER.info("FLEET_TRACK_DAY_DROPPED day={}", day);
                }
            }
            jdbc.update("DELETE FROM fleet_schema.trip_track_default WHERE recorded_at < ?", Timestamp.from(oldestKept.atStartOfDay(IST).toInstant()));
        } catch (DataAccessException | DateTimeParseException exception) {
            LOGGER.error("CRAVES_ALERT alert=TRIP_TRACK_RETENTION_FAILED reason={}", exception instanceof DataAccessException data
                ? data.getMostSpecificCause().getMessage() : exception.getMessage());
        }
    }

    /** name comes from the catalog and matches trip_track_ and 8 digits. */
    private void dropPartition(String name) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                // The drop locks trip_track itself: give up rather than hold riders' track inserts behind it.
                statement.execute("SET LOCAL lock_timeout = '3s'");
                statement.execute("DROP TABLE IF EXISTS fleet_schema." + name);
                connection.commit();
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            } finally {
                connection.setAutoCommit(autoCommit);
            }
            return null;
        });
    }

    /**
     * The call's offer receipts as JSON rows for jsonb_to_recordset: the first 10, valid ids and channels only, each offer
     * once, ages clamped to 0 to 1 hour. They are telemetry, so a bad one is dropped, never a reason to refuse the call.
     */
    String receipts(List<OfferReceipt> receipts) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        for (OfferReceipt receipt : receipts == null ? List.<OfferReceipt>of() : receipts.subList(0, Math.min(MAX_RECEIPTS, receipts.size()))) {
            if (receipt == null || !RECEIPT_CHANNELS.contains(receipt.channel()) || receipt.offerId() == null) {
                continue;
            }
            UUID offerId;
            try {
                offerId = UUID.fromString(receipt.offerId());
            } catch (IllegalArgumentException notAnId) {
                continue;
            }
            if (seen.add(offerId)) {
                long ageMs = receipt.ageMs() == null ? 0 : Math.max(0, Math.min(MAX_RECEIPT_AGE_MS, receipt.ageMs()));
                rows.add(Map.of("offer_id", offerId.toString(), "channel", receipt.channel(), "age_ms", ageMs));
            }
        }
        try {
            return json.writeValueAsString(rows);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Offer receipts could not be written", exception);
        }
    }

    /** The phone's health as JSON for the shift row, without the fields it left out; the exit reason kept short. */
    String health(DeviceHealth health) {
        if (health == null) {
            return null;
        }
        DeviceHealth kept = health.lastExitReason() == null ? health : new DeviceHealth(health.batteryPct(), health.charging(),
            health.powerSave(), health.canRing(), health.drainPct(), health.unpluggedMin(), oneLine(health.lastExitReason()),
            health.queuePending(), health.queueOldestAgeS());
        try {
            return json.writeValueAsString(kept);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Phone health could not be written", exception);
        }
    }

    /** At most 200 printable characters on one line, for the log and the health column. */
    static String oneLine(String text) {
        String flat = text.replaceAll("[^\\x20-\\x7E]", " ").trim();
        return flat.length() <= 200 ? flat : flat.substring(0, 200);
    }

    /** Why the phone must stop, or null. Each stop also closes the shift. */
    static String stopReason(Context shift) {
        if (!"ACTIVE".equals(shift.status())) {
            return "Your account can't take orders right now. Open the app to see why.";
        }
        if (shift.endedAt() != null) {
            return "You're offline. Go online again to get orders.";
        }
        if (shift.revokedAt() != null) {
            return "Your shift was stopped on this phone. Go online again from your approved phone.";
        }
        return shift.expired() ? "Your shift ended after 12 hours. Go online again to keep riding." : null;
    }

    /**
     * The fix timed by the database clock when the phone says how old it is (ageMs, app 1.1.0, at most an hour), so a
     * phone clock that is wrong no longer matters (blueprint A6); without ageMs, the phone's own stamp as before.
     */
    static RiderFix timed(RiderFix fix, Instant now) {
        if (fix == null || fix.ageMs() == null) {
            return fix;
        }
        long ageMs = Math.max(0, Math.min(MAX_FIX_AGE_MS, fix.ageMs()));
        return new RiderFix(fix.lat(), fix.lng(), fix.accuracyM(), now.minusMillis(ageMs), fix.mock(), fix.ageMs());
    }

    /** A fix with sane values, taken during the shift and not stamped in the future. */
    static boolean usable(RiderFix fix, Instant shiftStart, Instant now) {
        return fix != null && fix.lat() != null && fix.lng() != null && fix.accuracyM() != null && fix.at() != null
            && fix.lat() >= -90 && fix.lat() <= 90 && fix.lng() >= -180 && fix.lng() <= 180
            && fix.accuracyM() >= 0 && fix.accuracyM() < 1_000_000
            && !fix.at().isBefore(shiftStart) && !fix.at().isAfter(now.plus(CLOCK_AHEAD));
    }

    /**
     * In-zone seconds for the slot guarantee. Zone model: P1 stores a slot's zone as a name and a time window, with no
     * geometry, so a gap between two consecutive non-mock fixes counts while one of the rider's BOOKED slots runs, clipped
     * to that slot and at most MAX_GAP per gap. shortcut: the position is not checked against the zone; add zone geometry (centre and radius)
     * when ops draws the pilot area and test each fix against it.
     *
     * @param previousAt the stored fix of this shift that the first fresh fix follows, or null
     * @param fixes      fresh fixes, oldest first
     */
    static long inZoneSeconds(Instant previousAt, boolean previousMock, List<RiderFix> fixes, Instant slotStart, Instant slotEnd) {
        if (slotStart == null) {
            return 0;
        }
        long millis = 0;
        Instant previous = previousAt;
        boolean previousCounts = previousAt != null && !previousMock;
        for (RiderFix fix : fixes) {
            boolean counts = !Boolean.TRUE.equals(fix.mock());
            if (previousCounts && counts) {
                Instant from = Collections.max(List.of(previous, fix.at().minus(MAX_GAP), slotStart));
                Instant to = fix.at().isBefore(slotEnd) ? fix.at() : slotEnd;
                millis += Math.max(0, Duration.between(from, to).toMillis());
            }
            previous = fix.at();
            previousCounts = counts;
        }
        return Math.round(millis / 1000.0);
    }

    /**
     * The trip in progress; else the trip the rider was on at this shift's last fix, which has since ended or gone to
     * another rider (CANCELLED for this one), so the app leaves trip mode.
     */
    static ActiveTrip activeTrip(Context shift) {
        if (shift.tripId() != null) {
            return new ActiveTrip(shift.tripId().toString(), FleetTripModels.step(shift.tripState()), shift.tripVersion());
        }
        if (shift.lastTripId() == null || shift.lastTripVersion() == null || !shift.shiftId().equals(shift.lastShiftId())) {
            return null;
        }
        String step = shift.riderId().equals(shift.lastTripRiderId()) ? FleetTripModels.step(shift.lastTripState()) : "CANCELLED";
        return new ActiveTrip(shift.lastTripId().toString(), step, shift.lastTripVersion());
    }

    private static LocationBatchResponse stop(String reason) {
        return new LocationBatchResponse(List.of(), null, true, reason);
    }

    private static Context context(ResultSet row) throws SQLException {
        return new Context(row.getObject("shift_id", UUID.class), instant(row, "started_at"), instant(row, "ended_at"),
            instant(row, "credential_revoked_at"), row.getBoolean("expired"), row.getObject("rider_id", UUID.class), row.getString("status"),
            row.getObject("last_shift_id", UUID.class), instant(row, "last_at"), (Boolean) row.getObject("last_mock"),
            row.getObject("last_trip_id", UUID.class), row.getObject("trip_id", UUID.class), row.getString("trip_state"),
            (Integer) row.getObject("trip_version"), row.getObject("last_trip_rider_id", UUID.class), row.getString("last_trip_state"),
            (Integer) row.getObject("last_trip_version"), row.getObject("slot_id", UUID.class), instant(row, "slot_starts_at"),
            instant(row, "slot_ends_at"), instant(row, "db_now"));
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    record Context(UUID shiftId, Instant startedAt, Instant endedAt, Instant revokedAt, boolean expired, UUID riderId, String status,
                   UUID lastShiftId, Instant lastAt, Boolean lastMock, UUID lastTripId, UUID tripId, String tripState, Integer tripVersion,
                   UUID lastTripRiderId, String lastTripState, Integer lastTripVersion, UUID slotId, Instant slotStart, Instant slotEnd,
                   Instant now) {
    }
}
