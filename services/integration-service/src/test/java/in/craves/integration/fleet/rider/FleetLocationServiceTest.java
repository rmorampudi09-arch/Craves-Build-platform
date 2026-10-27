package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.rider.FleetLocationService.Context;
import in.craves.integration.fleet.rider.FleetRiderModels.ActiveTrip;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.trip.FleetTripModels;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FleetLocationServiceTest {
    static final Instant T = Instant.parse("2026-10-20T13:00:00Z");
    static final UUID SHIFT = UUID.randomUUID();
    static final UUID RIDER = UUID.randomUUID();
    static final UUID TRIP = UUID.randomUUID();

    @Test
    void inZoneTimeCountsGapsBetweenNonMockFixesInsideTheSlotAtMostAMinuteEach() {
        List<RiderFix> fixes = List.of(fix(20, false), fix(30, false), fix(40, true), fix(50, false), fix(200, false));
        assertThat(FleetLocationService.inZoneSeconds(T.plusSeconds(10), false, fixes, T.minusSeconds(3600), T.plusSeconds(3600)))
            .as("10 + 10, nothing either side of the mock fix, 60 of the 150 s gap").isEqualTo(80);
        assertThat(FleetLocationService.inZoneSeconds(T.plusSeconds(10), false, fixes, null, null)).as("no slot running").isZero();
        assertThat(FleetLocationService.inZoneSeconds(null, false, List.of(fix(0, false), fix(10, false)), T.minusSeconds(60), T.plusSeconds(60)))
            .as("the first fix of a shift starts the count").isEqualTo(10);
        assertThat(FleetLocationService.inZoneSeconds(T, true, List.of(fix(10, false)), T.minusSeconds(60), T.plusSeconds(60)))
            .as("after a stored mock fix").isZero();
        assertThat(FleetLocationService.inZoneSeconds(T, false, List.of(fix(10, false), fix(20, false)), T.plusSeconds(5), T.plusSeconds(15)))
            .as("clipped to the slot").isEqualTo(10);
    }

    /** Blueprint A6: with ageMs the database clock times the fix, capped at an hour; without it the phone's stamp stays. */
    @Test
    void ageMsTimesAFixByTheServerClockAndIsCappedAtAnHour() {
        assertThat(FleetLocationService.timed(new RiderFix(17.44, 78.39, 8.0, T.plusSeconds(600), false, 2000L), T).at())
            .as("a phone clock 10 minutes fast").isEqualTo(T.minusMillis(2000));
        assertThat(FleetLocationService.timed(new RiderFix(17.44, 78.39, 8.0, null, false, 99_999_999L), T).at()).isEqualTo(T.minusSeconds(3600));
        assertThat(FleetLocationService.timed(new RiderFix(17.44, 78.39, 8.0, T.minusSeconds(9), false, -5L), T).at()).isEqualTo(T);
        assertThat(FleetLocationService.timed(fix(10, false), T)).as("no ageMs: the phone's stamp").isEqualTo(fix(10, false));
        assertThat(FleetLocationService.timed(null, T)).isNull();
    }

    @Test
    void healthLeavesOutWhatThePhoneDidNotSendAndKeepsTheExitReasonToOneShortLine() {
        FleetLocationService service = new FleetLocationService(null, new com.fasterxml.jackson.databind.ObjectMapper(),
            in.craves.integration.fleet.FleetDatabase.properties(true));
        assertThat(service.health(null)).isNull();
        assertThat(service.health(new FleetRiderModels.DeviceHealth(81, null, null, true, null, null, null, null, null)))
            .isEqualTo("{\"batteryPct\":81,\"canRing\":true}");
        assertThat(FleetLocationService.oneLine("CRASH\nat line 2\u0000")).isEqualTo("CRASH at line 2");
        assertThat(FleetLocationService.oneLine("x".repeat(500))).hasSize(200);
    }

    @Test
    void thePollSettingStaysWithinFiveToThirtySeconds() {
        assertThat(List.of(1, 5, 10, 30, 600).stream().map(FleetLocationService::pollSeconds).toList()).containsExactly(5, 5, 10, 30, 30);
    }

    @Test
    void onlySaneFixesFromTheShiftAndNotFromTheFutureAreUsed() {
        Instant start = T.minusSeconds(3600);
        assertThat(FleetLocationService.usable(fix(0, false), start, T)).isTrue();
        assertThat(FleetLocationService.usable(fix(299, false), start, T)).as("phone clock a little ahead").isTrue();
        assertThat(FleetLocationService.usable(fix(301, false), start, T)).isFalse();
        assertThat(FleetLocationService.usable(fix(-3601, false), start, T)).as("before the shift").isFalse();
        assertThat(FleetLocationService.usable(new RiderFix(91.0, 78.0, 5.0, T, false), start, T)).isFalse();
        assertThat(FleetLocationService.usable(new RiderFix(17.0, Double.NaN, 5.0, T, false), start, T)).isFalse();
        assertThat(FleetLocationService.usable(new RiderFix(17.0, 78.0, null, T, false), start, T)).isFalse();
        assertThat(FleetLocationService.usable(new RiderFix(17.0, 78.0, 5.0, null, false), start, T)).isFalse();
    }

    @Test
    void theRiderStatusComesBeforeTheShiftsOwnEnd() {
        assertThat(FleetLocationService.stopReason(context("ACTIVE", null, null, false))).isNull();
        assertThat(FleetLocationService.stopReason(context("SUSPENDED", T, null, true))).startsWith("Your account can't take orders");
        assertThat(FleetLocationService.stopReason(context("ACTIVE", T, T, true))).startsWith("You're offline");
        assertThat(FleetLocationService.stopReason(context("ACTIVE", null, T, true))).contains("approved phone");
        assertThat(FleetLocationService.stopReason(context("ACTIVE", null, null, true))).contains("12 hours");
    }

    @Test
    void theTripInProgressOrTheOneThatJustEndedIsReported() {
        assertThat(FleetLocationService.activeTrip(trip(TRIP, "ASSIGNED", 1, null, null, null)))
            .isEqualTo(new ActiveTrip(TRIP.toString(), "TO_KITCHEN", 1));
        assertThat(FleetLocationService.activeTrip(trip(null, null, null, RIDER, "DELIVERED", SHIFT)))
            .isEqualTo(new ActiveTrip(TRIP.toString(), "DELIVERED", 4));
        assertThat(FleetLocationService.activeTrip(trip(null, null, null, UUID.randomUUID(), "AT_PICKUP", SHIFT)))
            .as("ops gave it to another rider").isEqualTo(new ActiveTrip(TRIP.toString(), "CANCELLED", 4));
        assertThat(FleetLocationService.activeTrip(trip(null, null, null, RIDER, "DELIVERED", UUID.randomUUID())))
            .as("from an earlier shift").isNull();
        assertThat(FleetLocationService.activeTrip(trip(null, null, null, RIDER, "SEARCHING", SHIFT)).step())
            .as("every step is a rider-v1 TripStep").isEqualTo("CANCELLED");
    }

    @Test
    void tripStatesMapOntoTheSevenRiderSteps() {
        assertThat(List.of("SEARCHING", "ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED", "CANCELLED").stream()
            .map(FleetTripModels::step).toList())
            .containsExactly("CANCELLED", "TO_KITCHEN", "AT_KITCHEN", "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED", "CANCELLED");
        assertThat(FleetTripModels.estMinutes(900, 4000)).as("dispatch's estimate, on /locations and the push alike").isEqualTo(20);
    }

    static RiderFix fix(int seconds, boolean mock) {
        return new RiderFix(17.44, 78.39, 8.0, T.plusSeconds(seconds), mock);
    }

    static Context context(String status, Instant ended, Instant revoked, boolean expired) {
        return new Context(SHIFT, T, ended, revoked, expired, RIDER, status, null, null, null, null, null, null, null, null, null, null, null,
            null, null, T);
    }

    static Context trip(UUID tripId, String state, Integer version, UUID lastTripRider, String lastState, UUID lastShift) {
        return new Context(SHIFT, T, null, null, false, RIDER, "ACTIVE", lastShift, T, false, lastTripRider == null ? null : TRIP, tripId, state,
            version, lastTripRider, lastState, lastTripRider == null ? null : 4, null, null, null, T);
    }
}
