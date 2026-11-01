package in.craves.userchef.location;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.location.OlaMapsClient.RoadDistance;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class RoadDistanceServiceTest {
    private static final BigDecimal KITCHEN_LAT = new BigDecimal("17.4483");
    private static final BigDecimal KITCHEN_LNG = new BigDecimal("78.3915");
    private static final BigDecimal HOME_LAT = new BigDecimal("17.4374");
    private static final BigDecimal HOME_LNG = new BigDecimal("78.3897");

    private final UUID kitchenId = UUID.randomUUID();
    private final UUID addressId = UUID.randomUUID();
    private JdbcTemplate jdbcTemplate;
    private OlaMapsClient maps;
    private RoadDistanceService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        maps = mock(OlaMapsClient.class);
        service = new RoadDistanceService(jdbcTemplate, maps);
    }

    @Test
    void cacheHitSkipsOla() {
        doReturn(List.of(new RoadDistance(1700, 420L, "CACHE"))).when(jdbcTemplate).query(
            anyString(), any(RowMapper.class),
            eq(kitchenId.toString()), eq(addressId.toString()), eq(KITCHEN_LAT), eq(KITCHEN_LNG), eq(HOME_LAT), eq(HOME_LNG));

        // Extra decimals are rounded to the cached 4-decimal points.
        var result = service.distance(kitchenId, addressId,
            new BigDecimal("17.448312"), new BigDecimal("78.39149"), HOME_LAT, HOME_LNG);

        assertEquals(new RoadDistance(1700, 420L, "CACHE"), result);
        verifyNoInteractions(maps);
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void cacheMissAsksOlaAndStoresTheAnswer() {
        doReturn(List.of()).when(jdbcTemplate).query(anyString(), any(RowMapper.class), any(Object[].class));
        when(maps.roadDistance(KITCHEN_LAT, KITCHEN_LNG, HOME_LAT, HOME_LNG)).thenReturn(new RoadDistance(1900, 480L, "OLA"));

        var result = service.distance(kitchenId, addressId, KITCHEN_LAT, KITCHEN_LNG, HOME_LAT, HOME_LNG);

        assertEquals(new RoadDistance(1900, 480L, "OLA"), result);
        verify(jdbcTemplate).update(anyString(), eq(kitchenId.toString()), eq(addressId.toString()),
            eq(KITCHEN_LAT), eq(KITCHEN_LNG), eq(HOME_LAT), eq(HOME_LNG), eq(1900L), eq(480L));
    }

    @Test
    void withoutIdsTheRoundedPointsAreTheKeys() {
        doReturn(List.of(new RoadDistance(1700, null, "CACHE"))).when(jdbcTemplate).query(
            anyString(), any(RowMapper.class),
            eq("17.4483,78.3915"), eq("17.4374,78.3897"), eq(KITCHEN_LAT), eq(KITCHEN_LNG), eq(HOME_LAT), eq(HOME_LNG));

        assertEquals(1700, service.distance(null, null, KITCHEN_LAT, KITCHEN_LNG, HOME_LAT, HOME_LNG).meters());
        verifyNoInteractions(maps);
    }

    @Test
    void olaFailureFallsBackToStraightLineTimesOnePointThreeAndIsNotCached() {
        doReturn(List.of()).when(jdbcTemplate).query(anyString(), any(RowMapper.class), any(Object[].class));
        when(maps.roadDistance(any(), any(), any(), any()))
            .thenThrow(new ApiException(503, "LOCATION_SEARCH_UNAVAILABLE", "timeout"));

        var result = service.distance(kitchenId, addressId, KITCHEN_LAT, KITCHEN_LNG, HOME_LAT, HOME_LNG);

        // Haversine 1227.0 m x 1.3.
        assertEquals(new RoadDistance(1595, null, "FALLBACK"), result);
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void fallbackIsHaversineTimesOnePointThree() {
        // One degree of latitude on R = 6,371 km is 111,194.93 m; x 1.3 = 144,553.4 m.
        assertEquals(144_553, RoadDistanceService.fallbackMeters(
            new BigDecimal("17"), new BigDecimal("78"), new BigDecimal("18"), new BigDecimal("78")));
        assertEquals(0, RoadDistanceService.fallbackMeters(KITCHEN_LAT, KITCHEN_LNG, KITCHEN_LAT, KITCHEN_LNG));
    }
}
