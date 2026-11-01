package in.craves.fleetengine.ingest;

import in.craves.fleetengine.EngineStats;
import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.live.LiveStore;
import in.craves.fleetengine.support.Latency;
import in.craves.fleetengine.wire.Wire;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Applies one rider partition's events to the live state, a batch at a time, on the partition reader's connection. */
public final class RiderEvents implements StreamReader.Handler {
    private static final Logger LOG = LoggerFactory.getLogger(RiderEvents.class);

    private final LiveStore store;
    private final Latency lag;
    private final Counter applied;
    private final Counter malformed;
    private final Counter failed;

    /** lag: from an event entering the stream to its write, shared by every partition. */
    public RiderEvents(LiveStore store, MeterRegistry registry, Latency lag) {
        this.store = store;
        this.lag = lag;
        this.applied = registry.counter(EngineStats.RIDER_EVENTS);
        this.malformed = registry.counter(EngineStats.RIDER_EVENTS_MALFORMED);
        this.failed = registry.counter(EngineStats.RIDER_EVENTS_FAILED);
    }

    @Override
    public void handle(RedisSetup.Conn conn, List<StreamReader.Entry> entries) {
        List<Wire.RiderEvent> events = new ArrayList<>(entries.size());
        for (StreamReader.Entry entry : entries) {
            Wire.RiderEvent e;
            try {
                e = entry.payload() == null ? null : Wire.decodeRiderEvent(entry.payload());
            } catch (IllegalArgumentException x) {
                e = null;
            }
            if (e == null || e.riderId() == null || e.kind() < Wire.PING || e.kind() > Wire.OFFLINE) {
                malformed.increment();
                continue;
            }
            events.add(e);
        }
        if (events.isEmpty()) {
            return;
        }
        // The reader's own connection, used by this thread alone: the batch's commands go out together.
        LiveStore.Applied res;
        conn.holdWrites(true);
        try {
            res = store.apply(conn.async, events, conn::flush);
        } finally {
            try {
                conn.holdWrites(false);
                conn.flush(); // anything a failed batch left held
            } catch (RuntimeException closed) {
                // closed under the batch (its lease handed over): the reader stops or opens a new connection
            }
        }
        applied.increment(Math.max(0, res.events() - res.errors()));
        if (res.errors() > 0) {
            failed.increment(res.errors());
            LOG.warn("FLEET_ENGINE_APPLY_FAILED events={} errors={} first={}", res.events(), res.errors(),
                res.firstError() == null ? "" : res.firstError().toString());
        }
        long done = System.currentTimeMillis();
        for (StreamReader.Entry entry : entries) {
            lag.observe(done - StreamReader.entryMs(entry.id()));
        }
    }
}
