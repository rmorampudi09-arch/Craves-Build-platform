package in.craves.userchef.supportchat;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class SupportChatLimiterTest {
    private final AtomicLong now = new AtomicLong();
    private final SupportChatLimiter limiter = new SupportChatLimiter(now::get);
    private final UUID user = UUID.randomUUID();

    @Test
    void capsBurstsPerMinuteAndSaysWhenToRetry() {
        now.set(SupportChatLimiter.DAY_MILLIS * 100 + 10_000); // 10 s into a minute
        for (int i = 0; i < SupportChatLimiter.PER_MINUTE; i++) {
            limiter.admit(user);
        }
        var limited = assertThrows(SupportChatLimiter.Limited.class, () -> limiter.admit(user));
        assertEquals(50, limited.retryAfterSeconds());
        assertFalse(limited.daily());

        now.addAndGet(50_000);
        assertDoesNotThrow(() -> limiter.admit(user));
    }

    @Test
    void capsMessagesPerDayEvenWhenSpreadOut() {
        now.set(SupportChatLimiter.DAY_MILLIS * 100);
        for (int i = 0; i < SupportChatLimiter.PER_DAY; i++) {
            limiter.admit(user);
            now.addAndGet(SupportChatLimiter.MINUTE_MILLIS);
        }
        var limited = assertThrows(SupportChatLimiter.Limited.class, () -> limiter.admit(user));
        assertTrue(limited.daily());

        now.set(SupportChatLimiter.DAY_MILLIS * 101);
        assertDoesNotThrow(() -> limiter.admit(user));
    }

    @Test
    void usersHaveSeparateBudgets() {
        now.set(SupportChatLimiter.DAY_MILLIS * 100);
        for (int i = 0; i < SupportChatLimiter.PER_MINUTE; i++) {
            limiter.admit(user);
        }
        assertDoesNotThrow(() -> limiter.admit(UUID.randomUUID()));
        assertEquals(2, limiter.tracked());
    }
}
