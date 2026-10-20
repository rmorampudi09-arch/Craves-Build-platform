package in.craves.integration.fleet.money;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.money.FleetMoneyModels.EarningsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Line;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.RiderPayout;
import in.craves.integration.fleet.money.FleetMoneyModels.TripEarning;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
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
    @MockBean FleetPayouts payouts;
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

    @Test
    void payoutsShowTheNextMondayTheWithdrawableBalanceAndUtrs() throws Exception {
        when(payouts.payouts(RIDER)).thenReturn(new PayoutsPage(LocalDate.parse("2026-10-26"), 8400, List.of(
            new RiderPayout("55555555-5555-4555-8555-555555555555", "Withdrawal, paid by 1 pm on 21 Oct", 5000, "SCHEDULED", null, null),
            new RiderPayout("66666666-6666-4666-8666-666666666666", "Week ending 18 Oct", 31000, "PAID", "HDFCN52026101912345",
                Instant.parse("2026-10-19T08:00:00Z")))));
        mvc.perform(get("/api/v1/rider/payouts").header("Authorization", "Bearer rider")).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.nextPayoutOn").value("2026-10-26"))
            .andExpect(jsonPath("$.withdrawablePaise").value(8400)).andExpect(jsonPath("$.payouts[0].status").value("SCHEDULED"))
            .andExpect(jsonPath("$.payouts[0].utr").doesNotExist()).andExpect(jsonPath("$.payouts[1].utr").value("HDFCN52026101912345"))
            .andExpect(jsonPath("$.payouts[1].paidAt").value("2026-10-19T08:00:00Z"));
    }

    @Test
    void aWithdrawalNeedsAnIdempotencyKeyAndAnswers204OrTheRefusal() throws Exception {
        mvc.perform(post("/api/v1/rider/withdrawals").header("Authorization", "Bearer rider").contentType(MediaType.APPLICATION_JSON)
            .content("{\"amountPaise\":5000}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        mvc.perform(post("/api/v1/rider/withdrawals").header("Authorization", "Bearer rider").header("Idempotency-Key", "rider-withdraw-1")
            .contentType(MediaType.APPLICATION_JSON).content("{\"amountPaise\":5000}")).andExpect(status().isNoContent());
        verify(payouts).withdraw(RIDER, "rider-withdraw-1", 5000L);
        doThrow(FleetApiException.conflict("WITHDRAWAL_LIMIT", "You can withdraw once a day.")).when(payouts).withdraw(RIDER, "k2", 100L);
        mvc.perform(post("/api/v1/rider/withdrawals").header("Authorization", "Bearer rider").header("Idempotency-Key", "k2")
            .contentType(MediaType.APPLICATION_JSON).content("{\"amountPaise\":100}")).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("WITHDRAWAL_LIMIT"));
        mvc.perform(post("/api/v1/rider/withdrawals").header("Authorization", "Bearer customer").header("Idempotency-Key", "k3")
            .contentType(MediaType.APPLICATION_JSON).content("{\"amountPaise\":100}")).andExpect(status().isForbidden());
    }
}
