package in.craves.integration.fleet.money;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetAdminService.Cursor;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.engine.FleetEngineFeed;
import in.craves.integration.fleet.money.FleetMoneyModels.Adjustment;
import in.craves.integration.fleet.money.FleetMoneyModels.AdjustmentInput;
import in.craves.integration.fleet.money.FleetMoneyModels.EarningsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Hold;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldInput;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Line;
import in.craves.integration.fleet.money.FleetMoneyModels.TripEarning;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.fleet.trip.PayLine;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerJournal.Entry;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Rider earnings (PLAN F12). Each paid trip end (FleetTripPayFinalized) and each slot top-up becomes rows in
 * fleet_schema.rider_earning, one per pay line, keyed fleet-trip-pay/{tripId}/{component}/{revision} (a slot:
 * fleet-slot-pay/{slotId}/...), and one balanced journal per row with the same key in the immutable ledger: the rider's
 * pay is a delivery cost owed through the pooled RIDER_PAYABLE account, and TDS moves from RIDER_PAYABLE to
 * RIDER_TDS_PAYABLE. The unique key makes a second credit impossible; corrections are later revisions with a reason.
 * A row is pending until withdrawable_at, 24 h after the delivery, and stays out of the balance while its trip has an
 * active hold, or an open support issue raised before then (for at most 7 days).
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetEarnings {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetEarnings.class);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final Duration PENDING = Duration.ofHours(24);
    static final int MAX_HOLD_DAYS = 7;
    static final int PAGE = 20;
    /** A correction is at most ₹10,000 either way: a bigger one is a mistake to look into, not a typo to post. */
    static final long MAX_ADJUSTMENT_PAISE = 1_000_000;
    static final String AUTOMATIC = "Craves (automatic)";
    static final String DISPUTE_REASON = "You reported a problem with this trip. Its pay waits until support fixes it, for up to 7 days.";
    private static final String PROVIDER = "craves_fleet";
    private static final TypeReference<List<PayLine>> LINES = new TypeReference<>() { };
    /**
     * Rows of rider_earning e that count towards the balance now: past withdrawable_at, no active hold on the trip, and no
     * open support issue raised on the trip before its pay became withdrawable, for 7 days from the issue.
     */
    static final String RELEASED = """
        e.withdrawable_at <= now()
        AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_pay_hold h WHERE h.trip_id = e.trip_id AND h.state = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM fleet_schema.support_issue s JOIN fleet_schema.trip st ON st.id = s.trip_id
                         WHERE s.trip_id = e.trip_id AND s.state <> 'FIXED' AND s.created_at < st.pay_finalized_at + interval '24 hours'
                           AND s.created_at > now() - interval '7 days')""";
    /** A rider's pay (net of TDS) and trips in a window: trips by when their pay was finalized, top-ups by slot end. */
    public static final String RANGE_TOTAL_SQL = """
        SELECT COALESCE(SUM(e.net_paise), 0) AS paise, COUNT(DISTINCT e.trip_id) AS trips
        FROM fleet_schema.rider_earning e
        LEFT JOIN fleet_schema.trip t ON t.id = e.trip_id
        LEFT JOIN fleet_schema.rider_slot sl ON sl.id = e.slot_id
        WHERE e.rider_id = ? AND COALESCE(t.pay_finalized_at, sl.ends_at) >= ? AND COALESCE(t.pay_finalized_at, sl.ends_at) < ?""";
    /**
     * When a shift (alias s) stopped being available for offers: its end, its credential's end, or 3 minutes after the phone
     * last called, whichever came first, so a phone that died mid-shift doesn't count as online for the rest of it. The
     * pilot-health query earnings_per_online_hour repeats this.
     */
    static final String SHIFT_END = "LEAST(COALESCE(s.ended_at, now()), s.credential_expires_at, "
        + "COALESCE(s.credential_revoked_at, 'infinity'::timestamptz), COALESCE(s.last_seen_at, s.started_at) + INTERVAL '3 minutes')";
    /**
     * Phase 4: each rider's available online time in a window (from, to): every shift cut to the window and to SHIFT_END,
     * less its breaks there. The CTEs win, w and available; the queries below add to them.
     */
    private static final String AVAILABLE = """
        WITH win AS (SELECT CAST(? AS timestamptz) AS from_at, LEAST(CAST(? AS timestamptz), now()) AS to_at),
        w AS (SELECT s.id, s.rider_id, GREATEST(s.started_at, win.from_at) AS from_at, LEAST(%1$s, win.to_at) AS to_at
              FROM fleet_schema.rider_shift s CROSS JOIN win WHERE s.started_at < win.to_at AND %1$s > win.from_at),
        available AS (SELECT w.rider_id, EXTRACT(EPOCH FROM w.to_at - w.from_at) - COALESCE((
                        SELECT SUM(EXTRACT(EPOCH FROM LEAST(b.ends_at, w.to_at) - GREATEST(b.started_at, w.from_at)))
                        FROM fleet_schema.rider_break b WHERE b.shift_id = w.id AND b.started_at < w.to_at AND b.ends_at > w.from_at), 0) AS seconds
                      FROM w)
        """.formatted(SHIFT_END);
    /** A rider's available online seconds in (from, to); parameters from, to, rider. */
    public static final String ONLINE_SECONDS_SQL = AVAILABLE + "SELECT COALESCE(SUM(seconds), 0)::bigint FROM available WHERE rider_id = ?";
    /**
     * The middle (median) pay per available online hour in (from, to) over riders online 30 minutes or more then, in paise;
     * NULL with fewer than 5 such riders, so no one rider's pay can be worked out. Parameters from, to.
     */
    public static final String FLEET_PER_HOUR_SQL = AVAILABLE + """
        , online AS (SELECT rider_id, SUM(seconds) AS seconds FROM available GROUP BY rider_id),
        earned AS (SELECT e.rider_id, SUM(e.net_paise) AS paise FROM fleet_schema.rider_earning e
                   LEFT JOIN fleet_schema.trip t ON t.id = e.trip_id LEFT JOIN fleet_schema.rider_slot sl ON sl.id = e.slot_id
                   CROSS JOIN win
                   WHERE COALESCE(t.pay_finalized_at, sl.ends_at) >= win.from_at AND COALESCE(t.pay_finalized_at, sl.ends_at) < win.to_at
                   GROUP BY e.rider_id)
        SELECT CASE WHEN count(*) >= 5 THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(earned.paise, 0) * 3600.0
               / online.seconds))::bigint END
        FROM online LEFT JOIN earned USING (rider_id) WHERE online.seconds >= 1800""";
    /** Under half an hour online, pay per hour says little: fair turns count at least this much, Home shows nothing. */
    public static final long MIN_ONLINE_SECONDS = 1_800;

    /** Pay per available online hour, as fair turns compare riders and Home shows them: at least 30 minutes counted. */
    public static long perOnlineHourPaise(long paise, long onlineSeconds) {
        return paise * 3600 / Math.max(onlineSeconds, MIN_ONLINE_SECONDS);
    }

    /** The current Indian financial year (from 1 April, IST) as a timestamptz. */
    static final String FINANCIAL_YEAR_START =
        "((date_trunc('year', (now() AT TIME ZONE 'Asia/Kolkata') - interval '3 months') + interval '3 months') AT TIME ZONE 'Asia/Kolkata')";
    private static final String TRIP = """
        SELECT t.id, t.pay_finalized_at, t.kitchen_area, t.drop_area, t.pickup_distance_m, t.drop_distance_m, t.rate_card_version,
               h.reason AS hold_reason, h.release_on,
               (SELECT min(s.created_at) FROM fleet_schema.support_issue s WHERE s.trip_id = t.id AND s.state <> 'FIXED'
                  AND s.created_at < t.pay_finalized_at + interval '24 hours' AND s.created_at > now() - interval '7 days') AS disputed_at
        FROM fleet_schema.trip t LEFT JOIN fleet_schema.rider_pay_hold h ON h.trip_id = t.id AND h.state = 'ACTIVE'
        """;
    private static final String HOLD = """
        SELECT h.id, h.trip_id, t.order_code, h.rider_id, r.name, h.reason, h.release_on, h.state, h.created_by_name, h.created_at,
               h.released_by_name, h.released_at,
               GREATEST(0, (SELECT COALESCE(SUM(e.net_paise), 0) FROM fleet_schema.rider_earning e WHERE e.trip_id = h.trip_id)) AS amount
        FROM fleet_schema.rider_pay_hold h JOIN fleet_schema.trip t ON t.id = h.trip_id JOIN fleet_schema.rider r ON r.id = h.rider_id
        """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final LedgerPostingService ledger;
    private final FleetAdminService admin;
    private final TransactionTemplate fresh;
    private final TaskExecutor background;
    private final Tds tds;
    private final boolean ledgerOn;

    public FleetEarnings(JdbcTemplate jdbc, ObjectMapper json, LedgerPostingService ledger, FleetAdminService admin,
                         PlatformTransactionManager transactions, @Qualifier(FleetConfiguration.FLEET_SCHEDULER) TaskExecutor background,
                         @Value("${craves.fleet.tds.enabled:false}") boolean tdsEnabled,
                         @Value("${craves.fleet.tds.section:}") String tdsSection,
                         @Value("${craves.fleet.tds.rate-basis-points:0}") int tdsRateBasisPoints,
                         @Value("${craves.fleet.tds.annual-threshold-paise:0}") long tdsAnnualThresholdPaise,
                         @Value("${craves.ledger.posting-enabled:false}") boolean ledgerOn) {
        this.jdbc = jdbc;
        this.json = json;
        this.ledger = ledger;
        this.admin = admin;
        this.fresh = new TransactionTemplate(transactions);
        this.fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.background = background;
        this.tds = new Tds(tdsEnabled, tdsSection, tdsRateBasisPoints, tdsAnnualThresholdPaise);
        this.ledgerOn = ledgerOn;
    }

    /** Phase 5: the fleet engine's feed while craves.fleet.engine.mode is shadow or live, else null. */
    private FleetEngineFeed engineFeed;

    @Autowired(required = false)
    public void setEngineFeed(FleetEngineFeed feed) {
        this.engineFeed = feed.on() ? feed : null;
    }

    /**
     * After the trip's own transaction commits, so a failed credit never undoes a delivery (the money job retries it), and
     * on the fleet pool: the rider's request never waits for a second database connection while it still holds its own.
     */
    @TransactionalEventListener(fallbackExecution = true)
    public void onTripPayFinalized(FleetTripPayFinalized event) {
        try {
            background.execute(() -> safely("trip", event.tripId(), () -> creditTrip(event.tripId())));
        } catch (RuntimeException rejected) {
            LOGGER.warn("FLEET_CREDIT_DEFERRED trip={} (the money job credits it)", event.tripId());
        }
    }

    /** Credits trips and slot top-ups still waiting (a crash, a failure, the ledger off), and releases holds that are due. */
    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.money-interval-ms:60000}")
    public void tick() {
        int released = releaseDueHolds();
        if (released > 0) {
            LOGGER.info("FLEET_HOLDS_RELEASED count={}", released);
        }
        List<UUID> trips = jdbc.queryForList("SELECT id FROM fleet_schema.trip WHERE pay_finalized_at IS NOT NULL AND pay_credited_at IS NULL "
            + "ORDER BY pay_finalized_at LIMIT 50", UUID.class);
        List<UUID> slots = jdbc.queryForList("SELECT slot_id FROM fleet_schema.rider_slot_settlement WHERE credited_at IS NULL "
            + "ORDER BY computed_at LIMIT 50", UUID.class);
        if (!ledgerOn) {
            if (!trips.isEmpty() || !slots.isEmpty()) {
                LOGGER.warn("CRAVES_ALERT alert=FLEET_CREDITS_WAITING trips={} slots={} (CRAVES_LEDGER_POSTING_ENABLED is off)",
                    trips.size(), slots.size());
            }
            return;
        }
        trips.forEach(trip -> safely("trip", trip, () -> creditTrip(trip)));
        slots.forEach(slot -> safely("slot", slot, () -> creditSlot(slot)));
    }

    /** Credits one finished trip's final pay once: its rows and journals, TDS, and the automatic hold. False when done already. */
    public boolean creditTrip(UUID tripId) {
        return Boolean.TRUE.equals(fresh.execute(status -> {
            List<Map<String, Object>> found = jdbc.queryForList("SELECT rider_id, chef_sub_order_id, rate_card_version, "
                + "final_pay_lines::text AS lines, pay_held, hold_reason, pay_finalized_at FROM fleet_schema.trip "
                + "WHERE id = ? AND pay_finalized_at IS NOT NULL AND pay_credited_at IS NULL FOR UPDATE", tripId);
            if (found.isEmpty()) {
                return false;
            }
            Map<String, Object> trip = found.get(0);
            UUID rider = (UUID) trip.get("rider_id");
            lockRider(rider);
            Source source = new Source(tripId, null, (UUID) trip.get("chef_sub_order_id"), (String) trip.get("rate_card_version"));
            Timestamp finalized = (Timestamp) trip.get("pay_finalized_at");
            Instant withdrawable = finalized.toInstant().plus(PENDING);
            long gross = 0;
            for (PayLine line : lines((String) trip.get("lines"))) {
                if (line.amountPaise() > 0) {
                    earn(rider, source, line.component(), 1, line.amountPaise(), line.label(), null, withdrawable, finalized.toInstant(), null);
                    gross += line.amountPaise();
                }
            }
            withhold(rider, source, 1, gross, withdrawable, finalized.toInstant(), null);
            if (Boolean.TRUE.equals(trip.get("pay_held"))) {
                String reason = trip.get("hold_reason") == null ? "Ops checks this trip before paying it." : (String) trip.get("hold_reason");
                // Up to 7 days from the trip's end, never before today (a credit that waited that long releases at once).
                jdbc.update("INSERT INTO fleet_schema.rider_pay_hold (id, trip_id, rider_id, reason, release_on, created_by_name) "
                    + "VALUES (?, ?, ?, ?, GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date, "
                    + "(CAST(? AS timestamptz) AT TIME ZONE 'Asia/Kolkata')::date + " + MAX_HOLD_DAYS + "), ?) ON CONFLICT (trip_id) DO NOTHING",
                    UUID.randomUUID(), tripId, rider, reason, finalized, AUTOMATIC);
            }
            jdbc.update("UPDATE fleet_schema.trip SET pay_credited_at = now() WHERE id = ?", tripId);
            if (engineFeed != null) {
                // The day's pay for fair turns counts credited rows: read the rider again once these are committed.
                engineFeed.refresh(rider);
            }
            return true;
        }));
    }

    /** Credits one settled slot's top-up once (a zero top-up is only marked). False when done already. */
    public boolean creditSlot(UUID slotId) {
        return Boolean.TRUE.equals(fresh.execute(status -> {
            List<Map<String, Object>> found = jdbc.queryForList("SELECT rider_id, top_up_paise, computed_at FROM fleet_schema.rider_slot_settlement "
                + "WHERE slot_id = ? AND credited_at IS NULL FOR UPDATE", slotId);
            if (found.isEmpty()) {
                return false;
            }
            UUID rider = (UUID) found.get(0).get("rider_id");
            long topUp = ((Number) found.get(0).get("top_up_paise")).longValue();
            Instant computed = ((Timestamp) found.get(0).get("computed_at")).toInstant();
            if (topUp > 0) {
                lockRider(rider);
                Source source = new Source(null, slotId, null, null);
                earn(rider, source, "slot-top-up", 1, topUp, "Slot guarantee top-up", null, computed.plus(PENDING), computed, null);
                withhold(rider, source, 1, topUp, computed.plus(PENDING), computed, null);
            }
            jdbc.update("UPDATE fleet_schema.rider_slot_settlement SET credited_at = now() WHERE slot_id = ?", slotId);
            return true;
        }));
    }

    /**
     * A signed correction to one pay component of a credited trip (admin-fleet-v1 POST /trips/{tripId}/pay-adjustments), as
     * its next revision (2 or later) with the reason the rider sees. A negative amount is debt, recovered only from future
     * pay at the weekly cap; a positive one is pay like any other, pending 24 hours, with TDS withheld. At most
     * MAX_ADJUSTMENT_PAISE either way. Audited and idempotent; 409 TRIP_NOT_CREDITED before the trip's pay is credited.
     */
    @Transactional
    public Object adjustTrip(Admin by, UUID key, UUID tripId, AdjustmentInput input) {
        String text = FleetAdminService.reason(input == null ? null : input.reason());
        String component = input.component();
        long amountPaise = input.amountPaise() == null ? 0 : input.amountPaise();
        if (component == null || !component.matches("^[a-z][a-z0-9-]{1,31}$") || "tds".equals(component) || amountPaise == 0
            || Math.abs(amountPaise) > MAX_ADJUSTMENT_PAISE) {
            throw FleetApiException.invalid("Choose a pay component other than tds and an amount other than zero, at most ₹10,000 either way.");
        }
        return admin.once(by, key, "PAY_ADJUSTED", tripId + "\n" + component + "\n" + amountPaise + "\n" + text, () -> {
            Map<String, Object> trip = jdbc.queryForList("SELECT rider_id, chef_sub_order_id, rate_card_version, order_code, pay_credited_at "
                    + "FROM fleet_schema.trip WHERE id = ? AND rider_id IS NOT NULL FOR UPDATE", tripId).stream().findFirst()
                .orElseThrow(() -> FleetApiException.notFound("TRIP_NOT_FOUND", "No rider trip with this id."));
            if (trip.get("pay_credited_at") == null) {
                throw FleetApiException.conflict("TRIP_NOT_CREDITED", "This trip's pay isn't credited yet. Adjust it once it is, or hold it.");
            }
            UUID rider = (UUID) trip.get("rider_id");
            lockRider(rider);
            Source source = new Source(tripId, null, (UUID) trip.get("chef_sub_order_id"), (String) trip.get("rate_card_version"));
            Instant now = Instant.now();
            Instant withdrawable = amountPaise > 0 ? now.plus(PENDING) : now;
            int revision = nextRevision(tripId, component, 2);
            earn(rider, source, component, revision, amountPaise, cut("Adjustment: " + text, 160), text, withdrawable, now, by);
            if (amountPaise > 0) {
                withhold(rider, source, nextRevision(tripId, "tds", 1), amountPaise, withdrawable, now, by);
            }
            return new Done(new Adjustment(tripId, (String) trip.get("order_code"), rider, component, revision, amountPaise, text), rider,
                tripId.toString(), "Adjusted " + component + " of trip " + trip.get("order_code") + " by " + amountPaise + " paise: " + text);
        });
    }

    // ---- Holds (admin-fleet-v1 /holds) ----

    @Transactional(readOnly = true)
    public HoldPage holds(String state) {
        if (!Set.of("ACTIVE", "RELEASED").contains(state)) {
            throw FleetApiException.invalid("Choose ACTIVE or RELEASED.");
        }
        return new HoldPage(jdbc.query(HOLD + "WHERE h.state = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 500", (row, n) -> hold(row), state));
    }

    /**
     * Holds one trip's pay only, until releaseOn (today to 7 days ahead, IST) at the latest. One hold per trip ever, and
     * never on pay that was already withdrawable when a payout or withdrawal was made.
     */
    @Transactional
    public Object placeHold(Admin by, UUID key, HoldInput input) {
        if (input == null || input.tripId() == null || input.releaseOn() == null) {
            throw FleetApiException.invalid("Choose the trip, a reason and the release date.");
        }
        String reason = FleetAdminService.reason(input.reason());
        LocalDate today = jdbc.queryForObject("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date", LocalDate.class);
        if (input.releaseOn().isBefore(today) || input.releaseOn().isAfter(today.plusDays(MAX_HOLD_DAYS))) {
            throw FleetApiException.unprocessable("RELEASE_DATE_OUT_OF_RANGE", "A hold ends today or within the next 7 days.");
        }
        return admin.once(by, key, "PAY_HOLD_PLACED", input.tripId() + "\n" + reason + "\n" + input.releaseOn(), () -> {
            Map<String, Object> trip = jdbc.queryForList("SELECT rider_id, order_code, pay_finalized_at FROM fleet_schema.trip "
                    + "WHERE id = ? AND rider_id IS NOT NULL FOR UPDATE", input.tripId()).stream().findFirst()
                .orElseThrow(() -> FleetApiException.notFound("TRIP_NOT_FOUND", "No rider trip with this id."));
            UUID rider = (UUID) trip.get("rider_id");
            lockRider(rider);
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_pay_hold WHERE trip_id = ?)",
                Boolean.class, input.tripId()))) {
                throw FleetApiException.conflict("HOLD_EXISTS", "This trip's pay was held once already; a hold lasts at most 7 days.");
            }
            if (trip.get("pay_finalized_at") != null && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM "
                + "fleet_schema.rider_payout_instruction WHERE rider_id = ? AND state <> 'FAILED' AND created_at >= CAST(? AS timestamptz) + "
                + "interval '24 hours')", Boolean.class, rider, trip.get("pay_finalized_at")))) {
                throw FleetApiException.conflict("EARNING_ALREADY_PAID", "This trip's pay was already withdrawable when the rider was paid.");
            }
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO fleet_schema.rider_pay_hold (id, trip_id, rider_id, reason, release_on, created_by, created_by_name) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?)", id, input.tripId(), rider, reason, input.releaseOn(), by.id(), by.name());
            return new Done(hold(id), rider, id.toString(), "Held the pay for order " + trip.get("order_code") + " until "
                + input.releaseOn() + ": " + reason);
        });
    }

    @Transactional
    public Object releaseHold(Admin by, UUID key, UUID holdId) {
        return admin.once(by, key, "PAY_HOLD_RELEASED", holdId.toString(), () -> {
            UUID rider = jdbc.queryForList("UPDATE fleet_schema.rider_pay_hold SET state = 'RELEASED', released_by = ?, released_by_name = ?, "
                    + "released_at = now() WHERE id = ? AND state = 'ACTIVE' RETURNING rider_id", UUID.class, by.id(), by.name(), holdId)
                .stream().findFirst().orElseThrow(() -> Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM "
                    + "fleet_schema.rider_pay_hold WHERE id = ?)", Boolean.class, holdId))
                    ? FleetApiException.conflict("HOLD_NOT_ACTIVE", "This hold was already released.")
                    : FleetApiException.notFound("HOLD_NOT_FOUND", "No such hold."));
            return new Done(hold(holdId), rider, holdId.toString(), "Released the hold; the trip's pay becomes withdrawable.");
        });
    }

    /** Releases every active hold whose release date (IST) has come; released_by stays null for these. */
    int releaseDueHolds() {
        return jdbc.update("UPDATE fleet_schema.rider_pay_hold SET state = 'RELEASED', released_at = now() WHERE state = 'ACTIVE' "
            + "AND release_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date");
    }

    // ---- The rider's earnings (rider-v1 /earnings) ----

    /** Trips with credited pay today or this week (Monday to Sunday, IST), newest first, PAGE at a time; the total covers the range. */
    @Transactional(readOnly = true)
    public EarningsPage earnings(UUID riderId, String range, String cursor) {
        Window window = window(range, Instant.now());
        StringBuilder where = new StringBuilder("WHERE t.rider_id = ? AND t.pay_credited_at IS NOT NULL AND t.pay_finalized_at >= ? "
            + "AND t.pay_finalized_at < ?");
        List<Object> args = new ArrayList<>(List.of(riderId, Timestamp.from(window.from()), Timestamp.from(window.to())));
        Cursor after = Cursor.parse(cursor);
        if (after != null) {
            where.append(" AND (t.pay_finalized_at, t.id) < (?, ?)");
            args.add(Timestamp.from(after.at()));
            args.add(after.id());
        }
        List<TripEarning> trips = tripEarnings(where + " ORDER BY t.pay_finalized_at DESC, t.id DESC LIMIT " + (PAGE + 1), args.toArray());
        String next = null;
        if (trips.size() > PAGE) {
            trips = trips.subList(0, PAGE);
            TripEarning last = trips.get(PAGE - 1);
            next = new Cursor(last.completedAt(), UUID.fromString(last.tripId())).encode();
        }
        long total = jdbc.queryForObject(RANGE_TOTAL_SQL, (row, n) -> row.getLong("paise"), riderId, Timestamp.from(window.from()),
            Timestamp.from(window.to()));
        return new EarningsPage("today".equals(range) ? "Today" : "This week (Mon–Sun)", total, trips, next);
    }

    @Transactional(readOnly = true)
    public TripEarning tripEarning(UUID riderId, UUID tripId) {
        return tripEarnings("WHERE t.id = ? AND t.rider_id = ? AND t.pay_credited_at IS NOT NULL", tripId, riderId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.notFound("TRIP_NOT_FOUND", "We could not find pay for that trip."));
    }

    /** today: the IST day; week: Monday 00:00 to the next Monday 00:00, IST. */
    public static Window window(String range, Instant now) {
        LocalDate today = now.atZone(IST).toLocalDate();
        LocalDate from = switch (range == null ? "" : range) {
            case "today" -> today;
            case "week" -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            default -> throw FleetApiException.invalid("Choose today or week.");
        };
        LocalDate to = "today".equals(range) ? from.plusDays(1) : from.plusDays(7);
        return new Window(from.atStartOfDay(IST).toInstant(), to.atStartOfDay(IST).toInstant());
    }

    /** TDS on a credit: what the rider's financial-year gross owes at the rate, less what was withheld already, at most the credit. */
    static long tdsDue(long yearGrossPaise, long yearWithheldPaise, long creditGrossPaise, int rateBasisPoints, long annualThresholdPaise) {
        if (yearGrossPaise <= annualThresholdPaise) {
            return 0;
        }
        long due = Math.multiplyExact(yearGrossPaise, (long) rateBasisPoints) / 10_000;
        return Math.max(0, Math.min(creditGrossPaise, due - yearWithheldPaise));
    }

    private List<TripEarning> tripEarnings(String where, Object... args) {
        List<Map<String, Object>> trips = jdbc.queryForList(TRIP + where, args);
        if (trips.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        trips.forEach(trip -> rows.put((UUID) trip.get("id"), new ArrayList<>()));
        jdbc.queryForList("SELECT trip_id, label, net_paise, reason FROM fleet_schema.rider_earning WHERE trip_id IN ("
            + String.join(", ", Collections.nCopies(rows.size(), "?")) + ") ORDER BY revision, component = 'tds', "
            + "array_position(ARRAY['base', 'drop-km', 'pickup-km', 'waiting', 'cancellation', 'return-km'], component::text), component",
            rows.keySet().toArray()).forEach(row -> rows.get((UUID) row.get("trip_id")).add(row));
        List<TripEarning> result = new ArrayList<>();
        for (Map<String, Object> trip : trips) {
            List<Map<String, Object>> lines = rows.get((UUID) trip.get("id"));
            String status = trip.get("hold_reason") != null || trip.get("disputed_at") != null ? "HELD"
                : lines.stream().anyMatch(line -> line.get("reason") != null) ? "ADJUSTED" : "CREDITED";
            String holdReason = trip.get("hold_reason") != null ? (String) trip.get("hold_reason")
                : trip.get("disputed_at") != null ? DISPUTE_REASON : null;
            Instant releaseOn = trip.get("release_on") != null
                ? ((java.sql.Date) trip.get("release_on")).toLocalDate().atStartOfDay(IST).toInstant()
                : trip.get("disputed_at") != null ? ((Timestamp) trip.get("disputed_at")).toInstant().plus(Duration.ofDays(MAX_HOLD_DAYS)) : null;
            result.add(new TripEarning(trip.get("id").toString(), ((Timestamp) trip.get("pay_finalized_at")).toInstant(),
                (String) trip.get("kitchen_area"), (String) trip.get("drop_area"), status, holdReason, releaseOn,
                lines.stream().mapToLong(line -> ((Number) line.get("net_paise")).longValue()).sum(),
                lines.stream().map(line -> new Line((String) line.get("label"), ((Number) line.get("net_paise")).longValue())).toList(),
                number(trip.get("pickup_distance_m")), number(trip.get("drop_distance_m")), (String) trip.get("rate_card_version")));
        }
        return result;
    }

    /** One rider_earning row and its journal under the same key. by is null for the service's own credits. */
    private void earn(UUID rider, Source source, String component, int revision, long netPaise, String label, String reason,
                      Instant withdrawableAt, Instant occurredAt, Admin by) {
        boolean tax = "tds".equals(component);
        long gross = tax ? 0 : netPaise;
        long withheld = tax ? -netPaise : 0;
        String key = source.key(component, revision);
        jdbc.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, slot_id, component, revision, business_key, gross_paise, "
            + "withheld_paise, net_paise, rate_card_version, withdrawable_at, label, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(), rider, source.tripId(), source.slotId(), component, revision, key, gross, withheld, netPaise,
            source.rateCardVersion(), Timestamp.from(withdrawableAt), label, reason);
        BigDecimal amount = BigDecimal.valueOf(Math.abs(netPaise), 2);
        // Owed to the rider: delivery cost into RIDER_PAYABLE. Taken back (debt, or TDS to its own liability): the reverse.
        String other = tax ? "RIDER_TDS_PAYABLE" : "DELIVERY_EXPENSE";
        List<LedgerJournal.Line> lines = netPaise > 0
            ? List.of(line(other, amount, true, source), line("RIDER_PAYABLE", amount, false, source))
            : List.of(line("RIDER_PAYABLE", amount, true, source), line(other, amount, false, source));
        String type = tax ? "RIDER_TDS_WITHHELD" : reason != null ? "RIDER_PAY_ADJUSTED" : source.slotId() != null ? "RIDER_SLOT_TOP_UP"
            : "RIDER_TRIP_PAY";
        var receipt = ledger.post(new Entry(key, UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)), "craves-fleet", type, null,
            source.chefOrderId(), "INR", occurredAt, source.evidence(), null, by == null ? "SERVICE" : "HUMAN",
            by == null ? "fleet-earnings" : by.id().toString(), lines));
        if (receipt.outcome() == LedgerJournal.Outcome.CONFLICT) {
            throw new IllegalStateException("FLEET_LEDGER_CONFLICT " + key);
        }
    }

    /** TDS on a credit of grossPaise as its own row, when TDS is on: against the rider's financial-year total. */
    private void withhold(UUID rider, Source source, int revision, long grossPaise, Instant withdrawableAt, Instant occurredAt, Admin by) {
        if (!tds.enabled() || grossPaise <= 0) {
            return;
        }
        if (tds.section() == null || tds.section().isBlank() || tds.rateBasisPoints() < 1 || tds.rateBasisPoints() > 10_000) {
            throw new IllegalStateException("FLEET_TDS_MISCONFIGURED: set CRAVES_FLEET_TDS_SECTION and a rate of 1 to 10000 basis points");
        }
        // This credit's rows are already in the sum: it is the year's gross including them.
        Map<String, Object> year = jdbc.queryForMap("SELECT COALESCE(SUM(gross_paise) FILTER (WHERE component <> 'tds'), 0) AS gross, "
            + "COALESCE(SUM(withheld_paise) FILTER (WHERE component = 'tds'), 0) AS withheld FROM fleet_schema.rider_earning "
            + "WHERE rider_id = ? AND created_at >= " + FINANCIAL_YEAR_START, rider);
        long amount = tdsDue(((Number) year.get("gross")).longValue(), ((Number) year.get("withheld")).longValue(), grossPaise,
            tds.rateBasisPoints(), tds.annualThresholdPaise());
        if (amount > 0) {
            earn(rider, source, "tds", revision, -amount, cut("TDS (section " + tds.section().trim() + ", "
                + BigDecimal.valueOf(tds.rateBasisPoints(), 2).stripTrailingZeros().toPlainString() + "%)", 160), null, withdrawableAt,
                occurredAt, by);
        }
    }

    private int nextRevision(UUID tripId, String component, int first) {
        return jdbc.queryForObject("SELECT GREATEST(?, COALESCE(MAX(revision), 0) + 1) FROM fleet_schema.rider_earning WHERE trip_id = ? "
            + "AND component = ?", Integer.class, first, tripId, component);
    }

    /** Serialises one rider's credits, withdrawals and payouts (FOR NO KEY UPDATE lets FK inserts of other work through). */
    void lockRider(UUID riderId) {
        jdbc.queryForList("SELECT id FROM fleet_schema.rider WHERE id = ? FOR NO KEY UPDATE", riderId);
    }

    private void safely(String kind, UUID id, Supplier<Boolean> credit) {
        if (!ledgerOn) {
            LOGGER.warn("FLEET_CREDIT_WAITING {}={} (CRAVES_LEDGER_POSTING_ENABLED is off; the money job credits it once it is on)", kind, id);
            return;
        }
        try {
            credit.get();
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_CREDIT_FAILED {}={} (the money job retries every minute): {}", kind, id,
                exception.getMessage());
        }
    }

    private List<PayLine> lines(String text) {
        try {
            return text == null ? List.of() : json.readValue(text, LINES);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Trip pay lines are unreadable", exception);
        }
    }

    private static LedgerJournal.Line line(String account, BigDecimal amount, boolean debit, Source source) {
        String money = LedgerMoney.text(amount);
        return new LedgerJournal.Line(account, "INR", debit ? money : "0.00", debit ? "0.00" : money, null, source.tripId(), PROVIDER,
            null, null, null);
    }

    private static Hold hold(ResultSet row) throws SQLException {
        return new Hold(row.getObject("id", UUID.class), row.getObject("trip_id", UUID.class), row.getString("order_code"),
            row.getObject("rider_id", UUID.class), row.getString("name"), row.getLong("amount"), row.getString("reason"),
            row.getObject("release_on", LocalDate.class), row.getString("state"), row.getString("created_by_name"),
            at(row, "created_at"), row.getString("released_by_name"), at(row, "released_at"));
    }

    private Hold hold(UUID holdId) {
        return jdbc.queryForObject(HOLD + "WHERE h.id = ?", (row, n) -> hold(row), holdId);
    }

    private static Instant at(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static String cut(String text, int max) {
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static int number(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    public record Window(Instant from, Instant to) {
    }

    /** CRAVES_FLEET_TDS_*: the section and rate come from the CA's opinion; off by default. */
    record Tds(boolean enabled, String section, int rateBasisPoints, long annualThresholdPaise) {
    }

    /** What a row is pay for: a trip (with its order and locked rate card) or a slot. */
    record Source(UUID tripId, UUID slotId, UUID chefOrderId, String rateCardVersion) {
        String key(String component, int revision) {
            return (tripId != null ? "fleet-trip-pay/" + tripId : "fleet-slot-pay/" + slotId) + "/" + component + "/" + revision;
        }

        String evidence() {
            return tripId != null ? "fleet-trip/" + tripId : "fleet-slot/" + slotId;
        }
    }
}
