package in.craves.order.service;

import static org.assertj.core.api.Assertions.*;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CartSafetyPolicyTest {
    final UUID cart = UUID.randomUUID(), kitchen = UUID.randomUUID(), id = UUID.randomUUID();
    final Instant at = Instant.parse("2026-09-13T01:00:00.123456Z");
    CartItemResponse line(UUID kitchenId) {
        return new CartItemResponse(id, UUID.randomUUID(), kitchenId, "Test dish", "Test kitchen", BigDecimal.TEN,
            "INR", 2, new BigDecimal("20"), at, at);
    }
    CartSnapshotRequest snapshot(int quantity, Instant updated) {
        return new CartSnapshotRequest(cart, List.of(new CartSnapshotItem(id, quantity, updated)));
    }
    @Test void sameKitchenAndEmptyCartAreAllowed() {
        assertThatCode(() -> CartSafetyPolicy.requireKitchen(List.of(line(kitchen)), kitchen)).doesNotThrowAnyException();
        assertThatCode(() -> CartSafetyPolicy.requireKitchen(List.of(), kitchen)).doesNotThrowAnyException();
    }
    @Test void differentKitchenDoesNotSilentlyReplaceCart() {
        assertThatThrownBy(() -> CartSafetyPolicy.requireKitchen(List.of(line(kitchen)), UUID.randomUUID()))
            .isInstanceOf(OrderApiException.class).hasMessageContaining("another kitchen");
    }
    @Test void mixedLegacyCartCannotCheckout() {
        assertThatThrownBy(() -> CartSafetyPolicy.requireSingleKitchen(List.of(line(kitchen), line(UUID.randomUUID()))))
            .isInstanceOf(OrderApiException.class);
    }
    @Test void exactSnapshotAndEmptySnapshotMatch() {
        assertThatCode(() -> CartSafetyPolicy.requireSnapshot(cart, List.of(line(kitchen)), snapshot(2, at))).doesNotThrowAnyException();
        assertThatCode(() -> CartSafetyPolicy.requireSnapshot(cart, List.of(), new CartSnapshotRequest(cart, List.of())))
            .doesNotThrowAnyException();
    }
    @Test void quantityAndTimestampChangesRejectConsent() {
        for (var expected : List.of(snapshot(1, at), snapshot(2, at.minusNanos(1)))) {
            assertThatThrownBy(() -> CartSafetyPolicy.requireSnapshot(cart, List.of(line(kitchen)), expected))
                .isInstanceOf(OrderApiException.class).hasMessageContaining("cart changed");
        }
    }
    @Test void anotherCartNewLineOrDuplicateIdsRejectConsent() {
        var item = new CartSnapshotItem(id, 2, at);
        for (var expected : List.of(new CartSnapshotRequest(UUID.randomUUID(), List.of(item)),
            new CartSnapshotRequest(cart, List.of()), new CartSnapshotRequest(cart, List.of(item, item)))) {
            assertThatThrownBy(() -> CartSafetyPolicy.requireSnapshot(cart, List.of(line(kitchen)), expected))
                .isInstanceOf(OrderApiException.class);
        }
        assertThatThrownBy(() -> CartSafetyPolicy.requireSnapshot(cart, List.of(line(kitchen), line(kitchen)),
            new CartSnapshotRequest(cart, List.of(item, item)))).isInstanceOf(OrderApiException.class);
    }
}
