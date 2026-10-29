package in.craves.fleetengine.dispatch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.EngineStats;
import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.RedisTestSupport;
import in.craves.fleetengine.eta.EtaModels;
import in.craves.fleetengine.ingest.StreamReader;
import in.craves.fleetengine.live.LiveStore;
import in.craves.fleetengine.support.Latency;
import in.craves.fleetengine.wire.Wire;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class DispatchEngineTest {
    static final double KITCHEN_LAT = 17.4483;
    static final double KITCHEN_LNG = 78.3915;
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

    /** The longitude metres due east of the kitchen. */
    static double east(double metres) {
        return KITCHEN_LNG + metres / (111_194.93 * Math.cos(Math.toRadians(KITCHEN_LAT)));
    }

    record Setup(DispatchEngine engine, LiveStore store, MeterRegistry registry, String prefix) {
    }

    static Setup setup(LongSupplier clock) {
        String prefix = RedisTestSupport.prefix();
        LiveStore store = new LiveStore(prefix, 1_800_000);
        MeterRegistry registry = new SimpleMeterRegistry();
        DispatchEngine e = new DispatchEngine(new DispatchEngine.Config(5_000, 1_000_000_000L, 64, 64, 32, 50, 60_000), store, conn.async,
            new EtaModels(conn.async, prefix), registry, new Latency(), clock);
        return new Setup(e, store, registry, prefix);
    }

    static void online(LiveStore store, UUID id, double lng) {
        long now = System.currentTimeMillis();
        Wire.RiderEvent e = new Wire.RiderEvent(id, Wire.PING, now, List.of(new Wire.Fix(KITCHEN_LAT, lng, now - 500, false, 5)),
            new Wire.State(new UUID(9, 9), now + 3_600_000, true, false, 0, 0, false, 0, 0, null, null, 0, true, now, null, 0), null);
        assertEquals(0, store.apply(conn.async, List.of(e)).errors());
    }

    static Wire.DispatchReply reply(LiveStore store, UUID id) {
        byte[] v = RedisSetup.await(conn.async.get(store.replyKey(id)));
        assertNotNull(v, "no reply");
        return Wire.decodeReply(v);
    }

    static Wire.Policy policy(int radiusM, int offersAtOnce, boolean joint) {
        return new Wire.Policy(radiusM, 140, offersAtOnce, 0, 40, false, joint, false, "");
    }

    static Wire.DispatchRequest live(UUID id, long now, double kitchenLng, Wire.Policy policy) {
        return new Wire.DispatchRequest(id, Wire.LIVE, null, now, now + 5_000, KITCHEN_LAT, kitchenLng, 17.46, 78.36, 3000, policy,
            List.of(), List.of(), 1);
    }

    /**
     * Two orders at once, 1.7 km apart: rider 1 is 200 m from kitchen A and 1.5 km from B; rider 2 is 500 m from A and 2.2 km
     * from B, past B's 2 km radius. First come, A takes rider 1 and B gets nobody; shared out, both get a rider.
     */
    @Test
    void ordersAskedTogetherAreSharedOutWhenTheRulesSaySo() {
        for (boolean joint : new boolean[] {false, true}) {
            Setup s = setup(System::currentTimeMillis);
            UUID r1 = new UUID(0, 1);
            UUID r2 = new UUID(0, 2);
            online(s.store(), r1, east(200));
            online(s.store(), r2, east(-500));
            long now = System.currentTimeMillis();
            Wire.DispatchRequest a = live(new UUID(1, 1), now, KITCHEN_LNG, policy(2000, 1, joint));
            Wire.DispatchRequest b = live(new UUID(1, 2), now + 1, east(1700), policy(2000, 1, joint));
            s.engine().process(List.of(a, b), 0);
            Wire.DispatchReply ra = reply(s.store(), a.requestId());
            Wire.DispatchReply rb = reply(s.store(), b.requestId());
            if (joint) {
                assertEquals(r2, ra.riders().get(0).riderId());
                assertTrue(ra.riders().get(0).held());
                assertEquals(1, rb.riders().size());
                assertEquals(r1, rb.riders().get(0).riderId());
                assertTrue(rb.riders().get(0).held());
                assertEquals(Wire.SOLVER_EXACT, ra.solver());
                assertEquals(2, ra.batchOrders());
                continue;
            }
            assertEquals(r1, ra.riders().get(0).riderId());
            assertTrue(ra.riders().get(0).held());
            assertTrue(rb.riders().isEmpty());
            // A's reply also lists rider 2, not held, in case rider 1's offer can't be made.
            assertEquals(2, ra.riders().size());
            assertEquals(r2, ra.riders().get(1).riderId());
            assertFalse(ra.riders().get(1).held());
            // Shared out, both orders would differ: A would give rider 1 to B and take rider 2.
            assertEquals(2, s.registry().counter(EngineStats.JOINT_CHANGED).count(), 0.0);
            s.engine().close();
        }
    }

    /**
     * A request whose numbers would make the engine misbehave (a negative capacity, a continent-wide radius, no coordinates,
     * an unknown mode, a cut-off payload) is counted as malformed and dropped; the requests around it are answered.
     */
    @Test
    void aRequestOutOfBoundsIsRefusedAndTheRestAnswered() throws InterruptedException {
        Setup s = setup(System::currentTimeMillis);
        online(s.store(), new UUID(0, 1), east(200));
        long now = System.currentTimeMillis();
        Wire.Policy good = policy(2000, 1, false);
        List<Wire.DispatchRequest> bad = List.of(
            live(new UUID(2, 1), now, KITCHEN_LNG, new Wire.Policy(2000, 140, -1, 0, 40, false, false, false, "")),
            live(new UUID(2, 2), now, KITCHEN_LNG, new Wire.Policy(Integer.MAX_VALUE, 140, 1, 0, 40, false, false, false, "")),
            new Wire.DispatchRequest(new UUID(2, 3), Wire.LIVE, null, now, now + 5_000, Double.NaN, KITCHEN_LNG, 17.46, 78.36, 3000, good,
                List.of(), List.of(), 1),
            new Wire.DispatchRequest(new UUID(2, 4), 7, null, now, now + 5_000, KITCHEN_LAT, KITCHEN_LNG, 17.46, 78.36, 3000, good,
                List.of(), List.of(), 1));
        List<StreamReader.Entry> entries = new ArrayList<>();
        for (Wire.DispatchRequest q : bad) {
            entries.add(new StreamReader.Entry("1-0", Wire.encode(q)));
        }
        entries.add(new StreamReader.Entry("1-1", new byte[] {0x0A, 3, 1, 2, 3}));
        entries.add(new StreamReader.Entry("1-2", null));
        Wire.DispatchRequest ok = live(new UUID(2, 9), now, KITCHEN_LNG, good);
        entries.add(new StreamReader.Entry("2-0", Wire.encode(ok)));
        s.engine().handle(null, entries);
        long deadline = System.currentTimeMillis() + 5_000;
        while (RedisSetup.await(conn.async.exists(s.store().replyKey(ok.requestId()))) == 0) {
            assertTrue(System.currentTimeMillis() < deadline, "the good request was not answered");
            Thread.sleep(10);
        }
        assertEquals(6, s.registry().counter(EngineStats.MALFORMED).count(), 0.0);
        s.engine().close();
    }

    /** A solve that ends after integration-service stopped waiting holds nobody and writes no reply. */
    @Test
    void aLateSolveHoldsNobody() {
        long base = System.currentTimeMillis();
        AtomicInteger calls = new AtomicInteger();
        Setup s = setup(() -> calls.incrementAndGet() == 1 ? base : base + 1_000); // on time at the start, late by the reply
        UUID r1 = new UUID(0, 1);
        online(s.store(), r1, east(200));
        Wire.DispatchRequest q = new Wire.DispatchRequest(new UUID(1, 7), Wire.LIVE, null, base, base + 300, KITCHEN_LAT, KITCHEN_LNG,
            17.46, 78.36, 3000, policy(2000, 1, false), List.of(), List.of(), 1);
        s.engine().process(List.of(q), 0);
        assertNull(RedisSetup.await(conn.async.get(s.store().replyKey(q.requestId()))), "a reply nobody reads was written");
        assertTrue(s.store().hold(conn.async, new UUID(1, 8), List.of(r1), base, base + 5_000)[0], "the rider was kept for nobody");
        assertEquals(1, s.registry().counter(EngineStats.EXPIRED).count(), 0.0);
    }

    /** A shadow request is compared with Java's ranking and counted; no hold, no reply. */
    @Test
    void shadowRequestsAreComparedWithJavasRanking() {
        Setup s = setup(System::currentTimeMillis);
        UUID r1 = new UUID(0, 1);
        UUID r2 = new UUID(0, 2);
        online(s.store(), r1, east(200));
        online(s.store(), r2, east(900));
        long now = System.currentTimeMillis();
        List<Wire.Candidate> java = List.of(new Wire.Candidate(r1, 200, 0, 0, false, 0, 0, 0, false),
            new Wire.Candidate(r2, 900, 0, 0, false, 0, 0, 0, false));
        Wire.DispatchRequest same = new Wire.DispatchRequest(new UUID(3, 1), Wire.SHADOW, new UUID(4, 1), now, 0, KITCHEN_LAT,
            KITCHEN_LNG, 17.46, 78.36, 3000, policy(2000, 2, false), List.of(), java, 1);
        Wire.DispatchRequest swapped = new Wire.DispatchRequest(new UUID(3, 2), Wire.SHADOW, new UUID(4, 2), now, 0, KITCHEN_LAT,
            KITCHEN_LNG, 17.46, 78.36, 3000, policy(2000, 2, false), List.of(), List.of(java.get(1), java.get(0)), 1);
        s.engine().process(List.of(same), 0);
        s.engine().process(List.of(swapped), 0);
        assertEquals(1, s.registry().counter(EngineStats.SHADOW_SAME).count(), 0.0);
        assertEquals(1, s.registry().counter(EngineStats.SHADOW_SAME_SET).count(), 0.0);
        assertNull(RedisSetup.await(conn.async.get(s.store().replyKey(same.requestId()))));
        assertTrue(s.store().hold(conn.async, new UUID(1, 9), List.of(r1), now, now + 5_000)[0], "shadow held a rider");
    }

    /**
     * A request naming a travel-time model that isn't in Redis is left to integration-service: no reply live (it ranks by the
     * model itself), no comparison in shadow, counted. Once published, the model is loaded by the next request after 2
     * seconds and ranks it.
     */
    @Test
    void aTravelTimeModelRanksFromItsFirstRequestAndAMissingOneLeavesTheOrderToJava() {
        AtomicLong clock = new AtomicLong(System.currentTimeMillis());
        Setup s = setup(clock::get);
        UUID eastNear = new UUID(0, 1);
        UUID westFar = new UUID(0, 2);
        online(s.store(), eastNear, east(300)); // the model below: east of the kitchen takes 9 minutes, west of it 2
        online(s.store(), westFar, east(-1200));
        // No offers at once: nobody is held, so each reply lists every rider in the engine's order.
        Wire.Policy eta = new Wire.Policy(2000, 140, 0, 0, 40, false, false, true, "dt1");
        UUID early = new UUID(5, 1);
        s.engine().process(List.of(live(early, clock.get(), KITCHEN_LNG, eta)), 0);
        assertNull(RedisSetup.await(conn.async.get(s.store().replyKey(early))), "ranked by distance an order Java ranks by the model");
        List<Wire.Candidate> java = List.of(new Wire.Candidate(westFar, 1200, 0, 0, false, 0, 0, 0, false));
        s.engine().process(List.of(new Wire.DispatchRequest(new UUID(5, 2), Wire.SHADOW, new UUID(6, 2), clock.get(), 0, KITCHEN_LAT,
            KITCHEN_LNG, 17.46, 78.36, 3000, eta, List.of(), java, 1)), 0);
        assertEquals(0, s.registry().counter(EngineStats.SHADOW_SAME).count() + s.registry().counter(EngineStats.SHADOW_SAME_SET).count()
            + s.registry().counter(EngineStats.SHADOW_DIFFER).count(), 0.0, "compared distance with the model");
        assertEquals(2, s.registry().counter(EngineStats.ETA_MISSING).count(), 0.0);

        String json = """
            {"format":1,"version":"dt1","features":["metres","from_lat","from_lng","to_lat","to_lng","bearing_sin","bearing_cos",
             "ist_hour","ist_weekday","leg"],"init":0,"learning_rate":1,
             "trees":[{"feature":[2,0,0],"threshold":[78.3915,0,0],"left":[1,-1,-1],"right":[2,-1,-1],"value":[0,2,9]}]}""";
        RedisSetup.await(conn.async.set(EtaModels.key(s.prefix(), "dt1").getBytes(StandardCharsets.UTF_8),
            json.getBytes(StandardCharsets.UTF_8)));
        UUID soon = new UUID(5, 3);
        s.engine().process(List.of(live(soon, clock.get(), KITCHEN_LNG, eta)), 0);
        assertNull(RedisSetup.await(conn.async.get(s.store().replyKey(soon))), "looked again within 2 seconds");
        clock.addAndGet(EtaModels.RETRY_MS);
        UUID later = new UUID(5, 4);
        s.engine().process(List.of(live(later, clock.get(), KITCHEN_LNG, eta)), 0);
        assertEquals(westFar, reply(s.store(), later).riders().get(0).riderId(), "soonest at the kitchen first (2 minutes against 9)");
        assertEquals(3, s.registry().counter(EngineStats.ETA_MISSING).count(), 0.0);
        s.engine().close();
    }
}
