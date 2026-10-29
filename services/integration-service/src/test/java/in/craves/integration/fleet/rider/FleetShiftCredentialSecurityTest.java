package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetOpsController;
import in.craves.integration.fleet.admin.FleetPilotHealth;
import in.craves.integration.fleet.admin.FleetSlotController;
import in.craves.integration.fleet.admin.FleetSlotService;
import in.craves.integration.fleet.admin.RiderJoinsExitsExport;
import in.craves.integration.fleet.dispatch.FleetOpsService;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.money.FleetMoneyAdminController;
import in.craves.integration.fleet.money.FleetMoneyController;
import in.craves.integration.fleet.money.FleetPayouts;
import in.craves.integration.fleet.rider.FleetRiderModels.DeviceRegistration;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.support.FleetSupportAdminController;
import in.craves.integration.fleet.support.FleetSupportController;
import in.craves.integration.fleet.support.FleetSupportService;
import in.craves.integration.fleet.trip.FleetTripController;
import in.craves.integration.fleet.trip.FleetTripService;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.JwtVerifier;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/** Walks every rider and admin fleet route with only a shift credential: the routes that take it are the only ones that answer. */
@WebMvcTest(controllers = {FleetRiderController.class, FleetLocationController.class, FleetTripController.class, FleetAdminController.class,
    FleetSlotController.class, FleetMoneyController.class, FleetMoneyAdminController.class, FleetSupportController.class,
    FleetSupportAdminController.class, FleetOpsController.class})
@ContextConfiguration(classes = {FleetRiderController.class, FleetLocationController.class, FleetTripController.class, FleetAdminController.class,
    FleetSlotController.class, FleetMoneyController.class, FleetMoneyAdminController.class, FleetSupportController.class,
    FleetSupportAdminController.class, FleetOpsController.class, FleetApiAdvice.class, WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true",
    "craves.fleet.location-ingest-enabled=true"})
class FleetShiftCredentialSecurityTest {
    static final String CREDENTIAL = "a-live-shift-credential";

    @Autowired MockMvc mvc;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;
    @MockBean FleetRiderService riders;
    @MockBean FleetShiftService shifts;
    @MockBean FleetLocationService locations;
    @MockBean FleetAdminService admin;
    @MockBean RiderJoinsExitsExport joinsExits;
    @MockBean FleetTripService trips;
    @MockBean FleetSlotService slots;
    @MockBean FleetEarnings earnings;
    @MockBean FleetPayouts payouts;
    @MockBean FleetSupportService support;
    @MockBean FleetOpsService ops;
    @MockBean FleetPilotHealth health;
    @MockBean JwtVerifier verifier;

    @Test
    void theShiftCredentialOpensOnlyTheRoutesThatTakeIt() throws Exception {
        assertThat(walk()).containsExactly("POST /api/v1/rider/devices", "POST /api/v1/rider/locations");
        verify(locations).ingest(null, CREDENTIAL, new LocationBatch(List.of()));
        verify(shifts).registerDevice(null, CREDENTIAL, new DeviceRegistration(null, null, null, null));
        verifyNoMoreInteractions(shifts);
        verifyNoInteractions(riders, admin, joinsExits, trips, slots, earnings, payouts, support, ops);
    }

    /** Every rider and admin fleet route called with only the shift credential; the ones that answered (not 401 or 403). */
    Set<String> walk() throws Exception {
        Set<String> walked = new TreeSet<>();
        Set<String> answered = new TreeSet<>();
        for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            for (String pattern : info.getPatternValues()) {
                if (!pattern.startsWith("/api/v1/rider/") && !pattern.startsWith("/api/v1/admin/fleet/")) {
                    continue;
                }
                for (RequestMethod method : methods.isEmpty() ? Set.of(RequestMethod.GET, RequestMethod.POST) : methods) {
                    walked.add(method + " " + pattern);
                    int status = mvc.perform(request(HttpMethod.valueOf(method.name()), pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString()))
                            .header(FleetShiftService.SHIFT_CREDENTIAL, CREDENTIAL).header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON).content("{\"fixes\":[]}"))
                        .andReturn().getResponse().getStatus();
                    if (status != 401 && status != 403) {
                        answered.add(method + " " + pattern);
                    }
                }
            }
        }
        assertThat(walked).contains("GET /api/v1/rider/home", "POST /api/v1/rider/shift/end", "GET /api/v1/admin/fleet/riders",
            "POST /api/v1/rider/offers/{offerId}/accept", "POST /api/v1/rider/trips/{tripId}/{action}", "GET /api/v1/admin/fleet/slots",
            "GET /api/v1/rider/earnings", "POST /api/v1/rider/withdrawals", "POST /api/v1/rider/sos", "GET /api/v1/admin/fleet/payout-batches",
            "GET /api/v1/admin/fleet/support-issues", "GET /api/v1/admin/fleet/dispatch-queue", "POST /api/v1/admin/fleet/trips/{tripId}/reassign")
            .hasSizeGreaterThan(20);
        return answered;
    }
}
