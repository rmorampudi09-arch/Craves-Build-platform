package in.craves.integration.fleet.trip;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.trip.FleetTripModels.Customer;
import in.craves.integration.fleet.trip.FleetTripModels.Kitchen;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import in.craves.integration.fleet.trip.FleetTripService.Tap;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Offer and trip routes: RIDER only, Idempotency-Key on every POST, rider-v1 shapes and errors. */
@WebMvcTest(FleetTripController.class)
@ContextConfiguration(classes = {FleetTripController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetTripControllerTest {
    static final UUID TRIP = UUID.fromString("33333333-3333-4333-8333-333333333333");
    static final UUID OFFER = UUID.fromString("44444444-4444-4444-8444-444444444444");
    @Autowired MockMvc mvc;
    @MockBean FleetTripService trips;
    @MockBean JwtVerifier verifier;
    final UUID identity = UUID.randomUUID();

    @BeforeEach
    void signIn() {
        when(verifier.verify("rider")).thenReturn(new CravesPrincipal(identity, "+919800000001", Set.of("RIDER")));
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919800000002", Set.of("CUSTOMER")));
    }

    @Test
    void everyOfferAndTripRouteNeedsTheRiderRole() throws Exception {
        for (var request : List.of(post("/api/v1/rider/offers/" + OFFER + "/accept"), post("/api/v1/rider/offers/" + OFFER + "/decline"),
            get("/api/v1/rider/trips/active"), post("/api/v1/rider/trips/" + TRIP + "/picked-up"))) {
            mvc.perform(request.header("Authorization", "Bearer customer").header("Idempotency-Key", "k1")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(trips);
    }

    @Test
    void postsNeedAnIdempotencyKey() throws Exception {
        mvc.perform(post("/api/v1/rider/offers/" + OFFER + "/accept").header("Authorization", "Bearer rider"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header("Authorization", "Bearer rider"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(trips);
    }

    @Test
    void acceptReturnsTheTripAndRefusalsCarryTheirCodes() throws Exception {
        when(trips.accept(identity, OFFER, "rider-accept-1")).thenReturn(trip());
        mvc.perform(post("/api/v1/rider/offers/" + OFFER + "/accept").header("Authorization", "Bearer rider")
                .header("Idempotency-Key", "rider-accept-1"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.step").value("TO_KITCHEN")).andExpect(jsonPath("$.orderCode").value("#0BDE0101"))
            .andExpect(jsonPath("$.sealed").value(false)).andExpect(jsonPath("$.kitchen.kitchenName").value("Lakshmi's Kitchen"))
            .andExpect(jsonPath("$.customer.firstName").value("Anil")).andExpect(jsonPath("$.payLines[0].amountPaise").value(4000))
            .andExpect(jsonPath("$.chefReadyAt").doesNotExist());
        when(trips.accept(identity, OFFER, "rider-accept-2")).thenThrow(FleetTripService.taken());
        mvc.perform(post("/api/v1/rider/offers/" + OFFER + "/accept").header("Authorization", "Bearer rider")
            .header("Idempotency-Key", "rider-accept-2")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OFFER_TAKEN"));
        when(trips.accept(identity, OFFER, "rider-accept-3")).thenThrow(FleetTripService.expired());
        mvc.perform(post("/api/v1/rider/offers/" + OFFER + "/accept").header("Authorization", "Bearer rider")
            .header("Idempotency-Key", "rider-accept-3")).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("OFFER_EXPIRED"));
        mvc.perform(post("/api/v1/rider/offers/" + OFFER + "/decline").header("Authorization", "Bearer rider")
            .header("Idempotency-Key", "rider-decline-1")).andExpect(status().isNoContent());
        verify(trips).decline(identity, OFFER);
    }

    @Test
    void noActiveTripIs204() throws Exception {
        when(trips.active(identity)).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/rider/trips/active").header("Authorization", "Bearer rider")).andExpect(status().isNoContent());
        when(trips.active(identity)).thenReturn(Optional.of(trip()));
        mvc.perform(get("/api/v1/rider/trips/active").header("Authorization", "Bearer rider")).andExpect(status().isOk())
            .andExpect(jsonPath("$.tripId").value(TRIP.toString()));
    }

    @Test
    void aWrongOtpSaysHowManyTriesAreLeftAndALockSaysNone() throws Exception {
        when(trips.deliveredByOtp(eq(identity), eq(TRIP), eq("1111"), eq("d1"), any(Tap.class))).thenThrow(FleetTripService.otpInvalid(3));
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/delivered").header("Authorization", "Bearer rider").header("Idempotency-Key", "d1")
                .contentType(MediaType.APPLICATION_JSON).content("{\"method\":\"OTP\",\"otp\":\"1111\",\"fix\":{\"lat\":17.46,\"lng\":78.36}}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("OTP_INVALID"))
            .andExpect(jsonPath("$.attemptsLeft").value(3));
        when(trips.deliveredByOtp(eq(identity), eq(TRIP), eq("1111"), eq("d2"), any(Tap.class))).thenThrow(FleetTripService.otpLockedError());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/delivered").header("Authorization", "Bearer rider").header("Idempotency-Key", "d2")
                .contentType(MediaType.APPLICATION_JSON).content("{\"method\":\"OTP\",\"otp\":\"1111\"}"))
            .andExpect(status().isLocked()).andExpect(jsonPath("$.code").value("OTP_LOCKED"))
            .andExpect(jsonPath("$.attemptsLeft").doesNotExist());
    }

    @Test
    void stepsPhotosAndFailuresReachTheirHandlers() throws Exception {
        when(trips.step(identity, TRIP, "picked-up", "s1", Tap.NONE)).thenReturn(trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header("Authorization", "Bearer rider").header("Idempotency-Key", "s1"))
            .andExpect(status().isOk());
        when(trips.step(identity, TRIP, "arrived-drop", "s2", Tap.NONE))
            .thenThrow(FleetApiException.conflict("STEP_CONFLICT", "This trip has moved on. Refreshing it now."));
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/arrived-drop").header("Authorization", "Bearer rider").header("Idempotency-Key", "s2"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("This trip has moved on. Refreshing it now."));
        when(trips.deliveredByPhoto(eq(identity), eq(TRIP), eq(2), any(), eq("p1"), any(Tap.class))).thenReturn(trip());
        mvc.perform(multipart("/api/v1/rider/trips/" + TRIP + "/delivered")
                .file(new MockMultipartFile("photo", "door.jpg", "image/jpeg", new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff}))
                .param("method", "PHOTO").param("callsMade", "2").header("Authorization", "Bearer rider").header("Idempotency-Key", "p1"))
            .andExpect(status().isOk());
        when(trips.failed(identity, TRIP, "WRONG_ADDRESS", "Gate locked", "f1", Tap.NONE)).thenReturn(trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/failed").header("Authorization", "Bearer rider").header("Idempotency-Key", "f1")
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"WRONG_ADDRESS\",\"note\":\"Gate locked\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/delivered").header("Authorization", "Bearer rider").header("Idempotency-Key", "d9"))
            .andExpect(status().isBadRequest());
        verify(trips).failed(eq(identity), eq(TRIP), eq("WRONG_ADDRESS"), eq("Gate locked"), anyString(), eq(Tap.NONE));
        verify(trips, org.mockito.Mockito.never()).deliveredByOtp(any(), any(), isNull(), anyString(), any());
    }

    /** Blueprint A4: when and where the rider tapped reaches the service, from a JSON step and from the photo form. */
    @Test
    void theTapsAgeAndFixReachTheService() throws Exception {
        RiderFix fix = new RiderFix(17.46, 78.36, 9.0, Instant.parse("2026-10-27T09:00:00Z"), false, 7000L);
        Tap tap = new Tap(5000L, fix);
        when(trips.step(identity, TRIP, "arrived-drop", "s3", tap)).thenReturn(trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/arrived-drop").header("Authorization", "Bearer rider").header("Idempotency-Key", "s3")
                .contentType(MediaType.APPLICATION_JSON).content("{\"ageMs\":5000,\"fix\":{\"lat\":17.46,\"lng\":78.36,\"accuracyM\":9,"
                    + "\"at\":\"2026-10-27T09:00:00Z\",\"mock\":false,\"ageMs\":7000}}"))
            .andExpect(status().isOk());
        when(trips.deliveredByPhoto(eq(identity), eq(TRIP), eq(2), any(), eq("p2"), eq(tap))).thenReturn(trip());
        mvc.perform(multipart("/api/v1/rider/trips/" + TRIP + "/delivered")
                .file(new MockMultipartFile("photo", "door.jpg", "image/jpeg", new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff}))
                .param("method", "PHOTO").param("callsMade", "2").param("ageMs", "5000")
                .param("fix", "{\"lat\":17.46,\"lng\":78.36,\"accuracyM\":9,\"at\":\"2026-10-27T09:00:00Z\",\"mock\":false,\"ageMs\":7000}")
                .header("Authorization", "Bearer rider").header("Idempotency-Key", "p2"))
            .andExpect(status().isOk());
        when(trips.deliveredByPhoto(eq(identity), eq(TRIP), eq(2), any(), eq("p3"), eq(Tap.NONE))).thenReturn(trip());
        mvc.perform(multipart("/api/v1/rider/trips/" + TRIP + "/delivered")
                .file(new MockMultipartFile("photo", "door.jpg", "image/jpeg", new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff}))
                .param("method", "PHOTO").param("callsMade", "2").param("ageMs", "soon").param("fix", "not json")
                .header("Authorization", "Bearer rider").header("Idempotency-Key", "p3"))
            .andExpect(status().isOk());
        // A code the app typed offline says so (P1-05).
        when(trips.deliveredByOtp(identity, TRIP, "4821", "d9", new Tap(90000L, null, true))).thenReturn(trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/delivered").header("Authorization", "Bearer rider").header("Idempotency-Key", "d9")
                .contentType(MediaType.APPLICATION_JSON).content("{\"method\":\"OTP\",\"otp\":\"4821\",\"ageMs\":90000,\"capturedOffline\":true}"))
            .andExpect(status().isOk());
    }

    static Trip trip() {
        return new Trip(TRIP.toString(), 2, "TO_KITCHEN", "#0BDE0101", 3, 5350,
            new Kitchen("Madhapur", "Plot 7, Road 1", "Near the metro", 17.4483, 78.3915, "Lakshmi's Kitchen", "+914012345678"),
            new Customer("Kondapur", "Flat 2", null, 17.46, 78.36, "Anil", "+919876500000"), null, 480, 600, 150L, null,
            List.of(new PayLine("base", "base", 4000), new PayLine("drop-km", "drop distance", 1350)), false, null);
    }
}
