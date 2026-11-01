package in.craves.integration.fleet.engine;

import in.craves.integration.fleet.engine.EngineStreams.Entry;
import in.craves.integration.fleet.engine.FleetEngineWire.Candidate;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchReply;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchRequest;
import in.craves.integration.fleet.engine.FleetEngineWire.Policy;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Live dispatch through the fleet engine (craves.fleet.engine.mode live; docs/riders/SCALE.md, "Live"). FleetDispatcher asks
 * the engine to rank riders for an order and waits at most replyTimeoutMs (300 ms by default); the engine holds the riders
 * it names for a few seconds, so an order asked at the same moment doesn't get them too. Without an answer in time (or
 * for 30 s after 5 failures in a row) dispatch ranks riders itself, as it always has: the engine can make dispatch faster
 * and fairer but never stops it. Postgres keeps the last word on every offer (one ACTIVE offer per rider).
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetEngineClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetEngineClient.class);
    static final int FAILURES_TO_PAUSE = 5;
    static final Duration PAUSE = Duration.ofSeconds(30);
    /** How often the reply is looked for; the engine usually answers within a few milliseconds. */
    static final long POLL_MS = 5;

    private final FleetEngineProperties properties;
    private final EngineStreams streams;
    private final AtomicInteger failures = new AtomicInteger();
    private volatile long pausedUntilMs;

    public FleetEngineClient(FleetEngineProperties properties, EngineStreams streams) {
        this.properties = properties;
        this.streams = streams;
    }

    /** craves.fleet.engine.mode live. */
    public boolean live() {
        return properties.live();
    }

    /** craves.fleet.engine.joint: share out orders asked at once (DISPATCH.md: a rules change, 14 days' notice to riders first). */
    public boolean joint() {
        return properties.joint();
    }

    /**
     * The riders for an order, in the order they would hear of it, held for it for a few seconds; empty when the engine
     * didn't answer in time, is paused, or live is off. exclude: riders already offered this order.
     */
    public Optional<List<Candidate>> rank(UUID orderId, double kitchenLat, double kitchenLng, double dropLat, double dropLng, int dropM,
                                          Policy policy, Collection<UUID> exclude, int round) {
        long now = System.currentTimeMillis();
        if (!properties.live() || now < pausedUntilMs) {
            return Optional.empty();
        }
        UUID requestId = UUID.randomUUID();
        long deadline = now + properties.replyTimeoutMs();
        String prefix = properties.keyPrefix();
        String stream = FleetEngineWire.dispatchStream(prefix, FleetEngineWire.blockPartition(FleetEngineWire.block(kitchenLat, kitchenLng),
            properties.dispatchPartitions()));
        DispatchRequest request = new DispatchRequest(requestId, FleetEngineWire.LIVE, orderId, now, deadline, kitchenLat, kitchenLng, dropLat,
            dropLng, dropM, policy, List.copyOf(exclude), List.of(), round);
        try {
            streams.append(List.of(new Entry(stream, FleetEngineWire.encode(request))), Duration.ofSeconds(properties.streamKeepSeconds()),
                left(deadline));
            String key = FleetEngineWire.replyKey(prefix, requestId);
            while (System.currentTimeMillis() < deadline) {
                byte[] answer = streams.get(key, left(deadline));
                if (answer != null) {
                    DispatchReply reply = FleetEngineWire.decodeReply(answer);
                    if (!requestId.equals(reply.requestId())) {
                        throw new IllegalStateException("The reply is for request " + reply.requestId());
                    }
                    failures.set(0);
                    return Optional.of(reply.riders());
                }
                Thread.sleep(Math.min(POLL_MS, Math.max(0, deadline - System.currentTimeMillis())));
            }
            failed(orderId, "TIMEOUT");
        } catch (InterruptedException stop) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException failure) {
            failed(orderId, failure.toString());
        }
        return Optional.empty();
    }

    private static Duration left(long deadline) {
        return Duration.ofMillis(Math.max(1, deadline - System.currentTimeMillis()));
    }

    private void failed(UUID orderId, String reason) {
        LOGGER.warn("FLEET_ENGINE_FALLBACK chefSubOrderId={} reason={}", orderId, reason);
        if (failures.incrementAndGet() >= FAILURES_TO_PAUSE) {
            failures.set(0);
            pausedUntilMs = System.currentTimeMillis() + PAUSE.toMillis();
            LOGGER.error("CRAVES_ALERT alert=FLEET_ENGINE_PAUSED failures={} seconds={} (dispatch ranks riders itself meanwhile)",
                FAILURES_TO_PAUSE, PAUSE.toSeconds());
        }
    }
}
