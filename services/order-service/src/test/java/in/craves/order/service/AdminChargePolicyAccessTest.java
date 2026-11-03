package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.order.security.CravesPrincipal;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class AdminChargePolicyAccessTest {
    /** Audit N1: GET /api/v1/admin/charge-policy/current answered any signed-in token; it now needs the admin role, like the POST. */
    @Test void onlyAnAdminReadsTheChargePolicy() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new OrderService(jdbc, mock(CatalogClient.class), mock(CustomerAddressClient.class),
            new CheckoutSnapshotFactory(), mock(NotificationInternalClient.class));
        for (var caller : new CravesPrincipal[]{null, new CravesPrincipal(UUID.randomUUID(), "", Set.of("CUSTOMER")),
                new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF"))}) {
            assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.currentChargePolicyForAdmin(caller)).getStatusCode().value());
        }
        verifyNoInteractions(jdbc);
    }
}
