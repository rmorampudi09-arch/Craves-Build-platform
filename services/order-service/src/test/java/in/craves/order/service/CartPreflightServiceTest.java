package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.ResolvedCatalogMenuItem;
import in.craves.order.web.ApiDtos.CartItemResponse;
import in.craves.order.web.ApiDtos.CartResponse;
import in.craves.order.web.ApiDtos.CartTotalsResponse;
import in.craves.order.web.CartPreflightDtos.CartPreflightIssueCode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CartPreflightServiceTest {
    private final OrderService orderService = mock(OrderService.class);
    private final CatalogClient catalogClient = mock(CatalogClient.class);
    private final CartPreflightService service = new CartPreflightService(orderService, catalogClient);

    @Test
    void separatesBlockingAvailabilityIssuesFromReviewOnlyPriceChanges() {
        UUID customerId = UUID.randomUUID();
        UUID cartId = UUID.randomUUID();
        UUID kitchenId = UUID.randomUUID();
        UUID availableItemId = UUID.randomUUID();
        UUID unavailableItemId = UUID.randomUUID();
        CravesPrincipal principal = new CravesPrincipal(customerId, "+919999999999", Set.of("CUSTOMER"));
        Instant now = Instant.now();
        CartItemResponse priceChanged = new CartItemResponse(
            UUID.randomUUID(), availableItemId, kitchenId, "Pappu", "Home Kitchen",
            new BigDecimal("120.00"), "INR", 1, new BigDecimal("120.00"), now, now
        );
        CartItemResponse unavailable = new CartItemResponse(
            UUID.randomUUID(), unavailableItemId, kitchenId, "Pulusu", "Home Kitchen",
            new BigDecimal("100.00"), "INR", 1, new BigDecimal("100.00"), now, now
        );
        when(orderService.getCart(principal)).thenReturn(new CartResponse(
            cartId,
            customerId,
            "INR",
            List.of(priceChanged, unavailable),
            new CartTotalsResponse(new BigDecimal("220.00"), "INR")
        ));
        when(catalogClient.resolveActiveMenuItems(List.of(availableItemId, unavailableItemId))).thenReturn(List.of(
            new ResolvedCatalogMenuItem(
                availableItemId,
                kitchenId,
                "Pappu",
                new BigDecimal("130.00"),
                "INR",
                500,
                false
            )
        ));

        var result = service.inspect(principal);

        assertThat(result.readyForCurrentCheckoutValidation()).isFalse();
        assertThat(result.hasReviewChanges()).isTrue();
        assertThat(result.blockingIssueCount()).isEqualTo(1);
        assertThat(result.reviewChangeCount()).isEqualTo(1);
        assertThat(result.items().get(0).issues()).containsExactly(CartPreflightIssueCode.PRICE_CHANGED);
        assertThat(result.items().get(0).blockingIssue()).isFalse();
        assertThat(result.items().get(1).issues()).containsExactly(CartPreflightIssueCode.MENU_ITEM_UNAVAILABLE);
        assertThat(result.items().get(1).blockingIssue()).isTrue();
    }

    @Test
    void missingDeliveryMetadataIsBlockingWithoutChangingCart() {
        UUID customerId = UUID.randomUUID();
        UUID cartId = UUID.randomUUID();
        UUID kitchenId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        CravesPrincipal principal = new CravesPrincipal(customerId, null, Set.of("CUSTOMER"));
        CartItemResponse item = new CartItemResponse(
            UUID.randomUUID(), itemId, kitchenId, "Annam", "Kitchen",
            BigDecimal.TEN, "INR", 1, BigDecimal.TEN, Instant.now(), Instant.now()
        );
        when(orderService.getCart(principal)).thenReturn(new CartResponse(
            cartId, customerId, "INR", List.of(item), new CartTotalsResponse(BigDecimal.TEN, "INR")
        ));
        when(catalogClient.resolveActiveMenuItems(List.of(itemId))).thenReturn(List.of(
            new ResolvedCatalogMenuItem(itemId, kitchenId, "Annam", BigDecimal.TEN, "INR", null, null)
        ));

        var result = service.inspect(principal);

        assertThat(result.readyForCurrentCheckoutValidation()).isFalse();
        assertThat(result.items().getFirst().issues()).containsExactly(CartPreflightIssueCode.DELIVERY_METADATA_MISSING);
    }
}
