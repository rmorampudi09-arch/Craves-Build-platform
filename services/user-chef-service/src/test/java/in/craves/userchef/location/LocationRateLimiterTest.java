package in.craves.userchef.location;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.userchef.location.LocationRateLimiter.Kind;
import in.craves.userchef.location.LocationRateLimiter.Limited;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class LocationRateLimiterTest {
    private final AtomicLong now = new AtomicLong();
    private final LocationRateLimiter limiter = new LocationRateLimiter(now::get);
    private final UUID customer = UUID.randomUUID();

    private void spend(UUID who, Kind kind) {
        for (int i = 0; i < kind.perMinute(); i++) {
            limiter.admit(who, kind);
        }
    }

    @Test
    void admitsTheBudgetThenReportsSecondsUntilTheWindowResets() {
        now.set(600_000 + 10_000); // 10 s into a minute window
        spend(customer, Kind.REVERSE_GEOCODE);

        assertThatThrownBy(() -> limiter.admit(customer, Kind.REVERSE_GEOCODE))
            .isInstanceOfSatisfying(Limited.class, limited -> assertThat(limited.retryAfterSeconds()).isEqualTo(50));
    }

    @Test
    void customersAndCallKindsHaveSeparateBudgets() {
        now.set(600_000);
        spend(customer, Kind.REVERSE_GEOCODE);

        assertThatCode(() -> limiter.admit(UUID.randomUUID(), Kind.REVERSE_GEOCODE)).doesNotThrowAnyException();
        assertThatCode(() -> limiter.admit(customer, Kind.SEARCH)).doesNotThrowAnyException();
    }

    @Test
    void theBudgetResetsInTheNextWindow() {
        now.set(600_000);
        spend(customer, Kind.SEARCH);
        assertThatThrownBy(() -> limiter.admit(customer, Kind.SEARCH)).isInstanceOf(Limited.class);

        now.set(660_000);
        assertThatCode(() -> limiter.admit(customer, Kind.SEARCH)).doesNotThrowAnyException();
    }

    @Test
    void retryAfterIsAtLeastOneSecond() {
        now.set(659_999); // 1 ms before the window ends
        spend(customer, Kind.REVERSE_GEOCODE);

        assertThatThrownBy(() -> limiter.admit(customer, Kind.REVERSE_GEOCODE))
            .isInstanceOfSatisfying(Limited.class, limited -> assertThat(limited.retryAfterSeconds()).isEqualTo(1));
    }

    @Test
    void expiredWindowsAreDroppedWhenTheTableIsFull() {
        now.set(600_000);
        for (int i = 0; i < LocationRateLimiter.MAX_TRACKED; i++) {
            limiter.admit(UUID.randomUUID(), Kind.SEARCH);
        }
        assertThat(limiter.tracked()).isEqualTo(LocationRateLimiter.MAX_TRACKED);

        now.set(660_000);
        limiter.admit(customer, Kind.SEARCH);

        assertThat(limiter.tracked()).isEqualTo(1);
    }
}
