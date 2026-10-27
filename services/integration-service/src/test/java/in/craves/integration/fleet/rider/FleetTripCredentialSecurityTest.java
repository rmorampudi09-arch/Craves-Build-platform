package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** The same walk with P2-01 switched on: the shift credential opens trip steps too, and still nothing else. */
@TestPropertySource(properties = "craves.fleet.trip-shift-credential-enabled=true")
class FleetTripCredentialSecurityTest extends FleetShiftCredentialSecurityTest {
    @Test
    @Override
    void theShiftCredentialOpensOnlyTheRoutesThatTakeIt() throws Exception {
        assertThat(walk()).containsExactly("POST /api/v1/rider/devices", "POST /api/v1/rider/locations",
            "POST /api/v1/rider/trips/{tripId}/delivered", "POST /api/v1/rider/trips/{tripId}/{action}");
        verify(shifts, atLeast(2)).tripIdentity(eq(CREDENTIAL), any(UUID.class));
        verifyNoInteractions(riders, admin, joinsExits, slots, earnings, payouts, support, ops);
    }
}
