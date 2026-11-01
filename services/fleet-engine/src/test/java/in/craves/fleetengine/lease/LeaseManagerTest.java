package in.craves.fleetengine.lease;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.RedisTestSupport;
import io.lettuce.core.SetArgs;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class LeaseManagerTest {
    static RedisSetup redis;
    static RedisSetup.Conn conn;

    @BeforeAll
    static void cluster() {
        redis = RedisSetup.connect(RedisTestSupport.cluster());
        conn = redis.open();
    }

    @AfterAll
    static void close() {
        if (conn != null) {
            conn.close();
            redis.close();
        }
    }

    /** Readers that note which partitions run, per instance, until stopped. */
    static final class Readers {
        final Map<String, Set<Integer>> running = new ConcurrentHashMap<>();

        LeaseManager.Reader of(String who) {
            return (p, stop) -> {
                running.computeIfAbsent(who, k -> ConcurrentHashMap.newKeySet()).add(p);
                while (!stop.stopped()) {
                    sleep(5);
                }
                running.get(who).remove(p);
            };
        }

        int count(String who) {
            return running.getOrDefault(who, Set.of()).size();
        }
    }

    @Test
    void instancesShareThePartitionsAndTakeOverWhenOneLeaves() {
        String prefix = RedisTestSupport.prefix();
        Readers r = new Readers();
        LeaseManager a = new LeaseManager(conn.async, prefix, "rq", 8, "a", 600, r.of("a"));
        LeaseManager b = new LeaseManager(conn.async, prefix, "rq", 8, "b", 600, r.of("b"));
        a.step();
        assertEquals(8, a.held().size(), "alone, a holds all 8");
        b.step(); // b is seen: a's fair share is now 4
        a.step();
        b.step();
        assertEquals(4, a.held().size());
        assertEquals(4, b.held().size());
        Set<Integer> both = new HashSet<>(a.held());
        both.retainAll(b.held());
        assertTrue(both.isEmpty(), "a partition held twice");
        waitFor(() -> r.count("a") == 4 && r.count("b") == 4);
        a.start();
        b.start();
        sleep(300);
        a.close(); // a leaves: it gives its leases back, and b takes them at its next round
        waitFor(() -> b.held().size() == 8 && r.count("a") == 0 && r.count("b") == 8);
        b.close();
    }

    /**
     * A renewal that timed out may still have reached Redis, so the key names this instance after it gave the partition up:
     * it takes the partition straight back instead of waiting for its own lease to run out.
     */
    @Test
    void anInstanceTakesBackALeaseItStillHolds() {
        String prefix = RedisTestSupport.prefix();
        Readers r = new Readers();
        LeaseManager a = new LeaseManager(conn.async, prefix, "tb", 2, "a", 6_000, r.of("a"));
        RedisSetup.await(conn.async.set(a.leaseKey(0), "a".getBytes(StandardCharsets.UTF_8), SetArgs.Builder.px(6_000)));
        RedisSetup.await(conn.async.set(a.leaseKey(1), "z".getBytes(StandardCharsets.UTF_8), SetArgs.Builder.px(6_000)));
        a.step();
        assertEquals(List.of(0), a.held(), "its own lease back, not another instance's");
        a.close();
    }

    /** An instance that dies gives nothing back; the survivor takes its share as soon as its leases lapse (one lease time). */
    @Test
    void aSurvivorTakesADeadInstancesShareWhenItsLeasesLapse() {
        String prefix = RedisTestSupport.prefix();
        Readers r = new Readers();
        LeaseManager a = new LeaseManager(conn.async, prefix, "td", 8, "a", 1_000, r.of("a"));
        LeaseManager b = new LeaseManager(conn.async, prefix, "td", 8, "b", 1_000, r.of("b"));
        a.step();
        b.step();
        a.step();
        b.step();
        assertEquals(4, a.held().size());
        assertEquals(4, b.held().size());
        long start = System.currentTimeMillis(); // a dies here: no more heartbeats or renewals
        b.start();
        waitFor(() -> b.held().size() == 8);
        assertTrue(System.currentTimeMillis() - start <= 2_500, "took over after " + (System.currentTimeMillis() - start) + " ms");
        b.close();
        a.close(); // stops the dead instance's readers in this JVM; its leases are b's now, so nothing is released
    }

    static void waitFor(BooleanSupplier ok) {
        long deadline = System.currentTimeMillis() + 5_000;
        while (!ok.getAsBoolean()) {
            assertTrue(System.currentTimeMillis() < deadline, "timed out");
            sleep(20);
        }
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
