package in.craves.fleetengine.dispatch;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.RedisTestSupport;
import in.craves.fleetengine.assign.Assign;
import in.craves.fleetengine.eta.EtaModel;
import in.craves.fleetengine.eta.EtaModels;
import in.craves.fleetengine.live.LiveStore;
import in.craves.fleetengine.rules.Rider;
import in.craves.fleetengine.rules.Rules;
import in.craves.fleetengine.support.Latency;
import in.craves.fleetengine.wire.Wire;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.function.LongSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * The engine's benchmarks: the figures marked measured in docs/riders/SCALE.md. Skipped unless asked for:
 * <pre>mvn -B -ntp test -Dfleet.bench=true -Dtest=EngineBenchmarkTest</pre>
 * Each figure is the median of 5 timed runs after 3 warm-up runs, printed as one "BENCH name figure" line. The Redis
 * figures use a redis-server the test starts on the same machine. -Dfleet.bench.model=model.json ranks with that travel-time
 * model instead of the golden one (60 trees; production versions have 200).
 */
@EnabledIfSystemProperty(named = "fleet.bench", matches = "true")
class EngineBenchmarkTest {
    static final double KITCHEN_LAT = 17.4483;
    static final double KITCHEN_LNG = 78.3915;
    static final double METRES_LAT = 1 / 111_194.93;
    static volatile long sink;

    /** The median nanoseconds per op over 5 timed runs of ops ops each, after 3 warm-up runs. */
    static double nsPerOp(int ops, LongSupplier op) {
        double[] runs = new double[5];
        for (int run = -3; run < runs.length; run++) {
            long acc = 0;
            long start = System.nanoTime();
            for (int i = 0; i < ops; i++) {
                acc += op.getAsLong();
            }
            long took = System.nanoTime() - start;
            sink += acc;
            if (run >= 0) {
                runs[run] = (double) took / ops;
            }
        }
        Arrays.sort(runs);
        return runs[runs.length / 2];
    }

    static void report(String name, String figure) {
        System.out.println("BENCH " + name + " " + figure);
    }

