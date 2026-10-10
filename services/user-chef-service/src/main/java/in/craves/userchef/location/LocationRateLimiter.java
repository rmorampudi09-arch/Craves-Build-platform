package in.craves.userchef.location;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.springframework.stereotype.Component;

/**
 * Per-customer budget for the metered Ola Maps calls behind the mobile address APIs.
 * APIM Consumption has no rate-limit-by-key, so the service enforces it, like the web BFF.
 */
@Component
public class LocationRateLimiter {
    public enum Kind {
        SEARCH(60),
        REVERSE_GEOCODE(30);

        private final int perMinute;

        Kind(int perMinute) {
            this.perMinute = perMinute;
        }

        public int perMinute() {
            return perMinute;
        }
    }

    static final long WINDOW_MILLIS = 60_000;
    static final int MAX_TRACKED = 10_000;

    // shortcut: counters live in each replica, so the effective budget scales with the replica count;
    // move them to a shared store if User/Chef runs many replicas.
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public LocationRateLimiter() {
        this(System::currentTimeMillis);
    }

    LocationRateLimiter(LongSupplier clock) {
        this.clock = clock;
    }

    /** Admits one call, or throws {@link Limited} with the seconds until the customer's minute window resets. */
    public void admit(UUID customer, Kind kind) {
        long now = clock.getAsLong();
        long windowStart = now - Math.floorMod(now, WINDOW_MILLIS);
        String key = kind.name() + ':' + customer;
        if (windows.size() >= MAX_TRACKED && !windows.containsKey(key)) {
            windows.values().removeIf(window -> window.start() != windowStart);
            if (windows.size() >= MAX_TRACKED) {
                return; // Memory stays bounded even if an unusual number of customers is active in one minute.
            }
        }
        Window window = windows.compute(key, (ignored, current) ->
            current == null || current.start() != windowStart
                ? new Window(windowStart, 1)
                : new Window(windowStart, current.count() + 1));
        if (window.count() > kind.perMinute()) {
            long millisLeft = windowStart + WINDOW_MILLIS - now;
            throw new Limited((int) ((millisLeft + 999) / 1000));
        }
    }

    int tracked() {
        return windows.size();
    }

    private record Window(long start, int count) {
    }

    public static final class Limited extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final int retryAfterSeconds;

        public Limited(int retryAfterSeconds) {
            super("Location lookup budget exhausted", null, false, false);
            this.retryAfterSeconds = Math.max(1, Math.min(60, retryAfterSeconds));
        }

        public int retryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
