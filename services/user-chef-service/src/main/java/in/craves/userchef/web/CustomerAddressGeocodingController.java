package in.craves.userchef.web;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.location.LocationRateLimiter;
import in.craves.userchef.location.OlaMapsClient;
import in.craves.userchef.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer/addresses")
public class CustomerAddressGeocodingController {
    private final OlaMapsClient maps;
    private final LocationRateLimiter limiter;

    public CustomerAddressGeocodingController(OlaMapsClient maps, LocationRateLimiter limiter) {
        this.maps = maps;
        this.limiter = limiter;
    }

    @PostMapping("/reverse-geocode")
    public OlaMapsClient.ReverseGeocodedAddress reverseGeocode(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody ReverseGeocodeRequest request
    ) {
        limiter.admit(customer(user), LocationRateLimiter.Kind.REVERSE_GEOCODE);
        return maps.reverseGeocode(request.latitude(), request.longitude());
    }

    @PostMapping("/location-search")
    public LocationSearchResponse locationSearch(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody LocationSearchRequest request
    ) {
        limiter.admit(customer(user), LocationRateLimiter.Kind.SEARCH);
        return new LocationSearchResponse(maps.search(request.query(), request.latitude(), request.longitude()));
    }

    /** Same error body as {@link AppErrorHandler}, plus Retry-After, which that handler cannot set. */
    @ExceptionHandler(LocationRateLimiter.Limited.class)
    public ResponseEntity<AppErrorHandler.ErrorBody> rateLimited(LocationRateLimiter.Limited limited) {
        return ResponseEntity.status(429)
            .header("Retry-After", Integer.toString(limited.retryAfterSeconds()))
            .body(new AppErrorHandler.ErrorBody(
                "LOCATION_RATE_LIMITED",
                "Too many location lookups. Please try again shortly.",
                Instant.now(),
                List.of()));
    }

    private static UUID customer(CurrentUser user) {
        if (user == null || user.identityId() == null) {
            throw ApiException.unauthorized("AUTHENTICATION_REQUIRED", "A signed-in customer is required.");
        }
        return user.identityId();
    }

    public record ReverseGeocodeRequest(
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude
    ) {
    }

    public record LocationSearchRequest(
        @NotNull @Size(min = 2, max = 160) String query,
        @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude
    ) {
        @AssertTrue(message = "latitude and longitude must be sent together")
        public boolean isBiasPairComplete() {
            return (latitude == null) == (longitude == null);
        }
    }

    public record LocationSearchResponse(List<OlaMapsClient.LocationSuggestion> results) {
    }
}
