package in.craves.userchef.supportchat;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.springframework.stereotype.Component;

/**
 * Per-user budget for model calls: a burst cap per minute and a daily cap, so one account cannot run up
 * the Claude bill or exhaust the workspace spend limit for everyone. APIM Consumption has no rate-limit-by-key.
 */
@Component
public class SupportChatLimiter {
    static final int PER_MINUTE = 6;
    static final int PER_DAY = 40;
    static final long MINUTE_MILLIS = 60_000;
    static final long DAY_MILLIS = 86_400_000;
    static final int MAX_TRACKED = 20_000;

    // shortcut: counters live in each replica (user-chef runs at most 2), so real caps are up to 2x;
    // move them to Redis or Postgres if User/Chef scales out further.
    private final ConcurrentHashMap<UUID, Usage> usage = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public SupportChatLimiter() {
        this(System::currentTimeMillis);
    }

    SupportChatLimiter(LongSupplier clock) {
        this.clock = clock;
    }

    /** Admits one message, or throws {@link Limited} with the seconds until the user may send again. */
    public void admit(UUID user) {
        long now = clock.getAsLong();
        long minute = now - Math.floorMod(now, MINUTE_MILLIS);
        long day = now - Math.floorMod(now, DAY_MILLIS);
        if (usage.size() >= MAX_TRACKED && !usage.containsKey(user)) {
            usage.values().removeIf(entry -> entry.day() != day);
        }
        Usage current = usage.compute(user, (ignored, previous) -> {
            boolean sameDay = previous != null && previous.day() == day;
            boolean sameMinute = sameDay && previous.minute() == minute;
            return new Usage(day, sameDay ? previous.today() + 1 : 1, minute, sameMinute ? previous.thisMinute() + 1 : 1);
        });
        if (current.today() > PER_DAY) {
            throw new Limited(seconds(day + DAY_MILLIS - now), true);
        }
        if (current.thisMinute() > PER_MINUTE) {
            throw new Limited(seconds(minute + MINUTE_MILLIS - now), false);
        }
    }

    int tracked() {
        return usage.size();
    }

    private static int seconds(long millis) {
        return (int) Math.max(1, (millis + 999) / 1000);
    }

    private record Usage(long day, int today, long minute, int thisMinute) {
    }

    public static final class Limited extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final int retryAfterSeconds;
        private final boolean daily;

        Limited(int retryAfterSeconds, boolean daily) {
            super("Support chat budget exhausted", null, false, false);
            this.retryAfterSeconds = retryAfterSeconds;
            this.daily = daily;
        }

        public int retryAfterSeconds() {
            return retryAfterSeconds;
        }

        public boolean daily() {
            return daily;
        }
    }
}
