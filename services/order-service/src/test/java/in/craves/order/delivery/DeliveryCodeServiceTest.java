package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class DeliveryCodeServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final DeliveryCodeService service = new DeliveryCodeService(jdbc);
    private final UUID orderId = UUID.randomUUID();

    @Test
    void generatedCodesAreAlwaysFourDigitsAndNeverOverwriteAnExistingCode() {
        for (int i = 0; i < 200; i++) {
            service.ensureCode(orderId);
        }

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> code = ArgumentCaptor.forClass(Object.class);
        verify(jdbc, times(200)).update(sql.capture(), eq(orderId), code.capture());
        assertThat(sql.getValue()).contains("ON CONFLICT (order_id) DO NOTHING");
        assertThat(code.getAllValues()).allSatisfy(value -> assertThat((String) value).matches("[0-9]{4}"));
    }

    @Test
    void borzoPidgeAndCravesRidersBeforePickupOrAfterDeliveryNeverSeeTheCode() {
        assertThat(service.codeForCustomer(orderId, "borzo", "IN_TRANSIT")).isNull();
        assertThat(service.codeForCustomer(orderId, "pidge", "AT_DROPOFF")).isNull();
        assertThat(service.codeForCustomer(orderId, null, "PICKED_UP")).isNull();
        assertThat(service.codeForCustomer(orderId, "craves_fleet", "COURIER_ASSIGNED")).isNull();
        assertThat(service.codeForCustomer(orderId, "craves_fleet", "AT_PICKUP")).isNull();
        assertThat(service.codeForCustomer(orderId, "craves_fleet", "DELIVERED")).isNull();
        assertThat(service.codeForCustomer(orderId, "craves_fleet", null)).isNull();
        verifyNoInteractions(jdbc);
    }

    @Test
    @SuppressWarnings("unchecked")
    void cravesRiderCarryingTheOrderShowsTheUnverifiedCode() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId))).thenReturn(List.of("0427"));

        for (String status : List.of("PICKED_UP", "IN_TRANSIT", "AT_DROPOFF")) {
            assertThat(service.codeForCustomer(orderId, "craves_fleet", status)).isEqualTo("0427");
        }
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(3)).query(sql.capture(), any(RowMapper.class), eq(orderId));
        assertThat(sql.getValue()).contains("verified_at IS NULL");
    }

    @Test
    @SuppressWarnings("unchecked")
    void verifiedCodeIsNoLongerShown() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId))).thenReturn(List.of());

        assertThat(service.codeForCustomer(orderId, "craves_fleet", "AT_DROPOFF")).isNull();
    }
}
