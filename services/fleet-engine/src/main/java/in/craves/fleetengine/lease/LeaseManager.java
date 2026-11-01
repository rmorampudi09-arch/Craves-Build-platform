package in.craves.fleetengine.lease;

import in.craves.fleetengine.RedisSetup;
import io.lettuce.core.Range;
import io.lettuce.core.RedisException;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Shares one family of stream partitions ("rq" for rider events, "dq" for dispatch requests) among the engine's
 * instances, as Kafka's consumer groups share partitions: each partition is read by one instance at a time (a Redis key
 * per partition, SET NX PX, renewed and released by compare-and-set), and each instance holds its fair share of the
 * instances alive (a sorted set of heartbeats). An instance that dies loses its leases when they run out, and the others
 * take them. Correctness never depends on a lease (rider writes are newest-wins, holds are compare-and-set, Postgres has
 * the last word on offers); a lease only keeps one block's orders on one instance, so they are ranked together.
 */
public final class LeaseManager implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(LeaseManager.class);
    static final String RENEW = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";
    static final String RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    /** Takes a free lease, or one this instance still holds (a renewal that timed out may have reached Redis); 1 when taken. */
    static final String TAKE = """
        local v = redis.call('GET', KEYS[1])
        if v == ARGV[1] then redis.call('PEXPIRE', KEYS[1], ARGV[2]) return 1 end
        if v then return 0 end
        redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
        return 1""";

    /** One partition's reader: runs until its Stop says stop. */
    public interface Reader {
        void run(int partition, Stop stop);
    }

    /** Tells a reader to stop, and closes what it registered (its connection), so a blocked read ends at once. */
    public static final class Stop {
        private volatile boolean stopped;
        private volatile AutoCloseable resource;

        public boolean stopped() {
            return stopped;
        }

        public void closeOnStop(AutoCloseable r) {
            resource = r;
            if (stopped) {
                quietly(r);
            }
        }

        public void stop() {
            stopped = true;
            AutoCloseable r = resource;
            if (r != null) {
                quietly(r);
            }
        }

        private static void quietly(AutoCloseable r) {
            try {
                r.close();
            } catch (Exception ignored) {
                // closing a connection that is already gone
            }
        }
    }

    private final RedisClusterAsyncCommands<byte[], byte[]> redis;
    private final String prefix;
    private final String family;
    private final int partitions;
    private final byte[] me;
    private final long ttlMs;
    private final Reader reader;
    private final ReentrantLock lock = new ReentrantLock();
    private final Map<Integer, Stop> held = new TreeMap<>();
    private final Map<Integer, Long> renewed = new HashMap<>();
    private final ExecutorService readers = Executors.newVirtualThreadPerTaskExecutor();
    private final CountDownLatch closing = new CountDownLatch(1);
    private final CountDownLatch closed = new CountDownLatch(1);
    private volatile boolean started;

    public LeaseManager(RedisClusterAsyncCommands<byte[], byte[]> redis, String prefix, String family, int partitions, String me,
                        long ttlMs, Reader reader) {
        this.redis = redis;
        this.prefix = prefix;
        this.family = family;
        this.partitions = partitions;
        this.me = me.getBytes(StandardCharsets.UTF_8);
        this.ttlMs = ttlMs;
        this.reader = reader;
    }

    byte[] leaseKey(int p) {
        return (prefix + "lease:{" + family + p + "}").getBytes(StandardCharsets.US_ASCII);
    }

    byte[] membersKey() {
        return (prefix + "members:{" + family + "}").getBytes(StandardCharsets.US_ASCII);
    }

    /** The partitions this instance reads now, ascending. */
    public List<Integer> held() {
        lock.lock();
        try {
            return List.copyOf(held.keySet());
        } finally {
            lock.unlock();
        }
    }

    /** Keeps this instance's fair share of leases, a round every third of a lease, until close. */
    public void start() {
        started = true;
        Thread.ofVirtual().name("fleet-lease-" + family).start(() -> {
            try {
                do {
                    try {
                        step();
                    } catch (RuntimeException e) {
                        LOG.warn("FLEET_ENGINE_LEASE_FAILED family={} error={}", family, e.toString());
                    }
                } while (!closing.await(ttlMs / 3, TimeUnit.MILLISECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                releaseAll();
                closed.countDown();
            }
        });
    }

    /** One round: heartbeat, renew, give back what is over the fair share, take free partitions up to it. */
    public void step() {
        long now = System.currentTimeMillis();
        byte[] members = membersKey();
        byte[] ttl = Long.toString(ttlMs).getBytes(StandardCharsets.US_ASCII);
        RedisFuture<Long> beat = redis.zadd(members, now, me);
        RedisFuture<Long> trim = redis.zremrangebyscore(members, Range.from(Range.Boundary.unbounded(), Range.Boundary.including(now - 3 * ttlMs)));
        // Alive: a heartbeat within one lease time (an instance beats three times in it), so the others take a dead
        // instance's share as soon as its leases lapse.
        RedisFuture<Long> alive = redis.zcount(members, Range.from(Range.Boundary.including(now - ttlMs), Range.Boundary.unbounded()));
        RedisFuture<Boolean> expire = redis.pexpire(members, 10 * ttlMs);
        int count = 1;
        try {
            RedisSetup.await(beat);
            RedisSetup.await(trim);
            count = (int) Math.max(1, RedisSetup.await(alive));
            RedisSetup.await(expire);
        } catch (RedisException e) {
            count = 1;
        }
        int target = (partitions + count - 1) / count;

        List<Integer> mine = held();
        List<RedisFuture<Long>> renewals = new ArrayList<>(mine.size());
        for (int p : mine) {
            renewals.add(redis.eval(RENEW, ScriptOutputType.INTEGER, new byte[][] {leaseKey(p)}, me, ttl));
        }
        List<Integer> kept = new ArrayList<>();
        for (int i = 0; i < mine.size(); i++) {
            int p = mine.get(i);
            Long renewedReply;
            try {
                renewedReply = RedisSetup.await(renewals.get(i));
            } catch (RedisException e) {
                renewedReply = null;
            }
            if (renewedReply != null && renewedReply == 1) {
                renewedAt(p, System.currentTimeMillis());
                kept.add(p);
            } else if (renewedReply == null && !mayHaveLapsed(p)) {
                kept.add(p); // Redis didn't answer this time; the lease still runs, so keep reading
            } else {
                stop(p); // lost it, or it may have lapsed: another instance may read it now
            }
        }
        while (kept.size() > target) {
            int p = kept.remove(kept.size() - 1);
            stop(p);
            release(p);
        }
        List<Integer> order = new ArrayList<>(partitions);
        for (int p = 0; p < partitions; p++) {
            order.add(p);
        }
        Collections.shuffle(order);
        for (int p : order) {
            if (held().size() >= target || closing.getCount() == 0) {
                return;
            }
            if (holds(p)) {
                continue;
            }
            try {
                Long taken = RedisSetup.await(redis.eval(TAKE, ScriptOutputType.INTEGER, new byte[][] {leaseKey(p)}, me, ttl));
                if (taken != null && taken == 1) {
                    begin(p);
                }
            } catch (RedisException e) {
                return; // Redis isn't answering: try again next round
            }
        }
    }

    private boolean holds(int p) {
        lock.lock();
        try {
            return held.containsKey(p);
        } finally {
            lock.unlock();
        }
    }

    private void renewedAt(int p, long at) {
        lock.lock();
        try {
            if (held.containsKey(p)) {
                renewed.put(p, at);
            }
        } finally {
            lock.unlock();
        }
    }

    /** A whole lease time has passed since the last renewal Redis confirmed. */
    private boolean mayHaveLapsed(int p) {
        lock.lock();
        try {
            return System.currentTimeMillis() - renewed.getOrDefault(p, 0L) >= ttlMs;
        } finally {
            lock.unlock();
        }
    }

    private void begin(int p) {
        Stop stop = new Stop();
        lock.lock();
        try {
            held.put(p, stop);
            renewed.put(p, System.currentTimeMillis());
        } finally {
            lock.unlock();
        }
        readers.execute(() -> {
            try {
                reader.run(p, stop);
            } catch (RuntimeException e) {
                LOG.error("FLEET_ENGINE_READER_FAILED family={} partition={} error={}", family, p, e.toString());
            }
        });
    }

    private void stop(int p) {
        Stop stop;
        lock.lock();
        try {
            stop = held.remove(p);
            renewed.remove(p);
        } finally {
            lock.unlock();
        }
        if (stop != null) {
            stop.stop();
        }
    }

    private void release(int p) {
        try {
            RedisSetup.await(redis.eval(RELEASE, ScriptOutputType.INTEGER, new byte[][] {leaseKey(p)}, me));
        } catch (RedisException ignored) {
            // the lease runs out on its own
        }
    }

    private void releaseAll() {
        for (int p : held()) {
            stop(p);
            release(p);
        }
        try {
            RedisSetup.await(redis.zrem(membersKey(), me));
        } catch (RedisException ignored) {
            // the heartbeat ages out
        }
    }

    /** Gives every lease back, so other instances take over at once, and waits a little for the readers to stop. */
    @Override
    public void close() {
        closing.countDown();
        try {
            if (!started || !closed.await(5, TimeUnit.SECONDS)) {
                releaseAll(); // never started, or the round is stuck: give the leases back anyway
            }
            readers.shutdown();
            readers.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
