package in.craves.fleetengine.dispatch;

import in.craves.fleetengine.EngineStats;
import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.assign.Assign;
import in.craves.fleetengine.ingest.StreamReader;
import in.craves.fleetengine.live.LiveStore;
import in.craves.fleetengine.rules.Rider;
import in.craves.fleetengine.rules.Rules;
import in.craves.fleetengine.support.Latency;
import in.craves.fleetengine.wire.Wire;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Ranks riders for the orders waiting in each map block (docs/riders/SCALE.md, "Matching"). Every block has one actor (a
 * virtual thread), so a block's orders have one writer, in parallel with every other block; the partition lease keeps each
 * block on one instance. An actor takes whatever orders arrived while it was busy as one batch (no wait when idle, more
 * together under load), reads the riders near them from the live state, ranks each order by Craves's rules (Rules), and
 * shares the riders out (Assign). Live, it holds the riders chosen for a few seconds and replies; in shadow, it compares its
 * ranking with the Java dispatcher's and logs it.
 */
public final class DispatchEngine implements StreamReader.Handler, AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(DispatchEngine.class);

    /**
     * holdMs: how long a live reply's riders are kept for their order; exactLimit: above this (Assign.joint's estimate of the
     * work), orders are shared out greedily; maxBatch: the most orders ranked together; queueSize: orders a block may have
     * waiting before new ones are shed; overloadQueue: with this many waiting, share out greedily; replyRiders: the most
     * riders in a reply; idleExitMs: a block's actor with no orders for this long stops.
     */
    public record Config(long holdMs, long exactLimit, int maxBatch, int queueSize, int overloadQueue, int replyRiders, long idleExitMs) {
    }

    private record Key(int mode, Wire.Policy policy) {
    }

    private final Config cfg;
    private final LiveStore store;
    private final RedisClusterAsyncCommands<byte[], byte[]> redis;
    private final LongSupplier clock;
    private final ReentrantLock lock = new ReentrantLock();
    private final Map<Long, ArrayBlockingQueue<Wire.DispatchRequest>> actors = new HashMap<>();
    private final Set<Thread> threads = ConcurrentHashMap.newKeySet();
    private final AtomicInteger actorCount;
    private volatile boolean closed;
    private final Latency replyMs;
    private final Counter requests;
    private final Counter expired;
    private final Counter shed;
    private final Counter malformed;
    private final Counter replies;
    private final Counter failed;
    private final Counter same;
    private final Counter sameSet;
    private final Counter differ;
    private final Counter jointChanged;
    private final DistributionSummary batchOrders;
    private final Timer solve;

    /** replyMs: from a live request to its reply. */
    public DispatchEngine(Config cfg, LiveStore store, RedisClusterAsyncCommands<byte[], byte[]> redis, MeterRegistry registry,
                          Latency replyMs, LongSupplier clock) {
        this.cfg = cfg;
        this.store = store;
        this.redis = redis;
        this.clock = clock;
        this.replyMs = replyMs;
        this.requests = registry.counter(EngineStats.REQUESTS);
        this.expired = registry.counter(EngineStats.EXPIRED);
        this.shed = registry.counter(EngineStats.SHED);
        this.malformed = registry.counter(EngineStats.MALFORMED);
        this.replies = registry.counter(EngineStats.REPLIES);
        this.failed = registry.counter(EngineStats.FAILED);
        this.same = registry.counter(EngineStats.SHADOW_SAME);
        this.sameSet = registry.counter(EngineStats.SHADOW_SAME_SET);
        this.differ = registry.counter(EngineStats.SHADOW_DIFFER);
        this.jointChanged = registry.counter(EngineStats.JOINT_CHANGED);
        this.batchOrders = registry.summary("fleet.engine.batch.orders");
        this.solve = registry.timer("fleet.engine.solve");
        this.actorCount = registry.gauge("fleet.engine.block.actors", new AtomicInteger());
    }

    /** A dispatch partition's reader: decodes each request and queues it for its block. */
    @Override
    public void handle(RedisSetup.Conn conn, List<StreamReader.Entry> entries) {
        for (StreamReader.Entry entry : entries) {
            Wire.DispatchRequest q;
            try {
                q = entry.payload() == null ? null : Wire.decodeRequest(entry.payload());
            } catch (IllegalArgumentException e) {
                q = null;
            }
            if (q == null || !valid(q)) {
                malformed.increment();
                continue;
            }
            submit(q);
        }
    }

    /**
     * Refuses a request whose numbers would make the engine misbehave (a negative capacity, a continent-wide radius).
     * integration-service's policies never hold them, but the stream is input, and one bad entry must not stop every block.
     */
    static boolean valid(Wire.DispatchRequest q) {
        Wire.Policy p = q.policy();
        return q.requestId() != null && (q.mode() == Wire.SHADOW || q.mode() == Wire.LIVE)
            && p.offersAtOnce() >= 0 && p.offersAtOnce() <= 10 && p.radiusM() >= 0 && p.radiusM() <= 50_000
            && p.fairBandM() >= 0 && p.fairBandM() <= 50_000 && p.detourPercent() >= 0 && p.detourPercent() <= 1_000 && q.dropM() >= 0
            && within(q.kitchenLat(), 90) && within(q.kitchenLng(), 180) && within(q.dropLat(), 90) && within(q.dropLng(), 180)
            && q.javaRanked().stream().allMatch(c -> c.riderId() != null);
    }

    private static boolean within(double v, double limit) {
        return v >= -limit && v <= limit; // false for NaN and the infinities too
    }

    /**
     * Queues q for its block's actor, starting one if needed; false when the block's queue is full (the order is shed, and
     * integration-service, waiting in vain, ranks it itself). The offer happens under the lock an idle actor takes to stop,
     * so no request is left in a stopped actor's queue.
     */
    public boolean submit(Wire.DispatchRequest q) {
        requests.increment();
        long block = Wire.block(q.kitchenLat(), q.kitchenLng());
        lock.lock();
        try {
            if (closed) {
                shed.increment();
                return false;
            }
            ArrayBlockingQueue<Wire.DispatchRequest> queue = actors.get(block);
            if (queue == null) {
                ArrayBlockingQueue<Wire.DispatchRequest> fresh = new ArrayBlockingQueue<>(cfg.queueSize());
                actors.put(block, fresh);
                actorCount.set(actors.size());
                Thread t = Thread.ofVirtual().name("fleet-block-" + block).unstarted(() -> run(block, fresh));
                threads.add(t);
                t.start();
                queue = fresh;
            }
            if (!queue.offer(q)) {
                shed.increment();
                return false;
            }
            return true;
        } finally {
            lock.unlock();
        }
    }

    private void run(long block, ArrayBlockingQueue<Wire.DispatchRequest> queue) {
        List<Wire.DispatchRequest> batch = new ArrayList<>(cfg.maxBatch());
        try {
            while (!closed) {
                Wire.DispatchRequest q = queue.poll(cfg.idleExitMs(), TimeUnit.MILLISECONDS);
                if (q == null) {
                    lock.lock();
                    try {
                        if (queue.isEmpty()) { // under the lock submit offers under: nothing can arrive after this
                            actors.remove(block, queue);
                            actorCount.set(actors.size());
                            return;
                        }
                    } finally {
                        lock.unlock();
                    }
                    continue;
                }
                batch.clear();
                batch.add(q);
                queue.drainTo(batch, cfg.maxBatch() - 1);
                processSafely(batch, queue.size());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            lock.lock();
            try {
                actors.remove(block, queue);
                actorCount.set(actors.size());
            } finally {
                lock.unlock();
            }
            threads.remove(Thread.currentThread());
        }
    }

    /**
     * process, except that a batch that fails is logged and dropped: the block's actor, and every other block, carry on.
     * integration-service ranks the dropped orders itself.
     */
    private void processSafely(List<Wire.DispatchRequest> batch, int waiting) {
        try {
            process(batch, waiting);
        } catch (RuntimeException e) {
            failed.increment();
            LOG.error("FLEET_ENGINE_BATCH_FAILED orders={} error={}", batch.size(), e.toString());
        }
    }

    /**
     * Ranks one batch: live requests past their deadline are skipped (integration-service has already ranked them itself),
     * and the rest are grouped by mode and policy, each group in arrival order.
     */
    void process(List<Wire.DispatchRequest> batch, int waiting) {
        long start = System.nanoTime();
        long now = clock.getAsLong();
        Map<Key, List<Wire.DispatchRequest>> groups = new LinkedHashMap<>();
        for (Wire.DispatchRequest q : batch) {
            if (q.mode() == Wire.LIVE && q.deadlineMs() > 0 && q.deadlineMs() <= now) {
                expired.increment();
                continue;
            }
            groups.computeIfAbsent(new Key(q.mode(), q.policy()), k -> new ArrayList<>()).add(q);
        }
        for (List<Wire.DispatchRequest> g : groups.values()) {
            g.sort(Comparator.comparingLong(Wire.DispatchRequest::atMs));
            group(g, now, waiting);
        }
        solve.record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
    }

    private void group(List<Wire.DispatchRequest> g, long now, int waiting) {
        batchOrders.record(g.size());
        List<LiveStore.Centre> centres = new ArrayList<>(g.size());
        for (Wire.DispatchRequest q : g) {
            centres.add(new LiveStore.Centre(q.kitchenLat(), q.kitchenLng(), q.policy().radiusM()));
        }
        List<Rider> riders;
        try {
            riders = store.near(redis, centres);
        } catch (RuntimeException e) {
            failed.increment();
            LOG.warn("FLEET_ENGINE_READ_FAILED orders={} error={}", g.size(), e.toString());
            return;
        }
        List<Assign.Order> orders = new ArrayList<>(g.size());
        for (Wire.DispatchRequest q : g) {
            long t = q.mode() == Wire.SHADOW ? q.atMs() : now; // the rules as they stood when Java ranked
            orders.add(new Assign.Order(q.policy().offersAtOnce(), Rules.rank(q, riders, t)));
        }
        long limit = waiting >= cfg.overloadQueue() ? 0 : cfg.exactLimit(); // behind: share out greedily until the queue is down
        // res is how the riders are shared out; other is the other way, worked out only to measure what sharing out jointly
        // changes against first come (jointChanged, the measure for CRAVES_FLEET_ENGINE_JOINT), in shadow and live alike.
        Assign.Result res;
        Assign.Result other = null;
        boolean joint = g.get(0).policy().joint();
        if (joint) {
            res = Assign.joint(orders, limit);
            if (g.size() > 1) {
                other = Assign.firstCome(orders);
            }
        } else {
            res = Assign.firstCome(orders);
            if (g.size() > 1 && waiting < cfg.overloadQueue()) {
                other = Assign.joint(orders, limit);
            }
        }
        Map<UUID, Integer> exclusive = new HashMap<>();
        for (int o = 0; o < orders.size(); o++) {
            for (int i : res.chosen()[o]) {
                exclusive.put(orders.get(o).ranked().get(i).rider.id, o);
            }
        }
        for (int o = 0; o < g.size(); o++) {
            Wire.DispatchRequest q = g.get(o);
            int[] jointPick = res.chosen()[o];
            boolean changed = false;
            if (other != null) {
                changed = !sameSet(ridersOf(orders.get(o), res.chosen()[o]), ridersOf(orders.get(o), other.chosen()[o]));
                if (!joint) {
                    jointPick = other.chosen()[o];
                }
            }
            if (changed) {
                jointChanged.increment();
            }
            if (q.mode() == Wire.SHADOW) {
                compare(q, orders.get(o), jointPick, changed, g.size(), res.solver());
                continue;
            }
            reply(q, o, orders.get(o), res.chosen()[o], exclusive, g.size(), res.solver(), now);
        }
    }

    private static List<UUID> ridersOf(Assign.Order ord, int[] idx) {
        List<UUID> ids = new ArrayList<>(idx.length);
        for (int i : idx) {
            ids.add(ord.ranked().get(i).rider.id);
        }
        return ids;
    }

    /**
     * Holds the order's chosen riders and writes the reply: those held first, then the order's other riders not chosen for
     * another order, in its own order.
     */
    private void reply(Wire.DispatchRequest q, int o, Assign.Order ord, int[] chosen, Map<UUID, Integer> exclusive, int batch,
                       int solver, long now) {
        if (q.deadlineMs() > 0 && clock.getAsLong() >= q.deadlineMs()) {
            expired.increment(); // integration-service has stopped waiting: holding riders now would only keep them from others
            return;
        }
        List<UUID> ids = ridersOf(ord, chosen);
        boolean[] held;
        try {
            held = store.hold(redis, q.requestId(), ids, now, now + cfg.holdMs());
        } catch (RuntimeException e) {
            failed.increment();
            LOG.warn("FLEET_ENGINE_HOLD_FAILED error={}", e.toString());
            return;
        }
        Set<UUID> isHeld = new HashSet<>();
        Set<UUID> lost = new HashSet<>();
        for (int k = 0; k < ids.size(); k++) {
            (held[k] ? isHeld : lost).add(ids.get(k)); // lost: another block's order holds them now
        }
        List<Wire.Candidate> out = new ArrayList<>();
        for (int pass = 0; pass < 2; pass++) {
            for (Rules.Ranked r : ord.ranked()) {
                if (out.size() == cfg.replyRiders()) {
                    break;
                }
                UUID id = r.rider.id;
                boolean isHeldNow = isHeld.contains(id);
                Integer elsewhere = exclusive.get(id);
                if (pass == 0 && isHeldNow || pass == 1 && !isHeldNow && !lost.contains(id) && (elsewhere == null || elsewhere == o)) {
                    out.add(candidate(r, isHeldNow));
                }
            }
        }
        try {
            store.reply(redis, q.requestId(), Wire.encode(new Wire.DispatchReply(q.requestId(), out, batch, solver, clock.getAsLong())));
        } catch (RuntimeException e) {
            failed.increment();
            LOG.warn("FLEET_ENGINE_REPLY_FAILED error={}", e.toString());
            return;
        }
        replies.increment();
        replyMs.observe(clock.getAsLong() - q.atMs());
    }

    static Wire.Candidate candidate(Rules.Ranked r, boolean held) {
        return new Wire.Candidate(r.rider.id, r.straightM, r.rider.lat, r.rider.lng, r.inBand, r.inBand ? r.perHourPaise : 0,
            r.inBand ? r.freeSinceMs : 0, r.homeNearerM == null ? 0 : r.homeNearerM, held);
    }

    /**
     * Logs how the engine's ranking of a shadow request matches the Java dispatcher's: the riders who would hear of it first
     * (offers at once), alone and shared out jointly with the orders ranked together, and whether that joint sharing out
     * differs from first come.
     */
    private void compare(Wire.DispatchRequest q, Assign.Order ord, int[] chosen, boolean changed, int batch, int solver) {
        int k = q.policy().offersAtOnce();
        List<UUID> java = q.javaRanked().stream().limit(k).map(Wire.Candidate::riderId).toList();
        List<UUID> alone = ord.ranked().stream().limit(k).map(r -> r.rider.id).toList();
        List<UUID> joint = ridersOf(ord, chosen);
        String agree;
        if (java.equals(alone)) {
            agree = "same";
            same.increment();
        } else if (sameSet(java, alone)) {
            agree = "same_set";
            sameSet.increment();
        } else {
            agree = "differ";
            differ.increment();
        }
        LOG.info("FLEET_ENGINE_SHADOW order={} agree={} java={} engine={} joint={} jointChanged={} batch={} solver={} ranked={} "
                + "javaRanked={} round={}", shortId(q.orderId()), agree, shorts(java), shorts(alone), shorts(joint), changed, batch,
            solver, ord.ranked().size(), q.javaRanked().size(), q.round());
    }

    static boolean sameSet(List<UUID> a, List<UUID> b) {
        if (a.size() != b.size()) {
            return false;
        }
        Map<UUID, Integer> in = new HashMap<>();
        for (UUID x : a) {
            in.merge(x, 1, Integer::sum);
        }
        for (UUID x : b) {
            Integer n = in.get(x);
            if (n == null || n == 0) {
                return false;
            }
            in.put(x, n - 1);
        }
        return true;
    }

    /** The first 8 hex characters of an id: enough to match log lines. */
    static String shortId(UUID id) {
        return id == null ? "none" : Wire.hex(id).substring(0, 8);
    }

    private static String shorts(List<UUID> ids) {
        return ids.stream().map(DispatchEngine::shortId).collect(Collectors.joining(",", "[", "]"));
    }

    /** Stops every actor; requests still queued are dropped (integration-service ranks them itself). */
    @Override
    public void close() {
        lock.lock();
        try {
            closed = true;
        } finally {
            lock.unlock();
        }
        for (Thread t : threads) {
            t.interrupt();
        }
        long deadline = System.currentTimeMillis() + 3_000;
        for (Thread t : threads) {
            try {
                t.join(Math.max(1, deadline - System.currentTimeMillis()));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    /** Blocks with an actor running. */
    public int actors() {
        return actorCount.get();
    }
}
