package in.craves.userchef.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.location.LocationRateLimiter;
import in.craves.userchef.location.LocationRateLimiter.Kind;
import in.craves.userchef.location.OlaMapsClient;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.CustomerAddressGeocodingController.LocationSearchRequest;
import in.craves.userchef.web.CustomerAddressGeocodingController.ReverseGeocodeRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CustomerAddressGeocodingControllerTest {
    private final OlaMapsClient maps = mock(OlaMapsClient.class);
    private final LocationRateLimiter limiter = mock(LocationRateLimiter.class);
    private final CustomerAddressGeocodingController controller = new CustomerAddressGeocodingController(maps, limiter);
    private final CurrentUser customer = new CurrentUser(UUID.randomUUID(), "firebase-uid", null, List.of("CUSTOMER"));
    private final ReverseGeocodeRequest point = new ReverseGeocodeRequest(new BigDecimal("17.4483"), new BigDecimal("78.3915"));

    @Test
    void admittedCallsAreChargedToTheCustomerAndReachOla() {
        controller.reverseGeocode(customer, point);
        controller.locationSearch(customer, new LocationSearchRequest("Madhapur", null, null));

        verify(limiter).admit(customer.identityId(), Kind.REVERSE_GEOCODE);
        verify(limiter).admit(customer.identityId(), Kind.SEARCH);
        verify(maps).reverseGeocode(point.latitude(), point.longitude());
        verify(maps).search("Madhapur", null, null);
    }

    @Test
    void anExhaustedBudgetStopsTheCallBeforeOla() {
        doThrow(new LocationRateLimiter.Limited(7)).when(limiter).admit(customer.identityId(), Kind.SEARCH);

        assertThatThrownBy(() -> controller.locationSearch(customer, new LocationSearchRequest("Madhapur", null, null)))
            .isInstanceOf(LocationRateLimiter.Limited.class);
        verify(maps, never()).search(any(), any(), any());
    }

    @Test
    void rateLimitedCallsGet429WithRetryAfterAndTheStandardErrorBody() {
        var response = controller.rateLimited(new LocationRateLimiter.Limited(7));

        assertThat(response.getStatusCode().value()).isEqualTo(429);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("7");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("LOCATION_RATE_LIMITED");
        assertThat(response.getBody().details()).isEmpty();
    }

    @Test
    void callsWithoutASignedInCustomerAreRejectedBeforeOla() {
        assertThatThrownBy(() -> controller.reverseGeocode(null, point))
            .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getStatus()).isEqualTo(401));
        verify(limiter, never()).admit(any(), any());
        verify(maps, never()).reverseGeocode(any(), any());
    }
}
