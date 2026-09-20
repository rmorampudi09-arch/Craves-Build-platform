package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CartItemResponse;
import in.craves.order.web.ApiDtos.CartSnapshotRequest;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

/** Evaluated only while the customer cart row is locked by its transaction. */
public final class CartSafetyPolicy {
    private CartSafetyPolicy() {}

    public static void requireSingleKitchen(List<CartItemResponse> items) {
        if (items.stream().map(CartItemResponse::kitchenId).distinct().count() > 1) conflict();
    }

    public static void requireKitchen(List<CartItemResponse> items, UUID kitchen) {
        if (items.stream().anyMatch(item -> !kitchen.equals(item.kitchenId()))) conflict();
    }

    public static void requireSnapshot(UUID cartId, List<CartItemResponse> actual, CartSnapshotRequest expected) {
        if (expected == null || !cartId.equals(expected.cartId()) || expected.items() == null
            || actual.size() != expected.items().size()) changed();
        var seen = new HashSet<UUID>();
        for (var item : expected.items()) {
            if (item == null || item.id() == null || item.updatedAt() == null || item.quantity() < 1
                || !seen.add(item.id())) changed();
            boolean matches = actual.stream().anyMatch(value -> value.id().equals(item.id())
                && value.quantity() == item.quantity() && value.updatedAt().equals(item.updatedAt()));
            if (!matches) changed();
        }
    }

    private static void changed() {
        throw OrderApiException.conflict("CART_CHANGED", "Your cart changed. Review it before trying again.");
    }

    private static void conflict() {
        throw OrderApiException.conflict("CART_KITCHEN_CONFLICT", "Your cart contains dishes from another kitchen.");
    }
}
