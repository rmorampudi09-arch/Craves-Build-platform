package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Offer and Trip of contracts/openapi/rider-v1.yaml. Optional fields are left out when absent. */
public final class FleetTripModels {
    private FleetTripModels() {
    }

    /** expiresInSec is what the app counts down from, never the phone clock; pay and both distances are locked. */
    public record Offer(String offerId, String tripId, Instant expiresAt, long expiresInSec, long payPaise, int pickupDistanceM,
                        int dropDistanceM, String kitchenArea, String customerLocality, int estMinutes, List<PayLine> payLines) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Kitchen(String area, String address, String landmark, double lat, double lng, String kitchenName, String chefPhone) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Customer(String area, String address, String landmark, double lat, double lng, String firstName, String phone) {
    }

    /** Never carries the customer's promised time. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Trip(String tripId, int version, String step, String orderCode, int itemsCount, long payPaise, Kitchen kitchen,
                       Customer customer, Instant arrivedKitchenAt, long waitFreeSeconds, long unreachableWaitSeconds,
                       Long waitPayPerMinutePaise, String cancelReason, List<PayLine> payLines, boolean sealed, Instant chefReadyAt) {
    }
}
