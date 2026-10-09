package in.craves.userchef.web;

import in.craves.userchef.location.OlaMapsClient;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer/addresses")
public class CustomerAddressGeocodingController {
    private final OlaMapsClient maps;

    public CustomerAddressGeocodingController(OlaMapsClient maps) {
        this.maps = maps;
    }

    @PostMapping("/reverse-geocode")
    public OlaMapsClient.ReverseGeocodedAddress reverseGeocode(
        @Valid @RequestBody ReverseGeocodeRequest request
    ) {
        return maps.reverseGeocode(request.latitude(), request.longitude());
    }

    @PostMapping("/location-search")
    public LocationSearchResponse locationSearch(@Valid @RequestBody LocationSearchRequest request) {
        return new LocationSearchResponse(maps.search(request.query(), request.latitude(), request.longitude()));
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