    /** This JVM's CPU time so far (all its threads, Lettuce's I/O threads and the JIT included; not redis-server's). */
    static long cpuNanos() {
        return ((com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean()).getProcessCpuTime();
    }

    static Rider free(int n, double metresNorth, long now) {
        Rider r = new Rider();
        r.id = new UUID(0, n + 1);
        r.lat = KITCHEN_LAT + metresNorth * METRES_LAT;
        r.lng = KITCHEN_LNG;
        r.fixMs = now - 5_000;
        r.seenMs = now - 3_000;
        r.hasShift = true;
        r.shiftEndsMs = now + 3_600_000;
        r.active = true;
        r.testAllowed = true;
        r.hasStanding = true;
        r.istDay = Rules.istDay(now);
        r.standAtMs = now;
        r.accruing = true;
        r.earnedPaise = n * 1_000L;
        r.onlineSeconds = 3_600;
        return r;
    }

    static Wire.DispatchRequest request(UUID id, long now, double lat, double lng, Wire.Policy policy) {
        return new Wire.DispatchRequest(id, Wire.LIVE, null, now, now + 5_000, lat, lng, 17.46, 78.36, 3000, policy, List.of(),
            List.of(), 1);
    }

    static EtaModel model() throws Exception {
        String path = System.getProperty("fleet.bench.model", "");
        if (!path.isBlank()) {
            return EtaModel.parse(Files.readString(Path.of(path)));
        }
        JsonNode golden = new ObjectMapper().readTree(Files.readString(Path.of("../../ml/fleet-eta/testdata/golden.json")));
        return EtaModel.parse(golden.get("model").toString());
    }

    @Test
    void codecRulesAndMatching() throws Exception {
        byte[] ping = HexFormat.of().parseHex(Files.readString(Path.of("../../contracts/proto/craves/fleet/v1/testdata/rider_event_ping.hex"))
            .strip());
        report("decodePing", String.format("%.0f ns/op, %d bytes", nsPerOp(200_000, () -> Wire.decodeRiderEvent(ping).atMs()),
            ping.length));

        long now = System.currentTimeMillis();
        List<Rider> riders = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            riders.add(free(i, i * 20.0, now));
        }
        Wire.Policy fair = new Wire.Policy(5000, 140, 3, 1500, 40, false, false, false, "");
        Wire.DispatchRequest q = request(new UUID(1, 1), now, KITCHEN_LAT, KITCHEN_LNG, fair);
        assertEquals(200, Rules.rank(q, riders, now, null).size());
        report("rank200Riders", String.format("%.1f us/op (fair band 1.5 km)",
            nsPerOp(20_000, () -> Rules.rank(q, riders, now, null).size()) / 1_000));

        EtaModel model = model();
        Wire.Policy eta = new Wire.Policy(5000, 140, 3, 1500, 40, false, false, true, model.version());
        Wire.DispatchRequest qe = request(new UUID(1, 2), now, KITCHEN_LAT, KITCHEN_LNG, eta);
        assertEquals(200, Rules.rank(qe, riders, now, model).size());
        report("rank200RidersEta", String.format("%.1f us/op (travel-time model %s on the %d nearest)",
            nsPerOp(5_000, () -> Rules.rank(qe, riders, now, model).size()) / 1_000, model.version(), EtaModel.RANKED));
        double[] row = EtaModel.features(EtaModel.PICKUP, 17.4483, 78.3915, 17.46, 78.36, now);
        report("etaPredict", String.format("%.0f ns/op (%s)", nsPerOp(200_000, () -> (long) model.predict(row)), model.version()));

        Random rnd = new Random(1);
        List<Rider> pool = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            Rider r = new Rider();
            r.id = new UUID(0, i + 1);
            pool.add(r);
        }
        List<Integer> all = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            all.add(i);
        }
        List<Assign.Order> orders = new ArrayList<>();
        for (int o = 0; o < 40; o++) {
            Collections.shuffle(all, rnd);
            List<Rules.Ranked> ranked = new ArrayList<>();
            for (int i : all.subList(0, 40)) {
                Rules.Ranked x = new Rules.Ranked(pool.get(i), rnd.nextInt(5000), null);
                x.inBand = true;
                x.perHourPaise = (i % 7) * 1_000L;
                x.freeSinceMs = i;
                ranked.add(x);
            }
            orders.add(new Assign.Order(3, ranked));
        }
        report("joint40Orders200Riders", String.format("%.2f ms/op (exact)",
            nsPerOp(50, () -> Assign.joint(orders, 1_000_000_000L).solver()) / 1_000_000));
    }

    static Wire.RiderEvent ping(UUID id, long at, double lat, double lng) {
        return new Wire.RiderEvent(id, Wire.PING, at, List.of(new Wire.Fix(lat, lng, at - 500, false, 5)),
            new Wire.State(new UUID(9, 9), at + 3_600_000, true, false, 0, 0, false, 0, 0, null, null, 0, true, at, null, 0), null);
    }

    /** {ns per op, ns of this JVM's CPU per op}: a warm-up pass, then nsPerOp while the CPU clock runs. */
    static double[] withCpu(int ops, LongSupplier op) {
        nsPerOp(ops, op);
        long cpu = cpuNanos();
        long wall = System.nanoTime();
        double ns = nsPerOp(ops, op);
        double share = (double) (cpuNanos() - cpu) / (System.nanoTime() - wall);
        return new double[] {ns, ns * share};
    }

    @Test
    void redisApplyAndBlockActor() {
        RedisSetup redis = RedisSetup.connect(RedisTestSupport.server());
        RedisSetup.Conn conn = redis.open();
        RedisSetup.Conn reader = redis.open();
        try {
            String prefix = RedisTestSupport.prefix();
            LiveStore store = new LiveStore(prefix, 1_800_000);
            long at = System.currentTimeMillis();
            long[] tick = {0};
            List<Wire.RiderEvent> batch = new ArrayList<>(256);
            reader.holdWrites(true); // as RiderEvents runs on a reader's own connection
            for (double moveM : new double[] {0, 60}) {
                double[] r = withCpu(50, () -> {
                    tick[0]++;
                    batch.clear();
                    for (int j = 0; j < 256; j++) {
                        double lat = 17.4 + (j % 50) * 0.002 + (tick[0] % 2) * moveM / 111_195.0;
                        batch.add(ping(new UUID(7, j), at + tick[0] * 10, lat, 78.35));
                    }
                    return store.apply(reader.async, batch, reader::flush).errors();
                });
                assertEquals(0, store.apply(reader.async, batch, reader::flush).errors());
                report(moveM == 0 ? "applyPingsWaiting" : "applyPingsMoving", String.format("%.0f events/s (batches of 256%s), %.1f us of "
                    + "engine CPU an event", 256 / r[0] * 1e9, moveM == 0 ? ", riders waiting" : ", riders 60 m from their last ping",
                    r[1] / 256 / 1_000));
            }

            long now = System.currentTimeMillis();
            List<Wire.RiderEvent> online = new ArrayList<>();
            for (int i = 0; i < 200; i++) {
                online.add(ping(new UUID(8, i), now, KITCHEN_LAT + (i % 20 - 10) * 0.002, KITCHEN_LNG + (i / 20 - 5) * 0.002));
            }
            assertEquals(0, store.apply(conn.async, online).errors());
            DispatchEngine engine = new DispatchEngine(new DispatchEngine.Config(5_000, 20_000_000, 64, 64, 32, 50, 60_000), store,
                conn.async, new EtaModels(conn.async, prefix), new SimpleMeterRegistry(), new Latency(), System::currentTimeMillis);
            Wire.Policy policy = new Wire.Policy(5000, 140, 3, 1500, 40, false, true, false, "");
            long[] n = {0};
            double[] r = withCpu(40, () -> {
                n[0]++;
                long t = System.currentTimeMillis();
                List<Wire.DispatchRequest> orders = new ArrayList<>(16);
                for (int i = 0; i < 16; i++) {
                    orders.add(request(new UUID(n[0], i), t, KITCHEN_LAT + (i % 4) * 0.003, KITCHEN_LNG + (i / 4) * 0.003, policy));
                }
                engine.process(orders, 0);
                return orders.size();
            });
            report("processABatch", String.format("%.0f orders/s (16 live orders, 200 riders, joint, fair band 1.5 km), %.0f us of engine "
                + "CPU an order", 16 / r[0] * 1e9, r[1] / 16 / 1_000));
            engine.close();
        } finally {
            reader.close();
            conn.close();
            redis.close();
        }
    }
}
