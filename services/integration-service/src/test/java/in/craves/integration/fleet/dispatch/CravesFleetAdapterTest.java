package in.craves.integration.fleet.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CravesFleetAdapterTest {
    final FleetDispatcher dispatcher = mock(FleetDispatcher.class);
    final FleetTripService trips = mock(FleetTripService.class);
    final CravesFleetAdapter adapter = new CravesFleetAdapter(dispatcher, trips, mock(FleetStatusBridge.class), new ObjectMapper());

    @Test
    void isTheCravesFleetProviderAndQuotesAvailabilityOnly() {
        assertThat(adapter.providerId()).isEqualTo("craves_fleet");
        var request = FleetDispatchFixtures.command(UUID.randomUUID()).deliveryRequest();
        when(dispatcher.ridersNear(anyDouble(), anyDouble())).thenReturn(2, 0);
        var quote = adapter.quote(request);
        assertThat(quote.available()).isTrue();
        assertThat(quote.deliveryFeeAmount()).as("pay is locked per rider by the fleet stage").isNull();
        assertThat(quote.providerMetadata().path("eligible_riders").asInt()).isEqualTo(2);
        assertThat(adapter.quote(request).available()).isFalse();
    }

    @Test
    void routingCanNeverCreateARiderTrip() {
        assertThatThrownBy(() -> adapter.create(new CreateDeliveryRequest(UUID.randomUUID().toString(),
            FleetDispatchFixtures.command(UUID.randomUUID()).deliveryRequest()))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void cancelEndsTheRidersTripWithItsPayRule() {
        UUID trip = UUID.randomUUID();
        when(trips.cancel(trip, "Cancelled by Craves ops.")).thenReturn(Optional.of("CANCELLED"));
        assertThat(adapter.cancel(trip.toString()).status()).isEqualTo(DeliveryStatus.CANCELLED);
        when(trips.cancel(trip, "Cancelled by Craves ops.")).thenReturn(Optional.of("DELIVERED"));
        assertThat(adapter.cancel(trip.toString()).status()).as("too late: already delivered").isEqualTo(DeliveryStatus.DELIVERED);
    }
}
