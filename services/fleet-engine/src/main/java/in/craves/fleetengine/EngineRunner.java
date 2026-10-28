package in.craves.fleetengine;

import in.craves.fleetengine.dispatch.DispatchEngine;
import in.craves.fleetengine.eta.EtaModels;
import in.craves.fleetengine.ingest.RiderEvents;
import in.craves.fleetengine.ingest.StreamReader;
import in.craves.fleetengine.lease.LeaseManager;
import in.craves.fleetengine.live.LiveStore;
import in.craves.fleetengine.support.Latency;
import in.craves.fleetengine.wire.Wire;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

/**
 * Runs the engine with the application: connects to Redis (retrying until it answers), then reads its share of the rider
 * and dispatch partitions until the application stops, when it gives its leases back so other instances take over without
 * waiting. Ready while Redis answered a PING in the last 10 seconds.
 */
public class EngineRunner implements SmartLifecycle {
    private static final Logger LOG = LoggerFactory.getLogger(EngineRunner.class);

    private final EngineSettings settings;
    private final MeterRegistry registry;
    private final Latency lag = new Latency();
    private final Latency reply = new Latency();
    private final CountDownLatch stopping = new CountDownLatch(1);
    private volatile boolean running;
    private volatile long redisOkAt;
    private Thread main;
    private RedisSetup redis;
    private volatile RedisSetup.Conn shared;
    private DispatchEngine engine;
    private LeaseManager riders;
    private LeaseManager requests;

    public EngineRunner(EngineSettings settings, MeterRegistry registry) {
        this.settings = settings;
        this.registry = registry;
    }

    @Override
    public void start() {
        running = true;
        main = Thread.ofVirtual().name("fleet-engine").start(this::run);
    }

    /**
     * Connects and starts, again after a backoff when anything after the connection fails (a node that refuses the
     * connection, a TLS failure), so a replica never stays up without reading.
     */
    private void run() {
        long wait = 1_000;
        while (stopping.getCount() > 0) {
            RedisSetup r = connect();
            if (r == null) {
                return;
            }
            try {
                start(r);
                return;
            } catch (RuntimeException e) {
                LOG.error("FLEET_ENGINE_START_FAILED error={} retryInMs={}", e.toString(), wait);
                closeAll();
            }
            try {
                if (stopping.await(wait, TimeUnit.MILLISECONDS)) {
                    return;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            wait = Math.min(2 * wait, 15_000);
        }
    }

    private void start(RedisSetup r) {
        String prefix = settings.prefix();
        redis = r;
        shared = r.open();
        LiveStore store = new LiveStore(prefix, settings.riderTtlMs());
        engine = new DispatchEngine(settings.dispatch(), store, shared.async, new EtaModels(shared.async, prefix), registry, reply,
            System::currentTimeMillis);
        new RiderEvents(store, registry, lag); // registers the rider counters before any partition is read
        riders = new LeaseManager(shared.async, prefix, "rq", settings.riderPartitions(), settings.instance(), settings.leaseMs(),
            (p, stop) -> {
                LOG.info("FLEET_ENGINE_PARTITION family=rq partition={}", p);
                StreamReader.read(r, Wire.riderStream(prefix, p), StreamReader.from(System.currentTimeMillis(), settings.replayMs()), 512,
                    new RiderEvents(store, registry, lag), stop);
            });
        requests = new LeaseManager(shared.async, prefix, "dq", settings.dispatchPartitions(), settings.instance(), settings.leaseMs(),
            (p, stop) -> {
                LOG.info("FLEET_ENGINE_PARTITION family=dq partition={}", p);
                // Requests older than 2 s are past any live deadline, and a shadow one that old compares against a moved world.
                StreamReader.read(r, Wire.dispatchStream(prefix, p), StreamReader.from(System.currentTimeMillis(), 2_000), 256, engine, stop);
            });
        riders.start();
        requests.start();
        Thread.ofVirtual().name("fleet-ping").start(this::ping);
        EngineStats stats = new EngineStats(registry, lag, reply);
        Thread.ofVirtual().name("fleet-stats").start(() -> stats.run(riders, requests, stopping));
        LOG.info("FLEET_ENGINE_STARTED instance={} riderPartitions={} dispatchPartitions={} redis={} redisCluster={} redisShards={}",
            settings.instance(), settings.riderPartitions(), settings.dispatchPartitions(), r.address(), r.cluster(), r.shards());
        if (r.shards() > 1) {
            // GO-LIVE.md section 9: integration-service's Redis client is standalone and reaches the keys of one shard only.
            LOG.warn("FLEET_ENGINE_REDIS_SHARDS shards={} keep=CRAVES_FLEET_ENGINE_MODE_off_until_integration-service_runs_in_cluster_mode",
                r.shards());
        }
    }

    /** Connects, retrying with backoff up to 15 s apart; null when the application stops first. */
    private RedisSetup connect() {
        long wait = 1_000;
        while (stopping.getCount() > 0) {
            try {
                return RedisSetup.connect(settings.redisUrl());
            } catch (IllegalArgumentException e) {
                LOG.error("FLEET_ENGINE_REDIS_URL_INVALID error={}", e.getMessage());
            } catch (RuntimeException e) {
                LOG.warn("FLEET_ENGINE_REDIS_UNREACHABLE error={} retryInMs={}", e.toString(), wait);
            }
            try {
                if (stopping.await(wait, TimeUnit.MILLISECONDS)) {
                    return null;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
            wait = Math.min(2 * wait, 15_000);
        }
        return null;
    }

    private void ping() {
        try {
            do {
                try {
                    RedisSetup.Conn c = shared;
                    if (c != null && "PONG".equals(RedisSetup.await(c.async.ping()))) {
                        redisOkAt = System.currentTimeMillis();
                    }
                } catch (RuntimeException e) {
                    // not ready until Redis answers again
                }
            } while (!stopping.await(2, TimeUnit.SECONDS));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Redis answered a PING in the last 10 seconds. */
    public boolean ready() {
        return System.currentTimeMillis() - redisOkAt < 10_000;
    }

    @Override
    public void stop() {
        stopping.countDown();
        try {
            if (main != null) {
                main.join(15_000);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        closeAll();
        running = false;
        LOG.info("FLEET_ENGINE_STOPPED instance={}", settings.instance());
    }

    /** Closes whatever has started, in reverse order, so a failed start can begin again. */
    private synchronized void closeAll() {
        if (riders != null) {
            riders.close();
            riders = null;
        }
        if (requests != null) {
            requests.close();
            requests = null;
        }
        if (engine != null) {
            engine.close();
            engine = null;
        }
        if (shared != null) {
            shared.close();
            shared = null;
        }
        if (redis != null) {
            redis.close();
            redis = null;
        }
    }

    @Override
    public void stop(Runnable callback) {
        stop();
        callback.run();
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    @Override
    public int getPhase() {
        return Integer.MAX_VALUE; // started last, stopped first
    }
}
