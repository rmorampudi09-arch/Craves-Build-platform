package in.craves.integration.delivery.provider;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

/**
 * Calls this replica has made to each courier's API, and how many were answered HTTP 429, since they were last drained.
 * In memory only, so counting cannot fail or slow a call. IntegrationAlertMonitor drains them into
 * delivery_schema.provider_api_usage when CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED is on; off, nothing reads them.
 * shortcut: a replica that stops loses the calls it has not yet handed over (at most one monitor interval).
 */
public final class CourierApiUsage {
    private static final Map<String, LongAdder> CALLS = new ConcurrentHashMap<>();
    private static final Map<String, LongAdder> RATE_LIMITED = new ConcurrentHashMap<>();

    private CourierApiUsage() {}

    /** One HTTP request is about to be sent to the courier. */
    public static void call(String providerId) {
        add(CALLS, providerId, 1);
    }

    /** The courier answered a request with HTTP 429. */
    public static void rateLimited(String providerId) {
        add(RATE_LIMITED, providerId, 1);
    }

    /** Calls that could not be written, to be counted with the next drain. */
    public static void putBack(String providerId, long calls) {
        add(CALLS, providerId, calls);
    }

    public static Map<String, Long> drainCalls() {
        return drain(CALLS);
    }

    public static Map<String, Long> drainRateLimited() {
        return drain(RATE_LIMITED);
    }

    private static void add(Map<String, LongAdder> counters, String providerId, long count) {
        counters.computeIfAbsent(providerId, key -> new LongAdder()).add(count);
    }

    private static Map<String, Long> drain(Map<String, LongAdder> counters) {
        Map<String, Long> drained = new HashMap<>();
        counters.forEach((providerId, counter) -> {
            long count = counter.sumThenReset();
            if (count > 0) {
                drained.put(providerId, count);
            }
        });
        return drained;
    }
}
