package in.craves.integration.fleet.engine;

import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.engine.EngineStreams.Entry;
import in.craves.integration.fleet.engine.FleetEngineWire.Candidate;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchRequest;
import in.craves.integration.fleet.engine.FleetEngineWire.Fix;
import in.craves.integration.fleet.engine.FleetEngineWire.Policy;
import in.craves.integration.fleet.engine.FleetEngineWire.RiderEvent;
import in.craves.integration.fleet.engine.FleetEngineWire.Standing;
import in.craves.integration.fleet.engine.FleetEngineWire.State;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.rider.FleetShiftService;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Keeps the fleet engine's live rider state (services/fleet-engine; docs/riders/SCALE.md, "The feed") in step with Postgres,
 * which stays the system of record: the engine's copy is a cache it can lose and rebuild. With craves.fleet.engine.mode off
 * (the default) nothing here runs and Redis is never touched. Otherwise each change that matters to dispatch reaches the
 * engine as a rider event on its partition's stream, once its transaction has committed:
 * <ul>
 * <li>PING: a /locations call's fixes and the rider's state, from the statements that call runs anyway (FleetLocationService);</li>
 * <li>REFRESH: the rider read again (SNAPSHOT) after an offer, a decline, a trip's end, going online, a break, heading home
 * or a changed choice, and every rider on a shift every 5 minutes; OFFLINE instead once they have no working shift.</li>
 * </ul>
 * Dispatch's shadow requests go the same way. Callers only queue; one thread reads Postgres (one connection at a time) and
 * sends. The queue is bounded: when it is full an event is dropped and counted, never waited for, so a slow or absent Redis
 * never slows a rider's call. A change not refreshed here (an offer withdrawn as a stage closes, a trip cancelled without
 * pay) reaches the engine with the rider's next /locations call.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetEngineFeed implements DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetEngineFeed.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /** Events sent together: one Redis round trip. */
    static final int BATCH = 500;
    /** Riders the 5-minute sweep reads again with each batch, so fresh events never wait behind it. */
    static final int SWEEP_CHUNK = 100;
    static final Duration SWEEP_EVERY = Duration.ofMinutes(5);
    static final Duration TEST_MODE_EVERY = Duration.ofMinutes(1);
    static final Duration LOG_EVERY = Duration.ofMinutes(1);
    static final Duration REDIS_WAIT = Duration.ofSeconds(2);
    /** Java's own ranking sent with a shadow request, first to last: enough to compare who hears of the order. */
    static final int SHADOW_RIDERS = 50;
    /**
     * Riders as dispatch sees them (FleetDispatcher.nearbyRiders and standings): their working shift (ended, revoked and
     * expired ones don't count), break, trip, open offer, test mode listing, newest fix and when they last became free.
     * Parameters: rider ids and identity ids, each a uuid[] literal.
     */
    static final String SNAPSHOT = """
        SELECT r.id AS rider_id, r.status, r.max_pickup_m, r.max_drop_m, r.home_lat, r.home_lng,
               s.id AS shift_id, s.credential_expires_at, s.can_ring, s.heading_home_until, s.last_seen_at,
               """ + FleetShiftService.BREAK_ENDS.formatted("s.id") + """
         AS break_until,
               EXISTS (SELECT 1 FROM fleet_schema.trip t WHERE t.rider_id = r.id
                       AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP')) AS on_trip,
               o.expires_at AS offered_until, o.offered_at AS offered_from,
               EXISTS (SELECT 1 FROM fleet_schema.test_mode_rider m WHERE m.rider_id = r.id) AS test_listed,
               p.lat, p.lng, p.recorded_at, p.mock, p.accuracy_m,
               GREATEST(s.started_at, (SELECT max(t.finished_at) FROM fleet_schema.trip t WHERE t.rider_id = r.id),
                        (SELECT max(b.ends_at) FROM fleet_schema.rider_break b WHERE b.shift_id = s.id AND b.ends_at <= now())) AS free_since,
               now() AS db_now
        FROM fleet_schema.rider r
        LEFT JOIN fleet_schema.rider_shift s ON s.rider_id = r.id AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL
          AND s.credential_expires_at > now()
        LEFT JOIN fleet_schema.trip_offer o ON o.rider_id = r.id AND o.state = 'ACTIVE' AND o.expires_at > now()
        LEFT JOIN fleet_schema.rider_position_latest p ON p.rider_id = r.id
        WHERE r.id = ANY(CAST(? AS uuid[])) OR r.identity_id = ANY(CAST(? AS uuid[]))""";

    private final JdbcTemplate jdbc;
    private final FleetEngineProperties properties;
    private final EngineStreams streams;
    private final boolean testMode;
    private final BlockingQueue<Object> queue;
    private final Thread thread;
    private final AtomicLong dropped = new AtomicLong();
    private volatile Set<UUID> testRiders = Set.of();
    // The rest belongs to the sending thread (or a test's flush).
    private final Deque<UUID> sweep = new ArrayDeque<>();
    private long nextSweepMs;
    private long nextTestModeMs;
    private long nextStatsMs;
    private long nextFailureLogMs;
    private final long[] counts = new long[5]; // pings, refreshes, offline, shadows, failed

    @Autowired
    public FleetEngineFeed(JdbcTemplate jdbc, FleetEngineProperties properties, FleetProperties fleet, EngineStreams streams) {
        this(jdbc, properties, fleet, streams, true);
    }

    /** start false (tests): nothing is sent until flush(), and the sweep waits for sweepNow(). */
    FleetEngineFeed(JdbcTemplate jdbc, FleetEngineProperties properties, FleetProperties fleet, EngineStreams streams, boolean start) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.streams = streams;
        this.testMode = fleet.testMode();
        boolean on = properties.shadow() || properties.live();
        this.queue = on ? new ArrayBlockingQueue<>(properties.queueCapacity()) : null;
        // Started, the feed first reads every rider on a shift, so a new or emptied engine catches up at once.
        this.nextSweepMs = start ? 0 : Long.MAX_VALUE;
        this.thread = on && start ? Thread.ofPlatform().daemon().name("fleet-engine-feed").start(this::run) : null;
        if (on) {
            LOGGER.info("FLEET_ENGINE_FEED_ON mode={} joint={} riderPartitions={} dispatchPartitions={}", properties.mode(), properties.joint(),
                properties.riderPartitions(), properties.dispatchPartitions());
        }
    }

    /** Whether the engine hears of anything: craves.fleet.engine.mode shadow or live. */
    public boolean on() {
        return queue != null;
    }

    /** How long a value published for the engine is kept (the travel-time model; FleetEta writes it again as it is used). */
    static final Duration PUBLISHED_KEEP = Duration.ofDays(7);

    /** Keeps value where the engine reads it, at keySuffix under the engine's key prefix; nothing while the engine is off. */
    public void publish(String keySuffix, byte[] value) {
        if (on()) {
            streams.set(properties.keyPrefix() + keySuffix, value, PUBLISHED_KEEP, Duration.ofSeconds(2));
        }
    }

    /** A /locations call (FleetLocationService), sent once its transaction commits; test mode is applied here. */
    public void ping(UUID riderId, Instant at, List<Fix> fixes, State state) {
        if (on()) {
            afterCommit(new Ping(new RiderEvent(riderId, FleetEngineWire.PING, at.toEpochMilli(), fixes, state, null)));
        }
    }

    /** Reads these riders again once the current transaction commits: REFRESH, or OFFLINE without a working shift. */
    public void refresh(Collection<UUID> riderIds) {
        if (on()) {
            riderIds.forEach(id -> afterCommit(new Refresh(id, false)));
        }
    }

    public void refresh(UUID riderId) {
        refresh(List.of(riderId));
    }

    /** refresh, for a rider known by their Craves identity (the rider API's callers). */
    public void refreshIdentity(UUID identityId) {
        if (on()) {
            afterCommit(new Refresh(identityId, true));
        }
    }

    /** A trip ended with pay: the rider is free again and has earned more today. Runs once that has committed. */
    @TransactionalEventListener(fallbackExecution = true)
    public void onTripPayFinalized(FleetTripPayFinalized event) {
        if (on() && event.riderId() != null) {
            offer(new Refresh(event.riderId(), false));
        }
    }

    /**
     * Dispatch ranked riders for an order itself: the engine ranks the same order by the same rules, as of now, and logs
     * whether it agrees (FLEET_ENGINE_SHADOW). javaRanked: dispatch's ranking, first to last.
     */
    public void shadow(UUID orderId, double kitchenLat, double kitchenLng, double dropLat, double dropLng, int dropM, Policy policy,
                       Collection<UUID> exclude, List<Candidate> javaRanked, int round) {
        if (on()) {
            offer(new Shadow(new DispatchRequest(UUID.randomUUID(), FleetEngineWire.SHADOW, orderId, System.currentTimeMillis(), 0, kitchenLat,
                kitchenLng, dropLat, dropLng, dropM, policy, List.copyOf(exclude),
                List.copyOf(javaRanked.subList(0, Math.min(SHADOW_RIDERS, javaRanked.size()))), round)));
        }
    }

    @Override
    public void destroy() {
        if (thread != null) {
            thread.interrupt();
        }
    }

    private void afterCommit(Object item) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    offer(item);
                }
            });
        } else {
            offer(item);
        }
    }

    private void offer(Object item) {
        if (!queue.offer(item)) {
            dropped.incrementAndGet();
        }
    }

    private void run() {
        while (!Thread.currentThread().isInterrupted()) {
            long now = System.currentTimeMillis();
            List<Object> items = new ArrayList<>();
            try {
                Object first = queue.poll(sweep.isEmpty() ? 1 : 0, TimeUnit.SECONDS);
                if (first != null) {
                    items.add(first);
                    queue.drainTo(items, BATCH - 1);
                }
                now = System.currentTimeMillis();
                step(items, now);
            } catch (InterruptedException stop) {
                return;
            } catch (Throwable failure) { // any failure, an Error too: this thread must never stop silently
                // The batch is lost (Postgres or Redis unreachable): later events and the next sweep make up for it.
                failed(now, items.size(), failure);
            }
        }
    }

    /** Tests: sends everything queued, and any sweep, on this thread. */
    void flush() {
        long now = System.currentTimeMillis();
        loadTestRiders(now);
        List<Object> items = new ArrayList<>();
        queue.drainTo(items);
        step(items, now);
        while (!sweep.isEmpty()) {
            step(List.of(), now);
        }
    }

    /** Tests: the next flush sweeps every rider on a shift. */
    void sweepNow() {
        nextSweepMs = 0;
    }

    /** Events dropped because the queue was full, since the last stats line. */
    long dropped() {
        return dropped.get();
    }

    private void step(List<Object> items, long now) {
        if (now >= nextTestModeMs) {
            loadTestRiders(now);
        }
        if (now >= nextSweepMs) {
            nextSweepMs = now + SWEEP_EVERY.toMillis();
            sweep.clear();
            sweep.addAll(jdbc.queryForList("SELECT rider_id FROM fleet_schema.rider_shift WHERE ended_at IS NULL", UUID.class));
        }
        List<RiderEvent> events = new ArrayList<>();
        Set<UUID> riders = new HashSet<>();
        Set<UUID> identities = new HashSet<>();
        List<DispatchRequest> shadows = new ArrayList<>();
        for (Object item : items) {
            switch (item) {
                case Ping ping -> events.add(allowed(ping.event()));
                case Refresh refresh -> (refresh.identity() ? identities : riders).add(refresh.id());
                case Shadow shadow -> shadows.add(shadow.request());
                default -> throw new IllegalStateException("Unknown feed item " + item);
            }
        }
        for (int i = 0; i < SWEEP_CHUNK && !sweep.isEmpty(); i++) {
            riders.add(sweep.poll());
        }
        if (!riders.isEmpty() || !identities.isEmpty()) {
            events.addAll(snapshot(riders, identities));
        }
        send(events, shadows, now);
        if (now >= nextStatsMs) {
            nextStatsMs = now + LOG_EVERY.toMillis();
            long lost = dropped.getAndSet(0);
            if (lost > 0 || Arrays.stream(counts).sum() > 0) {
                LOGGER.info("FLEET_ENGINE_FEED pings={} refreshes={} offline={} shadows={} failed={} dropped={} queued={}", counts[0], counts[1],
                    counts[2], counts[3], counts[4], lost, queue.size());
                Arrays.fill(counts, 0);
            }
        }
    }

    private void send(List<RiderEvent> events, List<DispatchRequest> shadows, long now) {
        if (events.isEmpty() && shadows.isEmpty()) {
            return;
        }
        String prefix = properties.keyPrefix();
        List<Entry> entries = new ArrayList<>(events.size() + shadows.size());
        for (RiderEvent event : events) {
            entries.add(new Entry(FleetEngineWire.riderStream(prefix, FleetEngineWire.partition(event.riderId(), properties.riderPartitions())),
                FleetEngineWire.encode(event)));
        }
        for (DispatchRequest request : shadows) {
            entries.add(new Entry(FleetEngineWire.dispatchStream(prefix, FleetEngineWire.blockPartition(
                FleetEngineWire.block(request.kitchenLat(), request.kitchenLng()), properties.dispatchPartitions())), FleetEngineWire.encode(request)));
        }
        try {
            streams.append(entries, Duration.ofSeconds(properties.streamKeepSeconds()), REDIS_WAIT);
        } catch (RuntimeException failure) {
            failed(now, entries.size(), failure);
            return;
        }
        for (RiderEvent event : events) {
            counts[event.kind() == FleetEngineWire.PING ? 0 : event.kind() == FleetEngineWire.REFRESH ? 1 : 2]++;
        }
        counts[3] += shadows.size();
    }

    private void failed(long now, int events, Throwable failure) {
        counts[4] += events;
        if (now >= nextFailureLogMs) {
            nextFailureLogMs = now + LOG_EVERY.toMillis();
            LOGGER.warn("FLEET_ENGINE_FEED_FAILED events={} reason={}", events, failure.toString());
        }
    }

    private RiderEvent allowed(RiderEvent event) {
        return new RiderEvent(event.riderId(), event.kind(), event.atMs(), event.fixes(),
            event.state().allowed(!testMode || testRiders.contains(event.riderId())), event.standing());
    }

    private void loadTestRiders(long now) {
        nextTestModeMs = now + TEST_MODE_EVERY.toMillis();
        if (testMode) {
            testRiders = Set.copyOf(jdbc.queryForList("SELECT rider_id FROM fleet_schema.test_mode_rider", UUID.class));
        }
    }

    /** The riders as dispatch sees them now: REFRESH with the day's standing, or OFFLINE without a working shift. */
    List<RiderEvent> snapshot(Collection<UUID> riderIds, Collection<UUID> identityIds) {
        List<Seen> seen = jdbc.query(SNAPSHOT, (row, n) -> seen(row), array(riderIds), array(identityIds));
        // Standings after the snapshot's own result is closed: one pooled connection at a time.
        return seen.stream().map(rider -> rider.state() == null
            ? new RiderEvent(rider.riderId(), FleetEngineWire.OFFLINE, rider.at().toEpochMilli(), List.of(), null, null)
            : new RiderEvent(rider.riderId(), FleetEngineWire.REFRESH, rider.at().toEpochMilli(), List.of(), rider.state(),
                standing(rider.riderId(), rider.at(), rider.state().breakUntilMs() == 0, rider.freeSince()))).toList();
    }

    private Seen seen(ResultSet row) throws SQLException {
        UUID riderId = row.getObject("rider_id", UUID.class);
        Instant at = instant(row, "db_now");
        UUID shiftId = row.getObject("shift_id", UUID.class);
        if (shiftId == null) {
            return new Seen(riderId, at, null, null);
        }
        Fix lastFix = row.getObject("recorded_at") == null ? null : new Fix(row.getDouble("lat"), row.getDouble("lng"),
            instant(row, "recorded_at").toEpochMilli(), row.getBoolean("mock"), (float) row.getDouble("accuracy_m"));
        Instant headingHome = instant(row, "heading_home_until");
        // The home spot goes to Redis only while heading home uses it.
        boolean home = headingHome != null && headingHome.isAfter(at) && row.getObject("home_lat") != null;
        State state = new State(shiftId, millis(instant(row, "credential_expires_at")), "ACTIVE".equals(row.getString("status")),
            row.getBoolean("on_trip"), millis(instant(row, "offered_until")), millis(instant(row, "break_until")),
            Boolean.FALSE.equals(row.getObject("can_ring")), intOrZero(row, "max_pickup_m"), intOrZero(row, "max_drop_m"),
            home ? row.getDouble("home_lat") : null, home ? row.getDouble("home_lng") : null,
            millis(headingHome), !testMode || row.getBoolean("test_listed"), millis(instant(row, "last_seen_at")), lastFix,
            millis(instant(row, "offered_from")));
        return new Seen(riderId, at, state, instant(row, "free_since"));
    }

    /**
     * The day so far, as FleetDispatcher.standings reads it at at: pay credited today, available online seconds today, and
     * when the rider last became free. accruing: online time grows from then on (a working shift, no break); the engine
     * counts it up to 3 minutes after the phone's last call, as FleetEarnings does.
     */
    private Standing standing(UUID riderId, Instant at, boolean accruing, Instant freeSince) {
        FleetEarnings.Window today = FleetEarnings.window("today", at);
        Timestamp from = Timestamp.from(today.from());
        Timestamp to = Timestamp.from(today.to());
        // shortcut: two queries a rider, as FleetDispatcher.standings; batch them past ~1,000 riders on a shift.
        long earned = jdbc.queryForObject(FleetEarnings.RANGE_TOTAL_SQL, (row, n) -> row.getLong("paise"), riderId, from, to);
        long online = jdbc.queryForObject(FleetEarnings.ONLINE_SECONDS_SQL, Long.class, from, to, riderId);
        LocalDate day = at.atZone(IST).toLocalDate();
        return new Standing(day.getYear() * 10_000 + day.getMonthValue() * 100 + day.getDayOfMonth(), earned, online, accruing, millis(freeSince));
    }

    private static String array(Collection<UUID> ids) {
        return ids.stream().map(UUID::toString).collect(Collectors.joining(",", "{", "}"));
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static long millis(Instant at) {
        return at == null ? 0 : at.toEpochMilli();
    }

    private static int intOrZero(ResultSet row, String column) throws SQLException {
        Object value = row.getObject(column);
        return value == null ? 0 : ((Number) value).intValue();
    }

    /** state null: no working shift. */
    private record Seen(UUID riderId, Instant at, State state, Instant freeSince) {
    }

    private record Ping(RiderEvent event) {
    }

    private record Refresh(UUID id, boolean identity) {
    }

    private record Shadow(DispatchRequest request) {
    }
}
