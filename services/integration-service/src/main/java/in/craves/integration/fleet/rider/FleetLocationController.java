package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatchResponse;
import in.craves.integration.security.CravesPrincipal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/v1/rider/locations, off unless CRAVES_FLEET_LOCATION_INGEST_ENABLED too. The native service sends the
 * shift credential (X-Craves-Shift-Credential) and no JWT, so WebSecurityConfiguration lets this route through and
 * this controller requires the credential or a RIDER JWT.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled", "craves.fleet.location-ingest-enabled"},
    havingValue = "true")
public class FleetLocationController {
    private final FleetLocationService service;

    public FleetLocationController(FleetLocationService service) {
        this.service = service;
    }

    @PostMapping("/locations")
    public ResponseEntity<LocationBatchResponse> locations(@AuthenticationPrincipal CravesPrincipal principal,
                                                           @RequestHeader(name = FleetShiftService.SHIFT_CREDENTIAL, required = false) String credential,
                                                           @RequestBody LocationBatch batch) {
        if (StringUtils.hasText(credential)) {
            return FleetRiderController.noStore(service.ingest(null, credential, batch));
        }
        return FleetRiderController.noStore(service.ingest(FleetRiderController.riderIdentity(principal), null, batch));
    }
}
