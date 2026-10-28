package in.craves.fleetengine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.wire.Wire;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

/**
 * The whole engine on a three-node Redis cluster: integration-service's events and requests go in as stream entries and
 * replies come out in Redis, as in production.
 */
class EngineRunnerTest {
    static final double KITCHEN_LAT = 17.4483;
    static final double KITCHEN_LNG = 78.3915;
    static final double METRES_LAT = 1 / 111_194.93;

    @Test
    void theEngineAnswersLiveRequestsAndComparesShadowOnes() throws InterruptedException {
        String url = RedisTestSupport.cluster();
        String prefix = RedisTestSupport.prefix();
        EngineSettings settings = EngineSettings.from(Map.of("FLEET_ENGINE_REDIS_URL", url, "FLEET_ENGINE_LEASE_MS", "1500",
            "FLEET_ENGINE_INSTANCE", "test", "FLEET_ENGINE_KEY_PREFIX", prefix)::get);
        MeterRegistry registry = new SimpleMeterRegistry();
        EngineRunner runner = new EngineRunner(settings, registry);
        runner.start();
        RedisSetup redis = RedisSetup.connect(url);
        try (RedisSetup.Conn c = redis.open()) {
            waitFor(runner::ready);
            long now = System.currentTimeMillis();
            UUID near = new UUID(0x0001000000000000L, 1);
            UUID far = new UUID(0x0002000000000000L, 2);
            for (Object[] r : new Object[][] {{near, 300.0}, {far, 1200.0}}) {
                UUID id = (UUID) r[0];
                Wire.RiderEvent e = new Wire.RiderEvent(id, Wire.PING, now,
                    List.of(new Wire.Fix(KITCHEN_LAT + (double) r[1] * METRES_LAT, KITCHEN_LNG, now - 1_000, false, 5)),
                    new Wire.State(new UUID(9, 9), now + 3_600_000, true, false, 0, 0, false, 0, 0, null, null, 0, true, now, null, 0), null);
                xadd(c, Wire.riderStream(prefix, Wire.partition(id, settings.riderPartitions())), Wire.encode(e));
            }
            waitFor(() -> registry.counter(EngineStats.RIDER_EVENTS).count() == 2);

            Wire.Policy policy = new Wire.Policy(5000, 140, 1, 0, 40, false, false);
            String dq = Wire.dispatchStream(prefix, Wire.blockPartition(Wire.block(KITCHEN_LAT, KITCHEN_LNG), settings.dispatchPartitions()));
            Wire.DispatchRequest live = request(new UUID(7, 7), Wire.LIVE, policy, List.of());
            xadd(c, dq, Wire.encode(live));
            Wire.DispatchReply reply = waitReply(c, prefix, live.requestId());
            assertEquals(2, reply.riders().size());
            assertEquals(near, reply.riders().get(0).riderId());
            assertTrue(reply.riders().get(0).held());
            assertFalse(reply.riders().get(1).held());
            assertEquals(Wire.SOLVER_SINGLE, reply.solver());
            assertEquals(300, reply.riders().get(0).straightLineM(), 1);

            // A second order now: the nearest rider is held for the first for a few seconds, so it gets the other.
            Wire.DispatchRequest second = request(new UUID(7, 8), Wire.LIVE, policy, List.of());
            xadd(c, dq, Wire.encode(second));
            Wire.DispatchReply r2 = waitReply(c, prefix, second.requestId());
            assertEquals(1, r2.riders().size());
            assertEquals(far, r2.riders().get(0).riderId());
            assertTrue(r2.riders().get(0).held());

            // Past its deadline: integration-service has ranked it itself, so the engine skips it.
            long t = System.currentTimeMillis();
            Wire.DispatchRequest late = new Wire.DispatchRequest(new UUID(7, 9), Wire.LIVE, new UUID(3, 9), t, t - 1, KITCHEN_LAT,
                KITCHEN_LNG, 17.46, 78.36, 4200, policy, List.of(), List.of(), 1);
            xadd(c, dq, Wire.encode(late));

            // Shadow: the same ranking as Java's is counted as such (shadow ignores the live holds).
            Wire.Policy two = new Wire.Policy(5000, 140, 2, 0, 40, false, false);
            Wire.DispatchRequest shadow = request(new UUID(7, 10), Wire.SHADOW, two, List.of(
                new Wire.Candidate(near, 0, 0, 0, false, 0, 0, 0, false), new Wire.Candidate(far, 0, 0, 0, false, 0, 0, 0, false)));
            xadd(c, dq, Wire.encode(shadow));
            waitFor(() -> registry.counter(EngineStats.SHADOW_SAME).count() == 1 && registry.counter(EngineStats.EXPIRED).count() == 1);
            assertEquals(0, RedisSetup.await(c.async.exists(ascii(prefix + "reply:{" + Wire.hex(late.requestId()) + "}"))),
                "a late request got a reply");
        } finally {
            runner.stop();
            redis.close();
        }
        assertFalse(runner.isRunning());
    }

    static Wire.DispatchRequest request(UUID id, int mode, Wire.Policy policy, List<Wire.Candidate> java) {
        long t = System.currentTimeMillis();
        return new Wire.DispatchRequest(id, mode, new UUID(3, id.getLeastSignificantBits()), t, mode == Wire.LIVE ? t + 3_000 : 0,
            KITCHEN_LAT, KITCHEN_LNG, 17.46, 78.36, 4200, policy, List.of(), java, 1);
    }

    static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    static void xadd(RedisSetup.Conn c, String stream, byte[] payload) {
        RedisSetup.await(c.async.xadd(ascii(stream), Map.of(ascii("e"), payload)));
    }

    static Wire.DispatchReply waitReply(RedisSetup.Conn c, String prefix, UUID id) throws InterruptedException {
        byte[] key = ascii(prefix + "reply:{" + Wire.hex(id) + "}");
        long deadline = System.currentTimeMillis() + 10_000;
        while (true) {
            byte[] v = RedisSetup.await(c.async.get(key));
            if (v != null) {
                return Wire.decodeReply(v);
            }
            assertTrue(System.currentTimeMillis() < deadline, "no reply");
            Thread.sleep(25);
        }
    }

    static void waitFor(BooleanSupplier ok) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (!ok.getAsBoolean()) {
            assertTrue(System.currentTimeMillis() < deadline, "timed out");
            Thread.sleep(25);
        }
    }
}
