package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.AddCartItemRequest;
import in.craves.order.web.ApiDtos.UpdateCartItemRequest;
import jakarta.validation.Validation;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CartLimitsTest {
    @Test void httpRequestValidationEnforcesBothQuantityBounds() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (int quantity : new int[]{-1, 0, 101, Integer.MAX_VALUE}) {
                assertFalse(validator.validate(new AddCartItemRequest(UUID.randomUUID(), quantity)).isEmpty());
                assertFalse(validator.validate(new UpdateCartItemRequest(quantity)).isEmpty());
            }
            for (int quantity : new int[]{1, 100}) {
                assertTrue(validator.validate(new AddCartItemRequest(UUID.randomUUID(), quantity)).isEmpty());
                assertTrue(validator.validate(new UpdateCartItemRequest(quantity)).isEmpty());
            }
        }
    }

    @Test void internalCallCannotBypassLimitsOrCallTheCatalog() {
        var jdbc = mock(JdbcTemplate.class);
        var catalog = mock(CatalogClient.class);
        var service = new OrderService(jdbc, catalog, mock(CustomerAddressClient.class),
            new CheckoutSnapshotFactory(), mock(NotificationInternalClient.class));
        var customer = new CravesPrincipal(UUID.randomUUID(), "", Set.of("CUSTOMER"));
        for (int quantity : new int[]{0, 101, Integer.MAX_VALUE}) {
            assertEquals("CART_QUANTITY_LIMIT", assertThrows(OrderApiException.class,
                () -> service.addCartItem(customer, new AddCartItemRequest(UUID.randomUUID(), quantity))).code());
            assertEquals("CART_QUANTITY_LIMIT", assertThrows(OrderApiException.class,
                () -> service.updateCartItem(customer, UUID.randomUUID(), new UpdateCartItemRequest(quantity))).code());
        }
        verifyNoInteractions(jdbc, catalog);
    }
}
