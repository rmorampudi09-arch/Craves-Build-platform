package in.craves.integration.fleet.slots;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.pay.FleetPay;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
 * Rider-booked peak slots (app 1.3.3, docs/riders/REDESIGN.md R-07).
 *
 * <p>Clusters: every morning, the last 14 days of recorded orders (delivery_command, by kitchen) go on a 0.01° grid;
 * cells with at least 2 orders an hour at lunch (11 to 15) or dinner (19 to 23) are joined with their touching cells into
 * a cluster with a 1500 m zone around its centre. A cluster keeps its id while its centre moves under 500 m.
 *
 * <p>Capacity: Monday 06:00 IST plans the coming week: for each cluster, each day, lunch 11:30 to 14:30 and dinner 19:00
 * to 21:30, places = ceil(expected orders an hour / 1.4) and a rate of ₹90 an hour kept within the rate card's declared
 * range and ₹60 to ₹150. Riders see a capacity once ops approved it.
 *
 * <p>Booking: riders who completed a slot in the last 14 days book from Thursday 10:00 IST, everyone from Friday 10:00.
 * At most 6 booked hours a day, no overlapping slot, one place each; a full capacity takes a standby, promoted in order
 * when a place frees. A booking is a fleet_schema.rider_slot row, so the heartbeat, FleetSlotService.settleDue and the
 * money phase pay the guarantee as they do for an ops slot. A rider with no shift 15 minutes into a slot is a no-show
 * (no guarantee); two no-shows in 14 days mean the Friday wave only for the next 14 days.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSlotBookingService {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final double CELL_DEGREES = 0.01;
    static final double MIN_ORDERS_PER_HOUR = 2.0;
    static final int ZONE_RADIUS_M = 1500;
    static final int DRIFT_M = 500;
    static final double PLACES_PER_ORDER_HOUR = 1.4;
    static final long RATE_PAISE = 9000;
    static final long RATE_MIN_PAISE = 6000;
    static final long RATE_MAX_PAISE = 15000;
    static final int MAX_HOURS_PER_DAY = 6;
    static final int LOOKBACK_DAYS = 14;
    static final int NO_SHOW_GRACE_MINUTES = 15;
    static final int NO_SHOW_LIMIT = 2;
    static final LocalTime WAVE_TIME = LocalTime.of(10, 0);
    /** Orders counted in these IST hours (4 h each) decide the clusters; the slots riders book are inside them. */
    static final int LUNCH_FROM = 11;
    static final int LUNCH_TO = 15;
    static final int DINNER_FROM = 19;
    static final int DINNER_TO = 23;
    static final Window LUNCH = new Window("LUNCH", LocalTime.of(11, 30), LocalTime.of(14, 30));
    static final Window DINNER = new Window("DINNER", LocalTime.of(19, 0), LocalTime.of(21, 30));
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetSlotBookingService.class);
    private static final double EARTH_M = 6_371_000;
    private static final String CAPACITY = """
        SELECT c.id, c.cluster_id, k.name AS cluster_name, k.centre_lat, k.centre_lng, k.radius_m, c.starts_at, c.ends_at, c.places,
               c.rate_per_hour_paise, c.expected_orders_per_hour, c.approved_at,
               (SELECT count(*) FROM fleet_schema.slot_booking b WHERE b.capacity_id = c.id AND b.status = 'BOOKED') AS booked,
               (SELECT count(*) FROM fleet_schema.slot_standby s WHERE s.capacity_id = c.id AND s.promoted_booking_id IS NULL) AS standby
        FROM fleet_schema.slot_capacity c JOIN fleet_schema.slot_cluster k ON k.id = c.cluster_id
        """;

    private final JdbcTemplate jdbc;
    private final FleetPolicyStore policies;
    private final FleetAdminService admin;
    private final TransactionTemplate transaction;

    public FleetSlotBookingService(JdbcTemplate jdbc, FleetPolicyStore policies, FleetAdminService admin,
                                   PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.admin = admin;
        this.transaction = new TransactionTemplate(transactions);
    }

    // ---- clusters -------------------------------------------------------------------------------------------------

    @Scheduled(cron = "0 30 5 * * *", zone = "Asia/Kolkata", scheduler = FleetConfiguration.FLEET_SCHEDULER)
    public void rebuildClustersDaily() {
        try {
            Integer clusters = transaction.execute(status -> rebuildClusters(Instant.now()));
            LOGGER.info("FLEET_SLOT_CLUSTERS clusters={}", clusters);
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_SLOT_CLUSTERS failed: {}", exception.toString());
        }
    }

    /** Rebuilds the clusters from the orders of the last 14 days before now; returns how many are active. */
    @Transactional
    public int rebuildClusters(Instant now) {
        List<OrderPoint> orders = jdbc.query("""
            SELECT c.dispatch_at,
                   (c.payload->'deliveryRequest'->'pickup'->>'latitude')::float8 AS lat,
                   (c.payload->'deliveryRequest'->'pickup'->>'longitude')::float8 AS lng,
                   COALESCE(c.payload->'deliveryRequest'->'pickup'->>'area', c.payload->>'area') AS area
            FROM delivery_schema.delivery_command c
            WHERE c.command_type = 'QUOTE_AND_CREATE' AND c.dispatch_at >= ? AND c.dispatch_at < ?""",
            (row, n) -> row.getObject("lat") == null || row.getObject("lng") == null ? null
                : new OrderPoint(row.getTimestamp("dispatch_at").toInstant(), row.getDouble("lat"), row.getDouble("lng"), row.getString("area")),
            Timestamp.from(now.minus(LOOKBACK_DAYS, ChronoUnit.DAYS)), Timestamp.from(now));
        List<Cluster> found = clusters(orders.stream().filter(Objects::nonNull).toList(), LOOKBACK_DAYS);
        List<Map<String, Object>> existing = jdbc.queryForList("SELECT id, n, name, centre_lat, centre_lng FROM fleet_schema.slot_cluster "
            + "WHERE active ORDER BY n");
        Set<UUID> matched = new HashSet<>();
        int next = jdbc.queryForObject("SELECT COALESCE(max(n), 0) FROM fleet_schema.slot_cluster", Integer.class) + 1;
        for (Cluster cluster : found) {
            Map<String, Object> nearest = existing.stream().filter(row -> !matched.contains((UUID) row.get("id")))
                .filter(row -> metres(cluster.lat(), cluster.lng(), (Double) row.get("centre_lat"), (Double) row.get("centre_lng")) <= DRIFT_M)
                .min(Comparator.comparingDouble(row -> metres(cluster.lat(), cluster.lng(), (Double) row.get("centre_lat"), (Double) row.get("centre_lng"))))
                .orElse(null);
            if (nearest != null) {
                UUID id = (UUID) nearest.get("id");
                matched.add(id);
                // The locality's name when the orders carry one; else the name the cluster already has.
                jdbc.update("UPDATE fleet_schema.slot_cluster SET name = ?, centre_lat = ?, centre_lng = ?, cells = CAST(? AS jsonb), "
                    + "lunch_orders_per_hour = ?, dinner_orders_per_hour = ?, updated_at = now() WHERE id = ?",
                    cluster.area() == null ? nearest.get("name") : cluster.area(), cluster.lat(), cluster.lng(), cluster.cellsJson(),
                    cluster.lunchPerHour(), cluster.dinnerPerHour(), id);
            } else {
                int n = next++;
                jdbc.update("INSERT INTO fleet_schema.slot_cluster (id, n, name, centre_lat, centre_lng, radius_m, cells, lunch_orders_per_hour, "
                    + "dinner_orders_per_hour) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?)", UUID.randomUUID(), n,
                    cluster.area() == null ? "Cluster " + n : cluster.area(), cluster.lat(), cluster.lng(), ZONE_RADIUS_M, cluster.cellsJson(),
                    cluster.lunchPerHour(), cluster.dinnerPerHour());
            }
        }
        for (Map<String, Object> row : existing) {
            if (!matched.contains((UUID) row.get("id"))) {
                jdbc.update("UPDATE fleet_schema.slot_cluster SET active = false, updated_at = now() WHERE id = ?", row.get("id"));
            }
        }
        return found.size();
    }

    /**
     * The clusters in a set of orders: 0.01° cells with at least MIN_ORDERS_PER_HOUR in either peak window over days days,
     * joined with the eligible cells they touch (8 neighbours). Pure, for the unit test.
     */
    static List<Cluster> clusters(List<OrderPoint> orders, int days) {
        Map<Cell, List<OrderPoint>> lunch = new HashMap<>();
        Map<Cell, List<OrderPoint>> dinner = new HashMap<>();
        for (OrderPoint order : orders) {
            int hour = order.at().atZone(IST).getHour();
            Cell cell = new Cell((int) Math.floor(order.lat() / CELL_DEGREES), (int) Math.floor(order.lng() / CELL_DEGREES));
            if (hour >= LUNCH_FROM && hour < LUNCH_TO) {
                lunch.computeIfAbsent(cell, key -> new ArrayList<>()).add(order);
            } else if (hour >= DINNER_FROM && hour < DINNER_TO) {
                dinner.computeIfAbsent(cell, key -> new ArrayList<>()).add(order);
            }
        }
        double windowHours = days * (double) (LUNCH_TO - LUNCH_FROM);
        Set<Cell> eligible = new HashSet<>();
        for (Cell cell : lunch.keySet()) {
            if (lunch.get(cell).size() / windowHours >= MIN_ORDERS_PER_HOUR) {
                eligible.add(cell);
            }
        }
        for (Cell cell : dinner.keySet()) {
            if (dinner.get(cell).size() / windowHours >= MIN_ORDERS_PER_HOUR) {
                eligible.add(cell);
            }
        }
        List<Cluster> result = new ArrayList<>();
        Set<Cell> seen = new HashSet<>();
        for (Cell start : eligible.stream().sorted(Comparator.comparingInt(Cell::row).thenComparingInt(Cell::col)).toList()) {
            if (!seen.add(start)) {
                continue;
            }
            List<Cell> group = new ArrayList<>();
            Deque<Cell> queue = new ArrayDeque<>(List.of(start));
            while (!queue.isEmpty()) {
                Cell cell = queue.poll();
                group.add(cell);
                for (int dr = -1; dr <= 1; dr++) {
                    for (int dc = -1; dc <= 1; dc++) {
                        Cell next = new Cell(cell.row() + dr, cell.col() + dc);
                        if (eligible.contains(next) && seen.add(next)) {
                            queue.add(next);
                        }
                    }
                }
            }
            List<OrderPoint> members = new ArrayList<>();
            int lunchCount = 0;
            int dinnerCount = 0;
            for (Cell cell : group) {
                List<OrderPoint> l = lunch.getOrDefault(cell, List.of());
                List<OrderPoint> d = dinner.getOrDefault(cell, List.of());
                members.addAll(l);
                members.addAll(d);
                lunchCount += l.size();
                dinnerCount += d.size();
            }
            double lat = members.stream().mapToDouble(OrderPoint::lat).average().orElse(0);
            double lng = members.stream().mapToDouble(OrderPoint::lng).average().orElse(0);
            Map<String, Long> areas = new LinkedHashMap<>();
            members.stream().map(OrderPoint::area).filter(area -> area != null && !area.isBlank()).forEach(area -> areas.merge(area.trim(), 1L, Long::sum));
            String area = areas.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);
            result.add(new Cluster(lat, lng, area, group.stream().sorted(Comparator.comparingInt(Cell::row).thenComparingInt(Cell::col)).toList(),
                round2(lunchCount / windowHours), round2(dinnerCount / windowHours)));
        }
        return result;
    }

    // ---- capacity -------------------------------------------------------------------------------------------------

    @Scheduled(cron = "0 0 6 * * MON", zone = "Asia/Kolkata", scheduler = FleetConfiguration.FLEET_SCHEDULER)
    public void planComingWeek() {
        try {
            Integer planned = transaction.execute(status -> planWeek(LocalDate.now(IST)));
            LOGGER.info("FLEET_SLOT_CAPACITY planned={}", planned);
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_SLOT_CAPACITY failed: {}", exception.toString());
        }
    }

    /** Plans the week after today's (Monday to Sunday) for every active cluster; returns how many windows were new. */
    @Transactional
    public int planWeek(LocalDate today) {
        LocalDate monday = today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        long rate = rate();
        int planned = 0;
        for (Map<String, Object> cluster : jdbc.queryForList("SELECT id, lunch_orders_per_hour, dinner_orders_per_hour FROM fleet_schema.slot_cluster "
            + "WHERE active ORDER BY n")) {
            for (int day = 0; day < 7; day++) {
                LocalDate date = monday.plusDays(day);
                for (Window window : List.of(LUNCH, DINNER)) {
                    double expected = ((BigDecimal) cluster.get(window == LUNCH ? "lunch_orders_per_hour" : "dinner_orders_per_hour")).doubleValue();
                    planned += jdbc.update("INSERT INTO fleet_schema.slot_capacity (id, cluster_id, starts_at, ends_at, places, rate_per_hour_paise, "
                        + "expected_orders_per_hour) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (cluster_id, starts_at) DO NOTHING",
                        UUID.randomUUID(), cluster.get("id"), Timestamp.from(window.start(date)), Timestamp.from(window.end(date)), places(expected),
                        rate, round2(expected));
                }
            }
        }
        return planned;
    }

    /** ceil(expected orders an hour / 1.4): one rider carries about 1.4 orders an hour at peak. */
    static int places(double expectedOrdersPerHour) {
        return (int) Math.ceil(expectedOrdersPerHour / PLACES_PER_ORDER_HOUR);
    }

    /** ₹90 an hour, kept inside the rate card's declared slot guarantee range and ₹60 to ₹150. */
    long rate() {
        List<Long> range = policies.currentRateCard().map(card -> card.ranges().get("slot_guarantee_per_hour_paise")).orElse(null);
        return rate(range);
    }

    static long rate(List<Long> declared) {
        long low = RATE_MIN_PAISE;
        long high = RATE_MAX_PAISE;
        if (declared != null && declared.size() == 2) {
            low = Math.max(low, declared.get(0));
            high = Math.min(high, declared.get(1));
        }
        if (low > high) {
            // The card's range sits outside ₹60 to ₹150: the card wins, the slots stay inside what riders were shown.
            return declared.get(0) > RATE_MAX_PAISE ? declared.get(0) : declared.get(1);
        }
        return Math.max(low, Math.min(high, RATE_PAISE));
    }

    // ---- waves -----------------------------------------------------------------------------------------------------

    /** Thursday 10:00 IST of the week before the slot's week for riders who completed a slot lately; Friday 10:00 for all. */
    static Instant waveOpens(Instant slotStartsAt, boolean experienced) {
        LocalDate monday = slotStartsAt.atZone(IST).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return monday.minusDays(experienced ? 4 : 3).atTime(WAVE_TIME).atZone(IST).toInstant();
    }

    boolean experienced(UUID riderId, Instant now) {
        Timestamp since = Timestamp.from(now.minus(LOOKBACK_DAYS, ChronoUnit.DAYS));
        int noShows = jdbc.queryForObject("SELECT count(*) FROM fleet_schema.slot_booking WHERE rider_id = ? AND status = 'NO_SHOW' "
            + "AND no_show_at >= ?", Integer.class, riderId, since);
        if (noShows >= NO_SHOW_LIMIT) {
            return false;
        }
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_slot WHERE rider_id = ? "
            + "AND status = 'COMPLETED' AND ends_at >= ?)", Boolean.class, riderId, since));
    }

    // ---- the rider's API -------------------------------------------------------------------------------------------

    /** The approved windows of the next 8 days with the places left and this rider's bookings, standbys and running slot. */
    @Transactional(readOnly = true)
    public SlotsPage list(UUID riderId, Instant now) {
        boolean experienced = experienced(riderId, now);
        List<Map<String, Object>> mine = jdbc.queryForList("SELECT capacity_id, id, status FROM fleet_schema.slot_booking WHERE rider_id = ? "
            + "AND status = 'BOOKED'", riderId);
        Map<UUID, UUID> bookings = new HashMap<>();
        mine.forEach(row -> bookings.put((UUID) row.get("capacity_id"), (UUID) row.get("id")));
        Set<UUID> standby = new HashSet<>(jdbc.queryForList("SELECT capacity_id FROM fleet_schema.slot_standby WHERE rider_id = ? "
            + "AND promoted_booking_id IS NULL", UUID.class, riderId));
        List<SlotOffer> offers = jdbc.query(CAPACITY + "WHERE c.approved_at IS NOT NULL AND c.ends_at > ? AND c.starts_at < ? "
            + "ORDER BY c.starts_at, k.n", (row, n) -> {
                Capacity capacity = capacity(row);
                UUID bookingId = bookings.get(capacity.capacityId());
                return new SlotOffer(capacity.capacityId(), capacity.clusterId(), capacity.clusterName(), capacity.startsAt(), capacity.endsAt(),
                    capacity.ratePerHourPaise(), capacity.places(), Math.max(0, capacity.places() - capacity.booked()),
                    waveOpens(capacity.startsAt(), experienced), bookingId, bookingId == null && standby.contains(capacity.capacityId()));
            }, Timestamp.from(now), Timestamp.from(now.plus(8, ChronoUnit.DAYS)));
        List<Cluster> clusters = jdbc.query("SELECT id, name, centre_lat, centre_lng, radius_m FROM fleet_schema.slot_cluster WHERE active ORDER BY n",
            (row, n) -> new Cluster(row.getObject("id", UUID.class), row.getString("name"), row.getDouble("centre_lat"), row.getDouble("centre_lng"),
                row.getInt("radius_m")));
        RunningSlot running = jdbc.query("""
            SELECT b.id, k.name, s.starts_at, s.ends_at, s.guaranteed_per_hour_paise, s.in_zone_seconds
            FROM fleet_schema.slot_booking b JOIN fleet_schema.rider_slot s ON s.id = b.rider_slot_id
            JOIN fleet_schema.slot_capacity c ON c.id = b.capacity_id JOIN fleet_schema.slot_cluster k ON k.id = c.cluster_id
            WHERE b.rider_id = ? AND b.status = 'BOOKED' AND s.status = 'BOOKED' AND s.starts_at <= ? AND s.ends_at > ?
            ORDER BY s.starts_at LIMIT 1""", (row, n) -> {
                long rate = row.getLong("guaranteed_per_hour_paise");
                int seconds = row.getInt("in_zone_seconds");
                return new RunningSlot(row.getObject("id", UUID.class), row.getString("name"), row.getTimestamp("starts_at").toInstant(),
                    row.getTimestamp("ends_at").toInstant(), rate, seconds / 60, FleetPay.slotGuarantee(rate, seconds));
            }, riderId, Timestamp.from(now), Timestamp.from(now)).stream().findFirst().orElse(null);
        return new SlotsPage(clusters, offers, running, MAX_HOURS_PER_DAY, experienced);
    }

    @Transactional
    public Booking book(UUID riderId, UUID capacityId, Instant now) {
        Capacity capacity = lockedCapacity(capacityId, riderId, now);
        if (capacity.booked() >= capacity.places()) {
            throw FleetApiException.conflict("SLOT_FULL", "This slot is full. Join the standby list and you get the next free place.");
        }
        Booking booking = bookInto(capacity, riderId, now);
        jdbc.update("DELETE FROM fleet_schema.slot_standby WHERE capacity_id = ? AND rider_id = ? AND promoted_booking_id IS NULL", capacityId, riderId);
        return booking;
    }

    /** Before the slot starts: the place frees and the first rider on standby who still fits gets it. */
    @Transactional
    public Booking cancel(UUID riderId, UUID bookingId, Instant now) {
        Map<String, Object> booking = jdbc.queryForList("SELECT b.capacity_id, b.rider_slot_id, b.status, s.starts_at FROM fleet_schema.slot_booking b "
            + "JOIN fleet_schema.rider_slot s ON s.id = b.rider_slot_id WHERE b.id = ? AND b.rider_id = ? FOR UPDATE OF b", bookingId, riderId)
            .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("BOOKING_NOT_FOUND", "No such booking."));
        if (!"BOOKED".equals(booking.get("status"))) {
            throw FleetApiException.conflict("BOOKING_NOT_BOOKED", "This booking is already cancelled or over.");
        }
        if (!((Timestamp) booking.get("starts_at")).toInstant().isAfter(now)) {
            throw FleetApiException.conflict("SLOT_STARTED", "The slot has started. Go online for it, or call ops to end it.");
        }
        jdbc.update("UPDATE fleet_schema.slot_booking SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?", Timestamp.from(now), bookingId);
        jdbc.update("UPDATE fleet_schema.rider_slot SET status = 'CANCELLED', cancelled_at = ?, cancelled_reason = 'Cancelled by the rider' "
            + "WHERE id = ? AND status = 'BOOKED'", Timestamp.from(now), booking.get("rider_slot_id"));
        promote((UUID) booking.get("capacity_id"), now);
        return read(bookingId);
    }

    @Transactional
    public Standby standby(UUID riderId, UUID capacityId, Instant now) {
        Capacity capacity = lockedCapacity(capacityId, riderId, now);
        if (capacity.booked() < capacity.places()) {
            throw FleetApiException.conflict("SLOT_HAS_PLACES", "This slot still has places: book it instead.");
        }
        jdbc.update("INSERT INTO fleet_schema.slot_standby (id, capacity_id, rider_id) VALUES (?, ?, ?) ON CONFLICT (capacity_id, rider_id) DO NOTHING",
            UUID.randomUUID(), capacityId, riderId);
        int position = jdbc.queryForObject("SELECT count(*) FROM fleet_schema.slot_standby WHERE capacity_id = ? AND promoted_booking_id IS NULL "
            + "AND created_at <= (SELECT created_at FROM fleet_schema.slot_standby WHERE capacity_id = ? AND rider_id = ?)", Integer.class,
            capacityId, capacityId, riderId);
        return new Standby(capacityId, position);
    }

    /** No shift 15 minutes into a booked slot: a no-show, with no guarantee; a slot the settlement completed completes its booking. */
    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.slot-no-show-interval-ms:300000}")
    public void markNoShowsNow() {
        try {
            transaction.execute(status -> markNoShows(Instant.now()));
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_SLOT_NO_SHOW failed: {}", exception.toString());
        }
    }

    @Transactional
    public int markNoShows(Instant now) {
        int marked = jdbc.update("""
            UPDATE fleet_schema.slot_booking b SET status = 'NO_SHOW', no_show_at = ?
            FROM fleet_schema.rider_slot s
            WHERE s.id = b.rider_slot_id AND b.status = 'BOOKED' AND s.status = 'BOOKED' AND s.starts_at <= ?
              AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_shift sh WHERE sh.rider_id = b.rider_id AND sh.started_at <= ?
                              AND (sh.ended_at IS NULL OR sh.ended_at >= s.starts_at))""",
            Timestamp.from(now), Timestamp.from(now.minus(NO_SHOW_GRACE_MINUTES, ChronoUnit.MINUTES)), Timestamp.from(now));
        if (marked > 0) {
            jdbc.update("UPDATE fleet_schema.rider_slot s SET status = 'CANCELLED', cancelled_at = ?, cancelled_reason = 'No-show' "
                + "FROM fleet_schema.slot_booking b WHERE b.rider_slot_id = s.id AND b.status = 'NO_SHOW' AND s.status = 'BOOKED'", Timestamp.from(now));
            LOGGER.info("FLEET_SLOT_NO_SHOW marked={}", marked);
        }
        jdbc.update("UPDATE fleet_schema.slot_booking b SET status = 'COMPLETED' FROM fleet_schema.rider_slot s "
            + "WHERE s.id = b.rider_slot_id AND b.status = 'BOOKED' AND s.status = 'COMPLETED'");
        return marked;
    }

    // ---- ops --------------------------------------------------------------------------------------------------------

    /** The windows starting on the IST dates from to to (at most 31 days), with bookings and standbys counted. */
    @Transactional(readOnly = true)
    public CapacityPage capacities(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 30) {
            throw FleetApiException.invalid("Choose up to 31 days, from before to.");
        }
        return new CapacityPage(jdbc.query(CAPACITY + "WHERE c.starts_at >= ? AND c.starts_at < ? ORDER BY c.starts_at, k.n LIMIT 1000",
            (row, n) -> capacity(row), Timestamp.from(from.atStartOfDay(IST).toInstant()), Timestamp.from(to.plusDays(1).atStartOfDay(IST).toInstant())));
    }

    @Transactional
    public Object approve(Admin by, UUID key, UUID capacityId) {
        return admin.once(by, key, "SLOT_CAPACITY_APPROVED", capacityId.toString(), () -> {
            if (jdbc.update("UPDATE fleet_schema.slot_capacity SET approved_at = now(), approved_by = ? WHERE id = ? AND approved_at IS NULL",
                by.id(), capacityId) == 0) {
                throw Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.slot_capacity WHERE id = ?)", Boolean.class,
                    capacityId))
                    ? FleetApiException.conflict("CAPACITY_APPROVED", "This window is already approved.")
                    : FleetApiException.notFound("CAPACITY_NOT_FOUND", "No such window.");
            }
            Capacity capacity = readCapacity(capacityId);
            return new Done(capacity, null, capacityId.toString(), "Approved " + capacity.clusterName() + " " + capacity.startsAt() + ": "
                + capacity.places() + " places at " + capacity.ratePerHourPaise() + " paise an hour.");
        });
    }

    /** Ops sets the places and the rate; the rate stays inside the rate card's declared range and ₹60 to ₹150. */
    @Transactional
    public Object adjust(Admin by, UUID key, UUID capacityId, CapacityInput input) {
        if (input == null || (input.places() == null && input.ratePerHourPaise() == null) || (input.places() != null && input.places() < 0)) {
            throw FleetApiException.invalid("Give the places (0 or more), the rate, or both.");
        }
        if (input.ratePerHourPaise() != null) {
            long rate = input.ratePerHourPaise();
            List<Long> declared = policies.currentRateCard().map(card -> card.ranges().get("slot_guarantee_per_hour_paise")).orElse(null);
            long low = Math.max(RATE_MIN_PAISE, declared == null || declared.size() != 2 ? RATE_MIN_PAISE : declared.get(0));
            long high = Math.min(RATE_MAX_PAISE, declared == null || declared.size() != 2 ? RATE_MAX_PAISE : declared.get(1));
            if (rate < low || rate > high) {
                throw FleetApiException.unprocessable("GUARANTEE_OUT_OF_RANGE", "The rate must be between " + low + " and " + high + " paise an hour.");
            }
        }
        return admin.once(by, key, "SLOT_CAPACITY_CHANGED", capacityId + "\n" + input.places() + "\n" + input.ratePerHourPaise(), () -> {
            if (jdbc.update("UPDATE fleet_schema.slot_capacity SET places = COALESCE(?, places), rate_per_hour_paise = COALESCE(?, rate_per_hour_paise) "
                + "WHERE id = ?", input.places(), input.ratePerHourPaise(), capacityId) == 0) {
                throw FleetApiException.notFound("CAPACITY_NOT_FOUND", "No such window.");
            }
            Capacity capacity = readCapacity(capacityId);
            return new Done(capacity, null, capacityId.toString(), "Set " + capacity.clusterName() + " " + capacity.startsAt() + " to "
                + capacity.places() + " places at " + capacity.ratePerHourPaise() + " paise an hour.");
        });
    }

    // ---- inside ---------------------------------------------------------------------------------------------------

    /** The capacity, row-locked, once it is approved, in the future and open to this rider's wave. */
    private Capacity lockedCapacity(UUID capacityId, UUID riderId, Instant now) {
        Capacity capacity = jdbc.query(CAPACITY + "WHERE c.id = ? FOR UPDATE OF c", (row, n) -> capacity(row), capacityId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.notFound("CAPACITY_NOT_FOUND", "No such slot."));
        if (capacity.approvedAt() == null) {
            throw FleetApiException.notFound("CAPACITY_NOT_FOUND", "No such slot.");
        }
        if (!capacity.startsAt().isAfter(now)) {
            throw FleetApiException.conflict("SLOT_STARTED", "This slot has already started.");
        }
        Instant opens = waveOpens(capacity.startsAt(), experienced(riderId, now));
        if (now.isBefore(opens)) {
            throw new FleetApiException(409, "SLOT_WAVE_NOT_OPEN", "Booking for this slot opens on " + opens.atZone(IST).toLocalDate()
                + " at " + WAVE_TIME + ".");
        }
        return capacity;
    }

    /** Books riderId into a capacity that has a place: the hours and overlap rules, then the rider_slot and the booking. */
    private Booking bookInto(Capacity capacity, UUID riderId, Instant now) {
        // The rider row lock serialises one rider's bookings, as FleetSlotService does for ops slots.
        if (jdbc.queryForList("SELECT 1 FROM fleet_schema.rider WHERE id = ? FOR UPDATE", riderId).isEmpty()) {
            throw FleetApiException.notFound("RIDER_NOT_FOUND", "No such rider.");
        }
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.slot_booking WHERE capacity_id = ? AND rider_id = ? "
            + "AND status = 'BOOKED')", Boolean.class, capacity.capacityId(), riderId))) {
            throw FleetApiException.conflict("SLOT_ALREADY_BOOKED", "You already have this slot.");
        }
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_slot WHERE rider_id = ? "
            + "AND status IN ('BOOKED', 'COMPLETED') AND starts_at < ? AND ends_at > ?)", Boolean.class, riderId,
            Timestamp.from(capacity.endsAt()), Timestamp.from(capacity.startsAt())))) {
            throw FleetApiException.conflict("SLOT_OVERLAP", "You already have a slot in this window.");
        }
        ZonedDateTime day = capacity.startsAt().atZone(IST).toLocalDate().atStartOfDay(IST);
        long bookedSeconds = jdbc.queryForObject("SELECT COALESCE(SUM(EXTRACT(EPOCH FROM s.ends_at - s.starts_at)), 0) FROM fleet_schema.rider_slot s "
            + "WHERE s.rider_id = ? AND s.status = 'BOOKED' AND s.starts_at >= ? AND s.starts_at < ?", Long.class, riderId,
            Timestamp.from(day.toInstant()), Timestamp.from(day.plusDays(1).toInstant()));
        long thisSeconds = Duration.between(capacity.startsAt(), capacity.endsAt()).toSeconds();
        if (bookedSeconds + thisSeconds > MAX_HOURS_PER_DAY * 3600L) {
            throw FleetApiException.conflict("SLOT_HOURS_LIMIT", "At most " + MAX_HOURS_PER_DAY + " booked hours a day.");
        }
        UUID slotId = UUID.randomUUID();
        jdbc.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise, zone_lat, zone_lng, "
            + "zone_radius_m) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", slotId, riderId, capacity.clusterName(), Timestamp.from(capacity.startsAt()),
            Timestamp.from(capacity.endsAt()), capacity.ratePerHourPaise(), capacity.centreLat(), capacity.centreLng(), capacity.radiusM());
        UUID bookingId = UUID.randomUUID();
        jdbc.update("INSERT INTO fleet_schema.slot_booking (id, capacity_id, rider_id, rider_slot_id, booked_at) VALUES (?, ?, ?, ?, ?)", bookingId,
            capacity.capacityId(), riderId, slotId, Timestamp.from(now));
        LOGGER.info("FLEET_SLOT_BOOKED booking={} capacity={} rider={}", bookingId, capacity.capacityId(), riderId);
        return read(bookingId);
    }

    /** The first riders on standby, in order, who still fit, until the places are taken. */
    private void promote(UUID capacityId, Instant now) {
        Capacity capacity = jdbc.query(CAPACITY + "WHERE c.id = ? FOR UPDATE OF c", (row, n) -> capacity(row), capacityId).stream().findFirst().orElseThrow();
        int free = capacity.places() - capacity.booked();
        for (Map<String, Object> waiting : jdbc.queryForList("SELECT id, rider_id FROM fleet_schema.slot_standby WHERE capacity_id = ? "
            + "AND promoted_booking_id IS NULL ORDER BY created_at", capacityId)) {
            if (free <= 0) {
                return;
            }
            try {
                Booking booking = bookInto(capacity, (UUID) waiting.get("rider_id"), now);
                jdbc.update("UPDATE fleet_schema.slot_standby SET promoted_booking_id = ? WHERE id = ?", booking.bookingId(), waiting.get("id"));
                free--;
            } catch (FleetApiException refused) {
                // This rider no longer fits (hours, an overlapping slot): the next one hears instead; their standby stays.
                LOGGER.info("FLEET_SLOT_STANDBY_SKIPPED capacity={} rider={} code={}", capacityId, waiting.get("rider_id"), refused.code());
            }
        }
    }

    private Booking read(UUID bookingId) {
        return jdbc.queryForObject("SELECT b.id, b.capacity_id, b.status, s.starts_at, s.ends_at, s.guaranteed_per_hour_paise, k.name "
            + "FROM fleet_schema.slot_booking b JOIN fleet_schema.rider_slot s ON s.id = b.rider_slot_id "
            + "JOIN fleet_schema.slot_capacity c ON c.id = b.capacity_id JOIN fleet_schema.slot_cluster k ON k.id = c.cluster_id WHERE b.id = ?",
            (row, n) -> new Booking(row.getObject("id", UUID.class), row.getObject("capacity_id", UUID.class), row.getString("status"),
                row.getString("name"), row.getTimestamp("starts_at").toInstant(), row.getTimestamp("ends_at").toInstant(),
                row.getLong("guaranteed_per_hour_paise")), bookingId);
    }

    private Capacity readCapacity(UUID capacityId) {
        return jdbc.queryForObject(CAPACITY + "WHERE c.id = ?", (row, n) -> capacity(row), capacityId);
    }

    private static Capacity capacity(ResultSet row) throws SQLException {
        Timestamp approved = row.getTimestamp("approved_at");
        return new Capacity(row.getObject("id", UUID.class), row.getObject("cluster_id", UUID.class), row.getString("cluster_name"),
            row.getDouble("centre_lat"), row.getDouble("centre_lng"), row.getInt("radius_m"), row.getTimestamp("starts_at").toInstant(),
            row.getTimestamp("ends_at").toInstant(), row.getInt("places"), row.getLong("rate_per_hour_paise"),
            row.getBigDecimal("expected_orders_per_hour").doubleValue(), approved == null ? null : approved.toInstant(), row.getInt("booked"),
            row.getInt("standby"));
    }

    static double metres(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static double round2(double value) {
        return Math.round(value * 100) / 100.0;
    }

    /** One recorded order's kitchen, dispatch time and area. */
    record OrderPoint(Instant at, double lat, double lng, String area) {
    }

    record Cell(int row, int col) {
    }

    /** A cluster as the grid finds it (before it has an id), or as stored (with one). */
    public record Cluster(UUID clusterId, String name, double lat, double lng, Integer radiusM, String area, List<Cell> cells, double lunchPerHour,
                          double dinnerPerHour) {
        Cluster(double lat, double lng, String area, List<Cell> cells, double lunchPerHour, double dinnerPerHour) {
            this(null, null, lat, lng, null, area, cells, lunchPerHour, dinnerPerHour);
        }

        Cluster(UUID clusterId, String name, double lat, double lng, int radiusM) {
            this(clusterId, name, lat, lng, radiusM, null, null, 0, 0);
        }

        String cellsJson() {
            StringBuilder out = new StringBuilder("[");
            for (int i = 0; i < cells.size(); i++) {
                out.append(i == 0 ? "" : ",").append('[').append(cells.get(i).row()).append(',').append(cells.get(i).col()).append(']');
            }
            return out.append(']').toString();
        }
    }

    record Window(String name, LocalTime from, LocalTime to) {
        Instant start(LocalDate date) {
            return date.atTime(from).atZone(IST).toInstant();
        }

        Instant end(LocalDate date) {
            return date.atTime(to).atZone(IST).toInstant();
        }
    }

    public record Capacity(UUID capacityId, UUID clusterId, String clusterName, double centreLat, double centreLng, int radiusM, Instant startsAt,
                           Instant endsAt, int places, long ratePerHourPaise, double expectedOrdersPerHour, Instant approvedAt, int booked, int standby) {
    }

    public record CapacityInput(Integer places, Long ratePerHourPaise) {
    }

    public record CapacityPage(List<Capacity> windows) {
    }

    /** opensAt is this rider's wave; bookingId when they hold a place; standby when they wait for one. */
    public record SlotOffer(UUID capacityId, UUID clusterId, String clusterName, Instant startsAt, Instant endsAt, long ratePerHourPaise, int places,
                            int placesLeft, Instant opensAt, UUID bookingId, boolean standby) {
    }

    /** The slot running now: minutes counted inside the zone so far and the guarantee those minutes cover. */
    public record RunningSlot(UUID bookingId, String clusterName, Instant startsAt, Instant endsAt, long ratePerHourPaise, int inZoneMinutes,
                              long coveredPaise) {
    }

    public record SlotsPage(List<Cluster> clusters, List<SlotOffer> slots, RunningSlot running, int maxHoursPerDay, boolean earlyWave) {
    }

    public record Booking(UUID bookingId, UUID capacityId, String status, String clusterName, Instant startsAt, Instant endsAt, long ratePerHourPaise) {
    }

    public record Standby(UUID capacityId, int position) {
    }
}
