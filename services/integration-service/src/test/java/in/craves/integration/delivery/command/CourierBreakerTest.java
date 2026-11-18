package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateRejectedException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import java.sql.SQLException;
import java.time.Instant;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

/** The shared breaker without a database: what counts as a failure, the switch, and a database that cannot be reached. */
class CourierBreakerTest {
    @Test
    void aBookingCountsAgainstTheCourierOnlyWhenTheCourierIsUnwell() {
        assertThat(CourierBreaker.bookingHealth(uncertain(new IllegalStateException("Borzo returned HTTP 503",
            new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE))))).isFalse();
        assertThat(CourierBreaker.bookingHealth(uncertain(new IllegalStateException("Borzo API could not be reached",
            new ResourceAccessException("Read timed out"))))).isFalse();
        assertThat(CourierBreaker.bookingHealth(uncertain(new IllegalStateException("Provider returned no delivery identifier")))).isFalse();
        assertThat(CourierBreaker.bookingHealth(new ProviderCreateRejectedException("borzo", false, "Borzo refused the booking: x",
            new IllegalStateException("Borzo returned HTTP 429", new HttpClientErrorException(HttpStatus.TOO_MANY_REQUESTS))))).isFalse();
        // The order's own refusal says nothing about the courier, whichever exception carries it.
        assertThat(CourierBreaker.bookingHealth(new ProviderCreateRejectedException("borzo", true, "Borzo refused the booking: invalid_parameters",
            new IllegalStateException("Borzo returned HTTP 400", new HttpClientErrorException(HttpStatus.BAD_REQUEST))))).isNull();
        assertThat(CourierBreaker.bookingHealth(uncertain(new IllegalStateException("Borzo returned HTTP 422",
            new HttpClientErrorException(HttpStatus.UNPROCESSABLE_ENTITY))))).isNull();
        assertThat(CourierBreaker.bookingHealth(new ProviderCreateRejectedException("borzo", true, "Borzo refused the booking: invalid_parameters",
            new IllegalStateException("Borzo create-order was rejected")))).isNull();
        assertThat(CourierBreaker.bookingHealth(new IllegalArgumentException("Pidge requires measured weight"))).isNull();
    }

    @Test
    void whenTheRowCannotBeReadTheCourierIsCalledAndNothingIsThrown() throws SQLException {
        DataSource down = mock(DataSource.class);
        when(down.getConnection()).thenThrow(new SQLException("connection refused"));
        CourierBreaker breaker = new CourierBreaker(new JdbcTemplate(down), 3, 5, 30);

        CourierBreaker.Pass pass = breaker.admit("borzo");

        assertThat(pass.refused()).isFalse();
        assertThat(pass.dirty()).as("a success is not written to a database that is down").isFalse();
        breaker.quoted(pass, Boolean.FALSE);
        breaker.booked(pass, Boolean.FALSE);
        breaker.booked(new CourierBreaker.Pass("borzo", false, true, false), Boolean.TRUE);
        breaker.quoted(new CourierBreaker.Pass("borzo", false, true, false), Boolean.TRUE);
    }

    @Test
    void existsOnlyWhenSwitchedOnAndRefusesSettingsBelowOne() {
        ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(JdbcTemplate.class, () -> new JdbcTemplate(mock(DataSource.class)))
            .withUserConfiguration(CourierBreaker.class);

        runner.run(context -> assertThat(context).doesNotHaveBean(CourierBreaker.class));
        runner.withPropertyValues("craves.courier-breaker.enabled=true")
            .run(context -> assertThat(context).hasSingleBean(CourierBreaker.class));
        JdbcTemplate jdbc = new JdbcTemplate(mock(DataSource.class));
        assertThatThrownBy(() -> new CourierBreaker(jdbc, 0, 5, 30)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CourierBreaker(jdbc, 3, 0, 30)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CourierBreaker(jdbc, 3, 5, 0)).isInstanceOf(IllegalArgumentException.class);
    }

    private static ProviderCreateUncertainException uncertain(Throwable cause) {
        return new ProviderCreateUncertainException("borzo", "ref", Instant.now(), cause);
    }
}
