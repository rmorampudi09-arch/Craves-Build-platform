package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Craves' own riders behind the delivery provider contract, as provider "craves_fleet" (PLAN F9). It is inactive in the
 * provider catalog on purpose: routing never quotes or books it. Riders get an order only through the fleet stage of the
 * dispatch chain (FleetDispatcher), which runs before Borzo and Pidge. track() feeds the delivery-status pipeline for a
 * rider's delivery job; cancel() ends a rider's trip with the PLAN pay rule for its state.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class CravesFleetAdapter implements DeliveryProviderAdapter {
    private final FleetDispatcher dispatcher;
    private final FleetTripService trips;
    private final FleetStatusBridge bridge;
    private final ObjectMapper json;

    public CravesFleetAdapter(FleetDispatcher dispatcher, FleetTripService trips, FleetStatusBridge bridge, ObjectMapper json) {
        this.dispatcher = dispatcher;
        this.trips = trips;
        this.bridge = bridge;
        this.json = json;
    }

    @Override
    public String providerId() {
        return FleetStatusBridge.PROVIDER_ID;
    }

    /** Availability only: whether riders are near the kitchen now. Pay is locked per rider when the fleet stage offers. */
    @Override
    public ProviderQuote quote(QuoteRequest request) {
        if (request == null || request.pickup() == null || request.pickup().latitude() == null || request.pickup().longitude() == null) {
            return new ProviderQuote(providerId(), false, null, null, "INR", List.of("Pickup coordinates are missing"),
                json.createObjectNode(), Instant.now());
        }
        int riders = dispatcher.ridersNear(request.pickup().latitude().doubleValue(), request.pickup().longitude().doubleValue());
        return new ProviderQuote(providerId(), riders > 0, null, null, "INR", riders > 0 ? List.of() : List.of("No Craves rider nearby"),
            json.createObjectNode().put("eligible_riders", riders), Instant.now());
    }

    /** Never used: a rider trip starts only in the fleet stage, before Borzo and Pidge, never from routing. */
    @Override
    public ProviderDelivery create(CreateDeliveryRequest request) {
        throw new IllegalStateException("craves_fleet trips start in the dispatch chain's fleet stage, not through routing");
    }

    @Override
    public ProviderDelivery cancel(String providerDeliveryId) {
        UUID tripId = UUID.fromString(providerDeliveryId);
        String state = trips.cancel(tripId, "Cancelled by Craves ops.")
            .orElseThrow(() -> new IllegalArgumentException("No Craves rider trip " + providerDeliveryId));
        DeliveryStatus status = "CANCELLED".equals(state) ? DeliveryStatus.CANCELLED : "DELIVERED".equals(state) ? DeliveryStatus.DELIVERED
            : "FAILED".equals(state) ? DeliveryStatus.FAILED : DeliveryStatus.UNKNOWN;
        return new ProviderDelivery(providerId(), providerDeliveryId, null, status, state, null, null, null, null, Instant.now());
    }

    @Override
    public TrackingSnapshot track(String providerDeliveryId) {
        return bridge.snapshot(UUID.fromString(providerDeliveryId));
    }
}
