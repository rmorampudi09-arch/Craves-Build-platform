package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.rider.FleetRiderModels.OfferReceipt;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/v1/rider/offers/{offerId}/rang (R22 22), off unless CRAVES_FLEET_RING_RECEIPT_ENABLED too: the phone says an
 * offer reached it as it rings, not with its next /locations call. Only the native service sends it, with the shift
 * credential and no JWT, so WebSecurityConfiguration lets the route through while the switch is on and this controller
 * requires the credential. With the switch off the route does not exist.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled", "craves.fleet.location-ingest-enabled",
    "craves.fleet.ring-receipt-enabled"}, havingValue = "true")
public class FleetRingReceiptController {
    private final FleetLocationService service;

    public FleetRingReceiptController(FleetLocationService service) {
        this.service = service;
    }

    /** 204 whether or not anything was stored: the body's channel and ageMs, as in /locations' offerReceipts. */
    @PostMapping("/offers/{offerId}/rang")
    public ResponseEntity<Void> rang(@RequestHeader(name = FleetShiftService.SHIFT_CREDENTIAL, required = false) String credential,
                                     @PathVariable UUID offerId, @RequestBody(required = false) OfferReceipt receipt) {
        if (!StringUtils.hasText(credential)) {
            throw FleetShiftService.credentialInvalid();
        }
        service.rang(credential, offerId, receipt);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }
}
