package in.craves.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.service.DiscoveryCriteria.MenuItemSort;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class NearbyDiscoveryServiceCriteriaValidationTest {
    private NearbyDiscoveryService service;

    @BeforeEach
    void setUp() {
        CatalogDiscoveryProperties properties = new CatalogDiscoveryProperties();
        properties.setMaxQueryRadiusMeters(50_000);
        properties.setMaxPageSize(100);
        service = new NearbyDiscoveryService(new JdbcTemplate(), properties);
    }

    @Test
    void rejectsSearchQueryAboveTechnicalLimitBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> discover(new DiscoveryCriteria("a".repeat(121), null, null, null, null, null, null)),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("SEARCH_QUERY_TOO_LONG");
    }

    @Test
    void rejectsCategoryAboveSchemaLimitBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> discover(new DiscoveryCriteria(null, "a".repeat(81), null, null, null, null, null)),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("CATEGORY_TOO_LONG");
    }

    @Test
    void rejectsNegativeMinimumPriceBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> discover(new DiscoveryCriteria(null, null, null, new BigDecimal("-0.01"), null, null, null)),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_MIN_PRICE");
    }

    @Test
    void rejectsInvertedPriceRangeBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> discover(
                new DiscoveryCriteria(
                    null,
                    null,
                    FoodType.VEG,
                    new BigDecimal("300"),
                    new BigDecimal("200"),
                    null,
                    null
                )
            ),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_PRICE_RANGE");
    }

    @Test
    void rejectsNonPositivePreparationTimeBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> discover(new DiscoveryCriteria(null, null, null, null, null, 0, SpiceLevel.MILD)),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_PREPARATION_TIME");
    }

    private void discover(DiscoveryCriteria criteria) {
        service.discoverMenuItems(
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915"),
            5000,
            criteria,
            MenuItemSort.DISTANCE_ASC,
            0,
            20
        );
    }
}
