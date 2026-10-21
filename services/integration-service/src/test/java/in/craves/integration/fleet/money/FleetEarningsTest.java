package in.craves.integration.fleet.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.integration.fleet.FleetApiException;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** The pay week, the IST day and TDS against the year to date. */
class FleetEarningsTest {
    @Test
    void theWeekRunsFromMondayMidnightToSundayMidnightIst() {
        // Sunday 25 Oct 2026, 23:59 IST belongs to the week that started Monday 19 Oct.
        FleetEarnings.Window sunday = FleetEarnings.window("week", Instant.parse("2026-10-25T18:29:00Z"));
        assertThat(sunday.from()).isEqualTo(Instant.parse("2026-10-18T18:30:00Z"));
        assertThat(sunday.to()).isEqualTo(Instant.parse("2026-10-25T18:30:00Z"));
        // A minute later it is Monday 26 Oct in Hyderabad: a new week, although it is still Sunday in UTC.
        FleetEarnings.Window monday = FleetEarnings.window("week", Instant.parse("2026-10-25T18:30:00Z"));
        assertThat(monday.from()).isEqualTo(Instant.parse("2026-10-25T18:30:00Z"));
        assertThat(monday.to()).isEqualTo(Instant.parse("2026-11-01T18:30:00Z"));
    }

    @Test
    void todayIsTheIstDay() {
        FleetEarnings.Window today = FleetEarnings.window("today", Instant.parse("2026-10-20T20:00:00Z")); // 01:30 IST on the 21st
        assertThat(today.from()).isEqualTo(Instant.parse("2026-10-20T18:30:00Z"));
        assertThat(today.to()).isEqualTo(Instant.parse("2026-10-21T18:30:00Z"));
        assertThatThrownBy(() -> FleetEarnings.window("month", Instant.now())).isInstanceOf(FleetApiException.class);
    }

    @Test
    void tdsIsWithheldAgainstTheYearToDateOnceTheThresholdIsCrossed() {
        // 1% (100 basis points) above ₹1,000 a year.
        assertThat(FleetEarnings.tdsDue(100_000, 0, 6_000, 100, 100_000)).as("at the threshold").isZero();
        // Crossing it withholds on the whole year so far, but never more than this credit.
        assertThat(FleetEarnings.tdsDue(104_000, 0, 6_000, 100, 100_000)).isEqualTo(1_040);
        assertThat(FleetEarnings.tdsDue(1_000_000, 0, 6_000, 100, 100_000)).as("capped at the credit").isEqualTo(6_000);
        assertThat(FleetEarnings.tdsDue(110_000, 1_040, 6_000, 100, 100_000)).as("only the difference").isEqualTo(60);
        assertThat(FleetEarnings.tdsDue(100_500, 1_040, 6_000, 100, 100_000)).as("never negative").isZero();
        assertThat(FleetEarnings.tdsDue(5_999, 0, 5_999, 100, 0)).as("paise round down").isEqualTo(59);
    }
}
