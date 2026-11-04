package in.craves.order.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.order.exception.OrderApiException;
import in.craves.order.schedule.ScheduledOrderService;
import in.craves.order.service.CatalogClient;
import in.craves.order.service.CheckoutSnapshotFactory;
import in.craves.order.service.CustomerAddressClient;
import in.craves.order.service.NotificationInternalClient;
import in.craves.order.service.OrderService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class AccountDeletionGuardTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final CatalogClient catalog = mock(CatalogClient.class);
    private final CustomerAddressClient addresses = mock(CustomerAddressClient.class);
    private final OrderService orders = new OrderService(jdbc, catalog, addresses, new CheckoutSnapshotFactory(),
        mock(NotificationInternalClient.class));
    private final NamedParameterJdbcTemplate namedJdbc = mock(NamedParameterJdbcTemplate.class);
    private final ScheduledOrderService schedules = new ScheduledOrderService(namedJdbc, new ObjectMapper(), Clock.systemUTC());

    private static CravesPrincipal customer(String deletionPendingScope) {
        return new CravesPrincipal(UUID.randomUUID(), "", Set.of("CUSTOMER"), deletionPendingScope);
    }

    private static void assertDeletionPending(OrderApiException ex) {
        assertEquals(409, ex.status().value());
        assertEquals("ACCOUNT_DELETION_PENDING", ex.code());
        assertEquals("Your account is set to be deleted. Tap Keep my account to order again.", ex.getMessage());
    }

    @Test void checkoutIsRefusedForCustomerOrWholeAccountDeletion() {
        for (String scope : new String[]{"CUSTOMER", "ALL"}) {
            // A null request would be a 400 once past the guard, so a 409 proves the guard runs first.
            assertDeletionPending(assertThrows(OrderApiException.class, () -> orders.checkout(customer(scope), null)));
            assertDeletionPending(assertThrows(OrderApiException.class,
                () -> AccountDeletionGuard.requireNoCustomerDeletion(customer(scope))));
        }
        verifyNoInteractions(jdbc, catalog, addresses);
    }

    @Test void chefOnlyDeletionStillOrders() {
        assertDoesNotThrow(() -> AccountDeletionGuard.requireNoCustomerDeletion(customer("CHEF")));
        assertDoesNotThrow(() -> AccountDeletionGuard.requireNoCustomerDeletion(customer(null)));
        // Past the guard, the null request is the ordinary 400, not the deletion 409.
        OrderApiException ex = assertThrows(OrderApiException.class, () -> orders.checkout(customer("CHEF"), null));
        assertEquals("DELIVERY_ADDRESS_REQUIRED", ex.code());
    }

    @Test void scheduledOrderCreateIsRefusedToo() {
        for (String scope : new String[]{"CUSTOMER", "ALL"}) {
            assertDeletionPending(assertThrows(OrderApiException.class,
                () -> schedules.createSchedule(customer(scope), UUID.randomUUID(), "key", null)));
        }
        verifyNoInteractions(namedJdbc);
    }
}
