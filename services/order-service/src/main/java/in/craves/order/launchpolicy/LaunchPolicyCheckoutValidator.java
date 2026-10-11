package in.craves.order.launchpolicy;

import in.craves.order.exception.OrderApiException;
import in.craves.order.launchpolicy.LaunchPolicyModels.LaunchPolicyResponse;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Validates the prepared checkout inputs before persistence, while OrderService holds the cart lock. */
@Component
@ConditionalOnProperty(prefix = "craves.launch-policy", name = "enforcement-enabled", havingValue = "true")
public class LaunchPolicyCheckoutValidator {
    private static final double EARTH_RADIUS_METERS = 6_371_000.0d;

    private final LaunchPolicyService launchPolicyService;

    public LaunchPolicyCheckoutValidator(LaunchPolicyService launchPolicyService) {
        this.launchPolicyService = launchPolicyService;
    }

    public void enforce(
        BigDecimal foodSubtotal,
        CustomerAddressSnapshotResponse dropoff,
        List<KitchenPickupSnapshotResponse> pickups
    ) {
        LaunchPolicyResponse policy = launchPolicyService.requireActive();
        if (!"INR".equals(policy.currency())) {
            throw OrderApiException.serviceUnavailable(
                "LAUNCH_POLICY_CURRENCY_UNSUPPORTED",
                "Ordering is temporarily unavailable because the active launch policy currency is unsupported."
            );
        }
        // Preserve the food-only minimum: fees, tax and later referral benefits do not change this basis.
        if (foodSubtotal == null || foodSubtotal.compareTo(policy.minimumOrderAmount()) < 0) {
            throw OrderApiException.badRequest(
                "MINIMUM_ORDER_NOT_MET",
                "The cart does not meet the configured minimum order amount."
            );
        }

        requireCoordinates(dropoff.latitude(), dropoff.longitude(), "DELIVERY_ADDRESS_COORDINATES_REQUIRED");
        for (KitchenPickupSnapshotResponse pickup : pickups) {
            requireCoordinates(pickup.latitude(), pickup.longitude(), "KITCHEN_COORDINATES_REQUIRED");
            double distance = haversineMeters(
                pickup.latitude().doubleValue(),
                pickup.longitude().doubleValue(),
                dropoff.latitude().doubleValue(),
                dropoff.longitude().doubleValue()
            );
            if (distance > policy.maximumServiceabilityRadiusMeters()) {
                throw OrderApiException.badRequest(
                    "DELIVERY_ADDRESS_OUTSIDE_SERVICE_AREA",
                    "The selected delivery address is outside the configured launch service area."
                );
            }
        }
    }

    private static void requireCoordinates(BigDecimal latitude, BigDecimal longitude, String code) {
        if (latitude == null || longitude == null) {
            throw OrderApiException.badRequest(code, "Complete coordinates are required for launch serviceability validation.");
        }
    }

    static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
