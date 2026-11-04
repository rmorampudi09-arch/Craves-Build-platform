package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import in.craves.integration.delivery.command.ProviderGuard.ProviderRefusedException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ProviderGuardTest {
    private static final Duration DEADLINE = Duration.ofSeconds(4);
    private static final ProviderQuote QUOTE = new ProviderQuote("borzo", true, null, null, "INR", List.of(),
        JsonNodeFactory.instance.objectNode(), Instant.EPOCH);

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-03T10:00:00Z"));
    private final ProviderGuard guard = new ProviderGuard(3, Duration.ofSeconds(30), 2, clock);
    private final AtomicInteger calls = new AtomicInteger();

    @Test
    void opensAfterThreeFailedQuotesInARowAndThenRefusesWithoutCallingTheProvider() {
        failTimes("borzo", 3);

        assertThatThrownBy(() -> guard.quote("borzo", counted(() -> QUOTE), DEADLINE))
            .isInstanceOf(ProviderRefusedException.class).hasMessageContaining("circuit open");
        assertThat(calls).hasValue(3);
        assertThat(guard.quote("pidge", () -> QUOTE, DEADLINE)).isSameAs(QUOTE);
    }

    @Test
    void aGoodQuoteResetsTheCount() {
        failTimes("borzo", 2);
        assertThat(guard.quote("borzo", () -> QUOTE, DEADLINE)).isSameAs(QUOTE);
        failTimes("borzo", 2);

        assertThat(guard.quote("borzo", counted(() -> QUOTE), DEADLINE)).isSameAs(QUOTE);
    }

    @Test
    void afterTheOpenTimeOneProbeDecides() {
        failTimes("borzo", 3);
        clock.advance(Duration.ofSeconds(31));

        assertThatThrownBy(() -> guard.quote("borzo", () -> { throw new IllegalStateException("Borzo returned HTTP 503"); }, DEADLINE))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> guard.quote("borzo", counted(() -> QUOTE), DEADLINE))
            .isInstanceOf(ProviderRefusedException.class);

        clock.advance(Duration.ofSeconds(31));
        assertThat(guard.quote("borzo", () -> QUOTE, DEADLINE)).isSameAs(QUOTE);
        assertThat(guard.quote("borzo", counted(() -> QUOTE), DEADLINE)).isSameAs(QUOTE);
        assertThat(calls).hasValue(4);
    }

    @Test
    void onlyOneProbeAtATime() {
        failTimes("borzo", 3);
        clock.advance(Duration.ofSeconds(31));

        ProviderQuote probe = guard.quote("borzo", () -> {
            assertThatThrownBy(() -> guard.quote("borzo", () -> QUOTE, DEADLINE))
                .isInstanceOf(ProviderRefusedException.class).hasMessageContaining("circuit open");
            return QUOTE;
        }, DEADLINE);

        assertThat(probe).isSameAs(QUOTE);
    }

    @Test
    void aQuoteSlowerThanTheDeadlineCountsAsAFailure() {
        for (int i = 0; i < 3; i++) {
            assertThat(guard.quote("borzo", () -> {
                clock.advance(Duration.ofSeconds(5));
                return QUOTE;
            }, DEADLINE)).isSameAs(QUOTE);
        }

        assertThatThrownBy(() -> guard.quote("borzo", () -> QUOTE, DEADLINE)).isInstanceOf(ProviderRefusedException.class);
    }

    @Test
    void oneOrdersRefusalsAndASwitchedOffProviderDoNotCount() {
        List<RuntimeException> refusals = List.of(
            new IllegalArgumentException("no pickup"),
            new IllegalStateException("Pidge API HTTP 400 (NOT_SERVICEABLE)"),
            new IllegalStateException("Borzo calculate-order was rejected"),
            new IllegalStateException("Borzo new bookings are disabled"),
            new IllegalStateException("Pidge API is disabled or credentials are missing"));
        for (int round = 0; round < 2; round++) {
            for (RuntimeException refusal : refusals) {
                assertThatThrownBy(() -> guard.quote("borzo", () -> { throw refusal; }, DEADLINE)).isSameAs(refusal);
            }
        }

        assertThat(guard.quote("borzo", () -> QUOTE, DEADLINE)).isSameAs(QUOTE);
    }

    @Test
    void anErrorAfterTheDeadlineCountsEvenWhenItLooksLikeARefusal() {
        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> guard.quote("pidge", () -> {
                clock.advance(Duration.ofSeconds(5));
                throw new IllegalStateException("Pidge request interrupted");
            }, DEADLINE)).isInstanceOf(IllegalStateException.class);
        }

        assertThatThrownBy(() -> guard.quote("pidge", () -> QUOTE, DEADLINE)).isInstanceOf(ProviderRefusedException.class);
    }

    @Test
    void countsOnlySignsThatTheProviderIsUnwell() {
        assertThat(ProviderGuard.health(new IllegalStateException("Borzo API could not be reached",
            new ResourceAccessException("I/O error", new java.net.SocketTimeoutException("Read timed out"))))).isFalse();
        assertThat(ProviderGuard.health(new IllegalStateException("x", new java.io.IOException("reset")))).isFalse();
        assertThat(ProviderGuard.health(new IllegalStateException("Borzo returned HTTP 503",
            new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE)))).isFalse();
        assertThat(ProviderGuard.health(new HttpClientErrorException(HttpStatus.TOO_MANY_REQUESTS))).isFalse();
        assertThat(ProviderGuard.health(new IllegalStateException("Borzo returned HTTP 400",
            new HttpClientErrorException(HttpStatus.BAD_REQUEST)))).isNull();
        assertThat(ProviderGuard.health(new ShiprocketApiException(502, "Shiprocket failed", false))).isFalse();
        assertThat(ProviderGuard.health(new ShiprocketApiException(422, "Shiprocket refused", false))).isNull();
        assertThat(ProviderGuard.health(new IllegalStateException("Pidge API HTTP 502 (UNCLASSIFIED)"))).isFalse();
        assertThat(ProviderGuard.health(new IllegalStateException("Pidge response was not received"))).isFalse();
        assertThat(ProviderGuard.health(new IllegalStateException("Pidge reported an API error (NOT_SERVICEABLE)"))).isNull();
    }

    @Test
    void refusesAQuoteBeyondTheConcurrencyLimitWithoutCountingIt() {
        ProviderQuote outer = guard.quote("borzo", () -> guard.quote("borzo", () -> {
            assertThatThrownBy(() -> guard.quote("borzo", () -> QUOTE, DEADLINE))
                .isInstanceOf(ProviderRefusedException.class).hasMessageContaining("busy");
            return QUOTE;
        }, DEADLINE), DEADLINE);

        assertThat(outer).isSameAs(QUOTE);
        failTimes("borzo", 2);
        assertThat(guard.quote("borzo", () -> QUOTE, DEADLINE)).isSameAs(QUOTE);
    }

    @Test
    void refusesSettingsThatCannotWork() {
        assertThatThrownBy(() -> new ProviderGuard(0, Duration.ofSeconds(30), 8, clock)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProviderGuard(5, Duration.ZERO, 8, clock)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProviderGuard(5, Duration.ofSeconds(30), 0, clock)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void existsOnlyWhenSwitchedOnAndReadsItsSettings() {
        ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(context -> context.getBeanFactory().setConversionService(ApplicationConversionService.getSharedInstance()))
            .withBean(Clock.class, () -> clock)
            .withUserConfiguration(ProviderGuard.class);

        runner.run(context -> assertThat(context).doesNotHaveBean(ProviderGuard.class));
        runner.withPropertyValues("craves.provider-resilience.enabled=true", "craves.provider-resilience.failure-threshold=1",
                "craves.provider-resilience.open-duration=2m")
            .run(context -> {
                ProviderGuard fromSettings = context.getBean(ProviderGuard.class);
                assertThatThrownBy(() -> fromSettings.quote("borzo", () -> { throw new IllegalStateException("Borzo returned HTTP 503"); }, DEADLINE))
                    .isInstanceOf(IllegalStateException.class);
                clock.advance(Duration.ofSeconds(119));
                assertThatThrownBy(() -> fromSettings.quote("borzo", () -> QUOTE, DEADLINE)).isInstanceOf(ProviderRefusedException.class);
            });
    }

    private void failTimes(String providerId, int times) {
        for (int i = 0; i < times; i++) {
            assertThatThrownBy(() -> guard.quote(providerId, counted(() -> { throw new IllegalStateException("HTTP 502"); }), DEADLINE))
                .isInstanceOf(IllegalStateException.class);
        }
    }

    private Supplier<ProviderQuote> counted(Supplier<ProviderQuote> call) {
        return () -> {
            calls.incrementAndGet();
            return call.get();
        };
    }

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
