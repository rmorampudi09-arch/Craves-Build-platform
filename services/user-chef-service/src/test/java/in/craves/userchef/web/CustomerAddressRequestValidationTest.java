package in.craves.userchef.web;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.userchef.web.ApiDtos.AddressLabel;
import in.craves.userchef.web.ApiDtos.CustomerAddressRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class CustomerAddressRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsCompleteGeocodedAddress() {
        assertThat(validator.validate(request("Madhapur", new BigDecimal("17.4483"), new BigDecimal("78.3915"))))
            .isEmpty();
    }

    @Test
    void rejectsMissingAreaName() {
        assertThat(validator.validate(request(null, new BigDecimal("17.4483"), new BigDecimal("78.3915"))))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("areaName");
    }

    @Test
    void rejectsMissingLatitude() {
        assertThat(validator.validate(request("Madhapur", null, new BigDecimal("78.3915"))))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("latitude");
    }

    @Test
    void rejectsOutOfRangeLongitude() {
        assertThat(validator.validate(request("Madhapur", new BigDecimal("17.4483"), new BigDecimal("181"))))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("longitude");
    }

    private static CustomerAddressRequest request(
        String areaName,
        BigDecimal latitude,
        BigDecimal longitude
    ) {
        return new CustomerAddressRequest(
            AddressLabel.HOME,
            "Ravi Teja",
            "+919876543210",
            "Flat 101, Test Residency",
            "Road No. 1",
            "Near Metro",
            areaName,
            "Hyderabad",
            "Telangana",
            "500081",
            latitude,
            longitude,
            true
        );
    }
}
