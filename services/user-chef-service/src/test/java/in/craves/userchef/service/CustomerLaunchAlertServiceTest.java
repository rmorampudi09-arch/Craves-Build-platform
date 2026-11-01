package in.craves.userchef.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.CustomerLaunchAlertService.LaunchAlertRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class CustomerLaunchAlertServiceTest {
    private static final String EXISTS_SQL = "WHERE identity_id = ? AND latitude_key = ?";
    private static final String COUNT_SQL = "SELECT COUNT(*) FROM customer_kitchen_launch_alert WHERE identity_id = ?";

    private JdbcTemplate jdbcTemplate;
    private CustomerLaunchAlertService service;
    private UUID identityId;
    private CurrentUser customer;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new CustomerLaunchAlertService(jdbcTemplate);
        identityId = UUID.randomUUID();
        customer = new CurrentUser(identityId, "firebase-customer", "+919876543210", List.of("CUSTOMER"));
    }

    @Test
    void rejectsNonCustomerBeforeTouchingDatabase() {
        CurrentUser chef = new CurrentUser(UUID.randomUUID(), "firebase-chef", "+919876543211", List.of("CHEF"));

        assertThatThrownBy(() -> service.status(chef, new BigDecimal("17.46"), new BigDecimal("78.36")))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("CUSTOMER_ROLE_REQUIRED"));
        verify(jdbcTemplate, never()).queryForObject(anyString(), eq(Integer.class), any(Object[].class));
    }

    @Test
    void rejectsSpotsOffTheMap() {
        assertThatThrownBy(() -> service.status(customer, new BigDecimal("91"), new BigDecimal("78.36")))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("INVALID_LOCATION"));
        assertThatThrownBy(() -> service.status(customer, new BigDecimal("17.46"), null))
            .isInstanceOf(ApiException.class);
    }

    @Test
    void statusLooksUpTheRoundedSpot() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(1);

        assertThat(service.status(customer, new BigDecimal("17.46482"), new BigDecimal("78.35671")).subscribed()).isTrue();
        verify(jdbcTemplate).queryForObject(
            contains(EXISTS_SQL), eq(Integer.class), eq(identityId), eq(new BigDecimal("17.465")), eq(new BigDecimal("78.357")));
    }

    @Test
    void subscribeIsIdempotentForTheSameSpot() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(1);

        assertThat(service.subscribe(customer, request("17.4648", "78.3567", "Kondapur")).subscribed()).isTrue();
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
        verify(jdbcTemplate, never()).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void subscribeStoresTheRoundedKeyAndTrimmedAreaUnderTheCustomerLock() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(jdbcTemplate.queryForObject(eq(COUNT_SQL), eq(Integer.class), any(Object[].class))).thenReturn(3);

        assertThat(service.subscribe(customer, request("17.4648219", "78.3567", "  Kondapur ")).subscribed()).isTrue();
        verify(jdbcTemplate).queryForList(contains("pg_advisory_xact_lock"), eq(identityId.toString()));
        verify(jdbcTemplate).update(
            contains("ON CONFLICT (identity_id, latitude_key, longitude_key) DO NOTHING"),
            eq(identityId),
            eq(new BigDecimal("17.465")),
            eq(new BigDecimal("78.357")),
            eq(new BigDecimal("17.464822")),
            eq(new BigDecimal("78.356700")),
            eq("Kondapur"));
    }

    @Test
    void subscribeStopsAtTheCap() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(jdbcTemplate.queryForObject(eq(COUNT_SQL), eq(Integer.class), any(Object[].class)))
            .thenReturn(CustomerLaunchAlertService.MAX_ALERTS);

        assertThatThrownBy(() -> service.subscribe(customer, request("17.46", "78.36", "Kondapur")))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("LAUNCH_ALERTS_LIMIT_REACHED"));
        verify(jdbcTemplate, never()).update(contains("INSERT INTO"), any(Object[].class));
    }

    @Test
    void subscribeRearmsASpotThatWasAlreadyToldWithoutUsingTheCap() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(jdbcTemplate.update(contains("SET notified_at = NULL"), any(Object[].class))).thenReturn(1);

        assertThat(service.subscribe(customer, request("17.4648", "78.3567", " Kondapur")).subscribed()).isTrue();
        verify(jdbcTemplate).update(
            contains("AND notified_at IS NOT NULL"),
            eq("Kondapur"),
            eq(identityId),
            eq(new BigDecimal("17.465")),
            eq(new BigDecimal("78.357")));
        verify(jdbcTemplate, never()).queryForList(anyString(), any(Object[].class));
        verify(jdbcTemplate, never()).update(contains("INSERT INTO"), any(Object[].class));
    }

    @Test
    void statusCountsOnlyCustomersStillWaiting() {
        when(jdbcTemplate.queryForObject(contains(EXISTS_SQL), eq(Integer.class), any(Object[].class))).thenReturn(0);

        assertThat(service.status(customer, new BigDecimal("17.46"), new BigDecimal("78.36")).subscribed()).isFalse();
        verify(jdbcTemplate).queryForObject(contains("AND notified_at IS NULL"), eq(Integer.class), any(Object[].class));
    }

    private static LaunchAlertRequest request(String latitude, String longitude, String areaName) {
        return new LaunchAlertRequest(new BigDecimal(latitude), new BigDecimal(longitude), areaName);
    }
}
