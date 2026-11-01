package in.craves.fleetengine.eta;

import in.craves.fleetengine.RedisSetup;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The travel-time models requests ask for (Policy.etaModel), loaded from Redis: integration-service publishes a version to
 * &lt;prefix&gt;model:eta:&lt;version&gt; (FleetEta) before it names it in a request, and a version never changes once
 * published. The first request naming a version loads it there and then (a GET and a parse, once per version), so the
 * engine never ranks by distance an order integration-service ranks by the model. The last few versions loaded stay, so two
 * revisions naming different versions during a deploy don't make it reload. A version that can't be had is looked for again
 * at most every 2 seconds; the requests naming it meanwhile are left to integration-service (DispatchEngine).
 */
public final class EtaModels {
    private static final Logger LOG = LoggerFactory.getLogger(EtaModels.class);
    public static final long RETRY_MS = 2_000;
    static final int KEPT = 4;

    private final RedisClusterAsyncCommands<byte[], byte[]> redis;
    private final String prefix;
    private final ReentrantLock loading = new ReentrantLock(); // not synchronized: block actors are virtual threads
    /** Replaced, never changed, so actors read it without the lock; oldest loaded first. */
    private volatile Map<String, EtaModel> loaded = Map.of();
    private final Map<String, Long> missing = new HashMap<>(); // under loading: version -> when it was last looked for

    public EtaModels(RedisClusterAsyncCommands<byte[], byte[]> redis, String prefix) {
        this.redis = redis;
        this.prefix = prefix;
    }

    public static String key(String prefix, String version) {
        return prefix + "model:eta:" + version;
    }

    /** The model of that version, loaded now if need be; null when it can't be had (not in Redis, or refused). */
    public EtaModel forVersion(String version, long nowMs) {
        if (version == null || version.isEmpty()) {
            return null;
        }
        EtaModel m = loaded.get(version);
        if (m != null) {
            return m;
        }
        loading.lock();
        try {
            m = loaded.get(version);
            if (m != null) {
                return m; // loaded by another block while this one waited
            }
            Long tried = missing.get(version);
            if (tried != null && nowMs - tried < RETRY_MS) {
                return null;
            }
            m = load(version);
            missing.values().removeIf(at -> nowMs - at >= RETRY_MS);
            if (m == null) {
                missing.put(version, nowMs);
                return null;
            }
            missing.remove(version);
            Map<String, EtaModel> next = new LinkedHashMap<>(loaded);
            next.put(version, m);
            if (next.size() > KEPT) {
                next.remove(next.keySet().iterator().next());
            }
            loaded = next;
            return m;
        } finally {
            loading.unlock();
        }
    }

    /** The version from Redis, checked; null when it isn't there or can't be evaluated. */
    EtaModel load(String version) {
        try {
            byte[] json = RedisSetup.await(redis.get(key(prefix, version).getBytes(StandardCharsets.UTF_8)));
            if (json == null) {
                LOG.warn("FLEET_ENGINE_ETA_MISSING version={} key={}", version, key(prefix, version));
                return null;
            }
            EtaModel model = EtaModel.parse(new String(json, StandardCharsets.UTF_8));
            if (!model.version().equals(version)) {
                LOG.warn("FLEET_ENGINE_ETA_REFUSED version={} reason=holds version {}", version, model.version());
                return null;
            }
            LOG.info("FLEET_ENGINE_ETA_LOADED version={}", version);
            return model;
        } catch (RuntimeException e) {
            LOG.warn("FLEET_ENGINE_ETA_REFUSED version={} reason={}", version, e.getMessage());
            return null;
        }
    }
}
