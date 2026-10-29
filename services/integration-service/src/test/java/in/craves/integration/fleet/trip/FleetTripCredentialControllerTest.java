package in.craves.integration.fleet.trip;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
import in.craves.integration.fleet.rider.FleetShiftService;
import in.craves.integration.fleet.trip.FleetTripService.Tap;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.List;
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

/** P2-01 switched on: the phone's native outbox sends trip steps with the shift credential, for its rider's own trip only. */
@WebMvcTest(FleetTripController.class)
@ContextConfiguration(classes = {FleetTripController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true",
    "craves.fleet.trip-shift-credential-enabled=true"})
class FleetTripCredentialControllerTest {
    static final UUID TRIP = FleetTripControllerTest.TRIP;
    static final UUID OTHER = UUID.fromString("55555555-5555-4555-8555-555555555555");
    static final String CREDENTIAL = "live-shift-credential";
    @Autowired MockMvc mvc;
    @MockBean FleetTripService trips;
    @MockBean FleetShiftService shifts;
    @MockBean JwtVerifier verifier;
    final UUID identity = UUID.randomUUID();

    @BeforeEach
    void signIn() {
        when(verifier.verify("rider")).thenReturn(new CravesPrincipal(identity, "+919800000001", Set.of("RIDER")));
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919800000002", Set.of("CUSTOMER")));
        when(shifts.tripIdentity(CREDENTIAL, TRIP)).thenReturn(identity);
    }

    @Test
    void theOutboxSendsEachStepWithTheCredentialAsItsRider() throws Exception {
        when(trips.step(identity, TRIP, "picked-up", "s1", Tap.NONE)).thenReturn(FleetTripControllerTest.trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL)
                .header("Idempotency-Key", "s1"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.tripId").value(TRIP.toString()));

        when(trips.deliveredByOtp(identity, TRIP, "4821", "d1", new Tap(90000L, null, true))).thenReturn(FleetTripControllerTest.trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/delivered").header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL)
                .header("Idempotency-Key", "d1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"method\":\"OTP\",\"otp\":\"4821\",\"ageMs\":90000,\"capturedOffline\":true}"))
            .andExpect(status().isOk());

        when(trips.deliveredByPhoto(eq(identity), eq(TRIP), eq(2), any(), eq("p1"), eq(Tap.NONE))).thenReturn(FleetTripControllerTest.trip());
        mvc.perform(multipart("/api/v1/rider/trips/" + TRIP + "/delivered")
                .file(new MockMultipartFile("photo", "door.jpg", "image/jpeg", new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff}))
                .param("method", "PHOTO").param("callsMade", "2").header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL)
                .header("Idempotency-Key", "p1"))
            .andExpect(status().isOk());
        verify(trips).deliveredByPhoto(eq(identity), eq(TRIP), eq(2), any(), eq("p1"), eq(Tap.NONE));
    }

    @Test
    void aCredentialMovesNoOtherTripAndNothingAfterItsShift() throws Exception {
        when(shifts.tripIdentity(CREDENTIAL, OTHER)).thenThrow(FleetApiException.notFound("TRIP_NOT_FOUND", "This trip is not yours."));
        when(shifts.tripIdentity("ended-shift", TRIP)).thenThrow(new FleetApiException(401, "SHIFT_CREDENTIAL_INVALID",
            "Your shift has ended. Go online again."));
        mvc.perform(post("/api/v1/rider/trips/" + OTHER + "/picked-up").header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL)
            .header("Idempotency-Key", "s2")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRIP_NOT_FOUND"));
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header(FleetShiftService.SHIFT_CREDENTIAL, "ended-shift")
            .header("Idempotency-Key", "s3")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SHIFT_CREDENTIAL_INVALID"));
        verifyNoInteractions(trips);
    }

    @Test
    void withoutTheCredentialAStepStillNeedsARiderToken() throws Exception {
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header("Idempotency-Key", "s4"))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SIGN_IN_REQUIRED"));
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header("Authorization", "Bearer customer").header("Idempotency-Key", "s5"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(trips);
        when(trips.step(identity, TRIP, "picked-up", "s6", Tap.NONE)).thenReturn(FleetTripControllerTest.trip());
        mvc.perform(post("/api/v1/rider/trips/" + TRIP + "/picked-up").header("Authorization", "Bearer rider").header("Idempotency-Key", "s6"))
            .andExpect(status().isOk());
        verify(trips).step(identity, TRIP, "picked-up", "s6", Tap.NONE);
    }

    @Test
    void theCredentialOpensNoOtherOfferOrTripRoute() throws Exception {
        for (var request : List.of(post("/api/v1/rider/offers/" + OTHER + "/accept"), post("/api/v1/rider/offers/" + OTHER + "/decline"),
            get("/api/v1/rider/trips/active"))) {
            mvc.perform(request.header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL).header("Idempotency-Key", "k1"))
                .andExpect(status().is4xxClientError());
        }
        verifyNoInteractions(trips);
    }
}
