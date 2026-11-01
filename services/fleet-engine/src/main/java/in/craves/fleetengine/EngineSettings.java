package in.craves.fleetengine;

import in.craves.fleetengine.dispatch.DispatchEngine;
import io.lettuce.core.RedisURI;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * The engine's settings, from FLEET_ENGINE_* (docs/riders/SCALE.md, "Settings"). The partition counts must equal
 * integration-service's CRAVES_FLEET_ENGINE_*_PARTITIONS. A bad value stops the engine at start with every problem named
 * (never the Redis URL itself: it holds the access key).
 */
public record EngineSettings(String redisUrl, String prefix, int riderPartitions, int dispatchPartitions, String instance,
                             long riderTtlMs, long leaseMs, long replayMs, DispatchEngine.Config dispatch) {

    /** get: an environment lookup, such as System::getenv or Spring's Environment::getProperty. */
    public static EngineSettings from(Function<String, String> get) {
        List<String> errors = new ArrayList<>();
        Reader r = new Reader(get, errors);
        String url = r.text("FLEET_ENGINE_REDIS_URL", "");
        if (url.isEmpty()) {
            errors.add("FLEET_ENGINE_REDIS_URL (redis://host:port or rediss://:key@host:port) is required");
        } else if (!url.startsWith("redis://") && !url.startsWith("rediss://")) {
            errors.add("FLEET_ENGINE_REDIS_URL must start with redis:// or rediss://");
        } else if (!url.startsWith("rediss://") && r.text("CRAVES_ENVIRONMENT", "").startsWith("prod")) {
            errors.add("FLEET_ENGINE_REDIS_URL must be rediss:// (TLS) in production: the access key would cross the network in clear");
        } else if (!parses(url)) {
            errors.add("FLEET_ENGINE_REDIS_URL is not a Redis URL with a host and port");
        }
        EngineSettings s = new EngineSettings(url,
            r.text("FLEET_ENGINE_KEY_PREFIX", "craves:fleet:"),
            (int) r.number("FLEET_ENGINE_RIDER_PARTITIONS", 16, 1, 1_024),
            (int) r.number("FLEET_ENGINE_DISPATCH_PARTITIONS", 16, 1, 1_024),
            r.text("FLEET_ENGINE_INSTANCE", hostname()),
            r.number("FLEET_ENGINE_RIDER_TTL_MS", 1_800_000, 60_000, 86_400_000),
            r.number("FLEET_ENGINE_LEASE_MS", 6_000, 1_000, 60_000),
            r.number("FLEET_ENGINE_REPLAY_MS", 60_000, 0, 600_000),
            new DispatchEngine.Config(
                r.number("FLEET_ENGINE_HOLD_MS", 5_000, 500, 60_000),
                r.number("FLEET_ENGINE_EXACT_LIMIT", 20_000_000, 0, 1_000_000_000),
                (int) r.number("FLEET_ENGINE_MAX_BATCH", 64, 1, 1_024),
                (int) r.number("FLEET_ENGINE_QUEUE_SIZE", 512, 1, 100_000),
                (int) r.number("FLEET_ENGINE_OVERLOAD_QUEUE", 128, 1, 100_000),
                (int) r.number("FLEET_ENGINE_REPLY_RIDERS", 50, 1, 500),
                300_000));
        if (s.dispatch().overloadQueue() > s.dispatch().queueSize()) {
            errors.add("FLEET_ENGINE_OVERLOAD_QUEUE must not be above FLEET_ENGINE_QUEUE_SIZE: a block would shed orders before "
                + "switching to greedy matching");
        }
        if (!errors.isEmpty()) {
            throw new IllegalStateException("fleet-engine settings: " + String.join("; ", errors));
        }
        return s;
    }

    /** The URL as Lettuce reads it, with a host; never echoed, since it holds the access key. */
    private static boolean parses(String url) {
        try {
            RedisURI uri = RedisURI.create(url);
            return uri.getHost() != null && !uri.getHost().isBlank() && uri.getPort() > 0;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String hostname() {
        String env = System.getenv("HOSTNAME"); // the replica's name on Azure Container Apps
        if (env != null && !env.isBlank()) {
            return env.strip();
        }
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return "fleet-engine";
        }
    }

    private record Reader(Function<String, String> get, List<String> errors) {
        String text(String name, String fallback) {
            String v = get.apply(name);
            return v == null || v.isBlank() ? fallback : v.strip(); // a secret store's trailing newline
        }

        long number(String name, long fallback, long lo, long hi) {
            String raw = text(name, "");
            if (raw.isEmpty()) {
                return fallback;
            }
            try {
                long v = Long.parseLong(raw);
                if (v >= lo && v <= hi) {
                    return v;
                }
            } catch (NumberFormatException ignored) {
                // reported below
            }
            errors.add(name + " must be a whole number from " + lo + " to " + hi);
            return fallback;
        }
    }
}
