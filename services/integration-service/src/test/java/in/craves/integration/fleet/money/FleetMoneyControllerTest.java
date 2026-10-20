package in.craves.integration.fleet.money;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.money.FleetMoneyModels.EarningsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Line;
import in.craves.integration.fleet.money.FleetMoneyModels.TripEarning;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** The rider's money routes: RIDER only, rider-v1 shapes (optional fields left out), errors as {code, message}. */
@WebMvcTest(FleetMoneyController.class)
@ContextConfiguration(classes = {FleetMoneyController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetMoneyControllerTest {
    static final UUID RIDER = UUID.fromString("11111111-1111-4111-8111-111111111111");
    static final UUID TRIP = UUID.fromString("33333333-3333-4333-8333-333333333333");
    @Autowired MockMvc mvc;
    @MockBean FleetRiderService riders;
    @MockBean FleetEarnings earnings;
    @MockBean JwtVerifier verifier;
    final UUID identity = UUID.randomUUID();

    @BeforeEach
    void signIn() {
        when(verifier.verify("rider")).thenReturn(new CravesPrincipal(identity, "+919800000001", Set.of("RIDER")));
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919800000002", Set.of("CUSTOMER")));
        when(riders.riderId(identity)).thenReturn(RIDER);
    }

    @Test
    void onlyRidersSeeEarnings() throws Exception {
        mvc.perform(get("/api/v1/rider/earnings").param("range", "today")).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/v1/rider/earnings").param("range", "today").header("Authorization", "Bearer customer"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(earnings);
    }

    @Test
    void earningsAreAPageOfTripsWithTheRangeTotal() throws Exception {
        TripEarning credited = new TripEarning(TRIP.toString(), Instant.parse("2026-10-20T09:00:00Z"), "Madhapur", "Kondapur", "CREDITED",
            null, null, 6700, List.of(new Line("Base pay", 4000), new Line("Drop distance", 1980), new Line("Ride to the kitchen", 720)),
            1800, 4200, "2026-10-v1");
        when(earnings.earnings(RIDER, "week", null)).thenReturn(new EarningsPage("This week (Mon–Sun)", 6700, List.of(credited), null));
        mvc.perform(get("/api/v1/rider/earnings").param("range", "week").header("Authorization", "Bearer rider"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.rangeLabel").value("This week (Mon–Sun)")).andExpect(jsonPath("$.totalPaise").value(6700))
            .andExpect(jsonPath("$.nextCursor").doesNotExist())
            .andExpect(jsonPath("$.trips[0].status").value("CREDITED")).andExpect(jsonPath("$.trips[0].holdReason").doesNotExist())
            .andExpect(jsonPath("$.trips[0].releaseOn").doesNotExist()).andExpect(jsonPath("$.trips[0].lines[1].label").value("Drop distance"))
            .andExpect(jsonPath("$.trips[0].lines[1].amountPaise").value(1980)).andExpect(jsonPath("$.trips[0].rateCardVersion").value("2026-10-v1"))
            .andExpect(jsonPath("$.trips[0].completedAt").value("2026-10-20T09:00:00Z"));
    }

    @Test
    void aHeldTripCarriesItsReasonAndReleaseTime() throws Exception {
        when(earnings.tripEarning(RIDER, TRIP)).thenReturn(new TripEarning(TRIP.toString(), Instant.parse("2026-10-20T09:00:00Z"), "Madhapur",
            "Kondapur", "HELD", "Delivered with a photo. Ops checks the photo before this pay is released.",
            Instant.parse("2026-10-26T18:30:00Z"), 6700, List.of(), 1800, 4200, "2026-10-v1"));
        mvc.perform(get("/api/v1/rider/earnings/trips/" + TRIP).header("Authorization", "Bearer rider")).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("HELD")).andExpect(jsonPath("$.releaseOn").value("2026-10-26T18:30:00Z"))
            .andExpect(jsonPath("$.holdReason").value("Delivered with a photo. Ops checks the photo before this pay is released."));
    }

    @Test
    void refusalsAreCodesAndMessages() throws Exception {
        mvc.perform(get("/api/v1/rider/earnings").header("Authorization", "Bearer rider")).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(get("/api/v1/rider/earnings/trips/not-a-trip").header("Authorization", "Bearer rider")).andExpect(status().isBadRequest());
        when(earnings.tripEarning(eq(RIDER), any())).thenThrow(FleetApiException.notFound("TRIP_NOT_FOUND", "We could not find pay for that trip."));
        mvc.perform(get("/api/v1/rider/earnings/trips/" + UUID.randomUUID()).header("Authorization", "Bearer rider"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRIP_NOT_FOUND"));
        when(earnings.earnings(eq(RIDER), eq("month"), isNull())).thenThrow(FleetApiException.invalid("Choose today or week."));
        mvc.perform(get("/api/v1/rider/earnings").param("range", "month").header("Authorization", "Bearer rider"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Choose today or week."));
    }
}
