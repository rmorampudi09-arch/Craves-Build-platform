package in.craves.fleetengine;

import in.craves.fleetengine.lease.LeaseManager;
import in.craves.fleetengine.support.Latency;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The engine's counters (Micrometer, also at /actuator/metrics on the container) and the line it logs once a minute for Log
 * Analytics (docs/riders/SCALE.md, "Watching the engine"): every figure covers the minute since the previous line, so a slow
 * minute shows at once instead of being averaged into everything since the engine started.
 */
public final class EngineStats {
    private static final Logger LOG = LoggerFactory.getLogger(EngineStats.class);
    public static final String RIDER_EVENTS = "fleet.engine.rider.events";
    public static final String RIDER_EVENTS_MALFORMED = "fleet.engine.rider.events.malformed";
    public static final String RIDER_EVENTS_FAILED = "fleet.engine.rider.events.failed";
    public static final String REQUESTS = "fleet.engine.dispatch.requests";
    public static final String EXPIRED = "fleet.engine.dispatch.expired";
    public static final String SHED = "fleet.engine.dispatch.shed";
    public static final String MALFORMED = "fleet.engine.dispatch.malformed";
    public static final String REPLIES = "fleet.engine.dispatch.replies";
    public static final String FAILED = "fleet.engine.dispatch.failed";
    public static final String SHADOW_SAME = "fleet.engine.shadow.same";
    public static final String SHADOW_SAME_SET = "fleet.engine.shadow.same_set";
    public static final String SHADOW_DIFFER = "fleet.engine.shadow.differ";
    public static final String JOINT_CHANGED = "fleet.engine.joint.changed";
    public static final String ETA_MISSING = "fleet.engine.eta.missing";

    private final MeterRegistry registry;
    private final Latency lag;
    private final Latency reply;
    private final Latency.Window lagWindow;
    private final Latency.Window replyWindow;
    private final Map<String, Double> last = new HashMap<>();

    /** lag: rider events, stream to write; reply: live requests, request to reply. */
    public EngineStats(MeterRegistry registry, Latency lag, Latency reply) {
        this.registry = registry;
        this.lag = lag;
        this.reply = reply;
        this.lagWindow = lag.window();
        this.replyWindow = reply.window();
    }

    public Latency lag() {
        return lag;
    }

    public Latency reply() {
        return reply;
    }

    /** The minute's line: FLEET_ENGINE_STATS key=value ..., as the other Craves services log; partitions as 0,3,7. */
    public String line(List<Integer> riderPartitions, List<Integer> dispatchPartitions) {
        double lagP99 = lagWindow.next(0.99)[1];
        double[] r = replyWindow.next(0.5, 0.99);
        return "FLEET_ENGINE_STATS riderPartitions=" + joined(riderPartitions) + " dispatchPartitions=" + joined(dispatchPartitions)
            + " riderEvents=" + delta(RIDER_EVENTS) + " riderEventLagP99Ms=" + (long) lagP99
            + " requests=" + delta(REQUESTS) + " replies=" + delta(REPLIES) + " replyP50Ms=" + (long) r[1] + " replyP99Ms=" + (long) r[2]
            + " expired=" + delta(EXPIRED) + " shed=" + delta(SHED) + " malformed=" + delta(MALFORMED) + " failed=" + delta(FAILED)
            + " riderEventsMalformed=" + delta(RIDER_EVENTS_MALFORMED) + " riderEventsFailed=" + delta(RIDER_EVENTS_FAILED)
            + " shadowSame=" + delta(SHADOW_SAME) + " shadowSameSet=" + delta(SHADOW_SAME_SET) + " shadowDiffer=" + delta(SHADOW_DIFFER)
            + " jointChanged=" + delta(JOINT_CHANGED) + " etaMissing=" + delta(ETA_MISSING);
    }

    /** Logs the line every minute until stopping counts down. */
    public void run(LeaseManager riders, LeaseManager requests, CountDownLatch stopping) {
        try {
            while (!stopping.await(60, TimeUnit.SECONDS)) {
                LOG.info(line(riders.held(), requests.held()));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String joined(List<Integer> partitions) {
        return partitions.isEmpty() ? "none" : partitions.stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    private long delta(String name) {
        double v = registry.counter(name).count();
        double d = v - last.getOrDefault(name, 0.0);
        last.put(name, v);
        return (long) d;
    }
}
