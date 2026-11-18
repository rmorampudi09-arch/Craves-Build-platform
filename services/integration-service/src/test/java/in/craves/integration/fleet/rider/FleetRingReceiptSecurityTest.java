package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.OfferReceipt;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;

/** The same walk with the ring receipt (R22 22) switched on: the shift credential opens that one route more, and nothing else. */
@ContextConfiguration(classes = FleetRingReceiptController.class)
@TestPropertySource(properties = "craves.fleet.ring-receipt-enabled=true")
class FleetRingReceiptSecurityTest extends FleetShiftCredentialSecurityTest {
    @Test
    @Override
    void theShiftCredentialOpensOnlyTheRoutesThatTakeIt() throws Exception {
        assertThat(walk()).containsExactly("POST /api/v1/rider/devices", "POST /api/v1/rider/locations",
            "POST /api/v1/rider/offers/{offerId}/rang");
        verify(locations).ingest(null, CREDENTIAL, new LocationBatch(List.of()));
        verify(locations).rang(eq(CREDENTIAL), any(UUID.class), eq(new OfferReceipt(null, null, null)));
        verifyNoMoreInteractions(locations);
        verifyNoInteractions(riders, admin, joinsExits, trips, slots, earnings, payouts, support, ops);
    }

    @Test
    @Override
    void theRingReceiptNeedsItsSwitch() throws Exception {
        assertThat(rang()).isEqualTo(204);
        verify(locations).rang(eq(CREDENTIAL), any(UUID.class), eq(new OfferReceipt(null, "fcm", 0L)));
    }

    /** No credential: 401, and nothing reaches the service. */
    @Test
    void withoutTheCredentialItIsRefused() throws Exception {
        int status = mvc.perform(post("/api/v1/rider/offers/" + UUID.randomUUID() + "/rang").contentType(MediaType.APPLICATION_JSON)
            .content("{\"channel\":\"fcm\",\"ageMs\":0}")).andReturn().getResponse().getStatus();
        assertThat(status).isEqualTo(401);
        verifyNoInteractions(locations);
    }
}
