package in.craves.userchef.web;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.userchef.web.ApiDtos.CustomerAddressRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CustomerAddressRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @ParameterizedTest
    @ValueSource(strings = {"HOME", "WORK", "OTHER", "Mom's House", "అమ్మ ఇల్లు"})
    void acceptsStringLabelsAndTrimsBeforeValidation(String label) throws Exception {
        var mapper = new ObjectMapper();
        var original = request("Customer Name", "Madhapur", "Hyderabad", "500081", new BigDecimal("17.4483"), new BigDecimal("78.3915"));
        var json = mapper.valueToTree(original);
        ((com.fasterxml.jackson.databind.node.ObjectNode) json).put("addressLabel", "  " + label + "  ");
        var parsed = mapper.treeToValue(json, CustomerAddressRequest.class);
        assertThat(validator.validate(parsed)).isEmpty();
        assertThat(parsed.addressLabel()).isEqualTo(label);
        assertThat(mapper.valueToTree(parsed).has("addressName")).isFalse();
    }

    @Test
    void requiresNonblankLabelAndEnforcesEightyCharacterBoundary() {
        var original = request("Customer Name", "Madhapur", "Hyderabad", "500081", new BigDecimal("17.4483"), new BigDecimal("78.3915"));
        for (String label : new String[] {null, "", " \t ", "x".repeat(81)}) {
            assertThat(validator.validate(withLabel(original, label)))
                .extracting(violation -> violation.getPropertyPath().toString()).contains("addressLabel");
        }
        assertThat(validator.validate(withLabel(original, "  " + "x".repeat(80) + "  "))).isEmpty();
    }

    private static CustomerAddressRequest withLabel(CustomerAddressRequest r, String label) {
        return new CustomerAddressRequest(label, r.recipientName(), r.contactPhoneNumber(), r.addressLine1(),
            r.addressLine2(), r.landmark(), r.areaName(), r.districtName(), r.city(), r.state(), r.postalCode(),
            r.latitude(), r.longitude(), r.isDefault());
    }

    @Test
    void acceptsCompleteGeocodedAddress() {
        assertThat(validator.validate(request(
            "Customer Name",
            "Madhapur",
            "Hyderabad",
            "500081",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915")
        ))).isEmpty();
    }

    @Test
    void temporarilyAcceptsMissingDistrictForRollingDeploymentCompatibility() {
        assertThat(validator.validate(request(
            "Customer Name",
            "Madhapur",
            null,
            "500081",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915")
        ))).isEmpty();
    }

    @Test
    void rejectsMissingRecipientName() {
        assertThat(validator.validate(request(
            null,
            "Madhapur",
            "Hyderabad",
            "500081",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915")
        )))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("recipientName");
    }

    @Test
    void rejectsMissingAreaName() {
        assertThat(validator.validate(request(
            "Customer Name",
            null,
            "Hyderabad",
            "500081",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915")
        )))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("areaName");
    }

    @Test
    void rejectsMissingPostalCode() {
        assertThat(validator.validate(request(
            "Customer Name",
            "Madhapur",
            "Hyderabad",
            null,
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915")
        )))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("postalCode");
    }

    @Test
    void rejectsMissingLatitude() {
        assertThat(validator.validate(request(
            "Customer Name",
            "Madhapur",
            "Hyderabad",
            "500081",
            null,
            new BigDecimal("78.3915")
        )))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("latitude");
    }

    @Test
    void rejectsOutOfRangeLongitude() {
        assertThat(validator.validate(request(
            "Customer Name",
            "Madhapur",
            "Hyderabad",
            "500081",
            new BigDecimal("17.4483"),
            new BigDecimal("181")
        )))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("longitude");
    }

    private static CustomerAddressRequest request(
        String recipientName,
        String areaName,
        String districtName,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude
    ) {
        return new CustomerAddressRequest(
            "HOME",
            recipientName,
            "+919876543210",
            "Flat 101, Test Residency",
            "Road No. 1",
            "Near Metro",
            areaName,
            districtName,
            "Hyderabad",
            "Telangana",
            postalCode,
            latitude,
            longitude,
            true
        );
    }
}
