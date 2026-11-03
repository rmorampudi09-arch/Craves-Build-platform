package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.AdminChargePolicyController;
import in.craves.order.web.ApiDtos.ChargePolicyResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

class AdminChargePolicyAccessTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AdminChargePolicyController controller = new AdminChargePolicyController(new OrderService(jdbc,
        mock(CatalogClient.class), mock(CustomerAddressClient.class), new CheckoutSnapshotFactory(), mock(NotificationInternalClient.class)));

    /** Audit N1: GET /api/v1/admin/charge-policy/current answered any signed-in token; it now needs the admin role, like the POST. */
    @Test void customersChefsAndAnonymousCallersCannotReadTheChargePolicy() {
        for (var caller : new CravesPrincipal[]{null, new CravesPrincipal(UUID.randomUUID(), "", Set.of("CUSTOMER")),
                new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF"))}) {
            assertEquals(403, assertThrows(ResponseStatusException.class, () -> controller.current(caller)).getStatusCode().value());
        }
        verifyNoInteractions(jdbc);
    }

    @SuppressWarnings("unchecked")
    @Test void anAdminStillReadsTheActivePolicy() {
        var policy = new ChargePolicyResponse(UUID.randomUUID(), "ADMIN_CHARGE_POLICY", BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.TEN,
            BigDecimal.ZERO, true, Instant.now());
        when(jdbc.query(anyString(), any(RowMapper.class))).thenReturn(List.of(policy));
        assertSame(policy, controller.current(new CravesPrincipal(UUID.randomUUID(), "", Set.of("ADMIN"))));
    }
}
