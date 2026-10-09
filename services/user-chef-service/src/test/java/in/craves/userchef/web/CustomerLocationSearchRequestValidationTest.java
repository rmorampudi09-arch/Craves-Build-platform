package in.craves.userchef.web;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.userchef.web.CustomerAddressGeocodingController.LocationSearchRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class CustomerLocationSearchRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsQueryWithOrWithoutCompleteBiasPoint() {
        assertThat(validator.validate(new LocationSearchRequest("Madhapur", null, null))).isEmpty();
        assertThat(validator.validate(new LocationSearchRequest(
            "Gachibowli", new BigDecimal("17.3850"), new BigDecimal("78.4867")))).isEmpty();
    }

    @Test
    void rejectsMissingShortOrOversizedQueries() {
        for (String query : new String[] {null, "", "M", "x".repeat(161)}) {
            assertThat(validator.validate(new LocationSearchRequest(query, null, null)))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("query");
        }
    }

    @Test
    void rejectsHalfOrOutOfRangeBiasPoints() {
        assertThat(validator.validate(new LocationSearchRequest("Kondapur", new BigDecimal("17.38"), null)))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("biasPairComplete");
        assertThat(validator.validate(new LocationSearchRequest("Kondapur", new BigDecimal("90.5"), new BigDecimal("78.4"))))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("latitude");
        assertThat(validator.validate(new LocationSearchRequest("Kondapur", new BigDecimal("17.4"), new BigDecimal("-180.5"))))
            .extracting(violation -> violation.getPropertyPath().toString())
            .contains("longitude");
    }
}
