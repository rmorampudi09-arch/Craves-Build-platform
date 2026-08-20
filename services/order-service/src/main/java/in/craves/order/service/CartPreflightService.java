package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.ResolvedCatalogMenuItem;
import in.craves.order.web.ApiDtos.CartItemResponse;
import in.craves.order.web.ApiDtos.CartResponse;
import in.craves.order.web.CartPreflightDtos.CartItemPreflightResponse;
import in.craves.order.web.CartPreflightDtos.CartPreflightIssueCode;
import in.craves.order.web.CartPreflightDtos.CartPreflightResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class CartPreflightService {
    private final OrderService orderService;
    private final CatalogClient catalogClient;

    public CartPreflightService(OrderService orderService, CatalogClient catalogClient) {
        this.orderService = orderService;
        this.catalogClient = catalogClient;
    }

    public CartPreflightResponse inspect(CravesPrincipal principal) {
        CartResponse cart = orderService.getCart(principal);
        List<UUID> menuItemIds = cart.items().stream()
            .map(CartItemResponse::menuItemId)
            .distinct()
            .toList();
        Map<UUID, ResolvedCatalogMenuItem> currentById = new LinkedHashMap<>();
        for (ResolvedCatalogMenuItem item : catalogClient.resolveActiveMenuItems(menuItemIds)) {
            if (item != null && item.id() != null) {
                currentById.put(item.id(), item);
            }
        }

        List<CartItemPreflightResponse> results = new ArrayList<>(cart.items().size());
        int blockingIssueCount = 0;
        int reviewChangeCount = 0;
        for (CartItemResponse cartItem : cart.items()) {
            ResolvedCatalogMenuItem current = currentById.get(cartItem.menuItemId());
            List<CartPreflightIssueCode> issues = new ArrayList<>();
            boolean blocking = false;
            boolean reviewChange = false;

            if (current == null) {
                issues.add(CartPreflightIssueCode.MENU_ITEM_UNAVAILABLE);
                blocking = true;
            } else {
                if (current.unitPackageWeightGrams() == null
                    || current.unitPackageWeightGrams() <= 0
                    || current.thermoboxRequired() == null) {
                    issues.add(CartPreflightIssueCode.DELIVERY_METADATA_MISSING);
                    blocking = true;
                }
                if (cartItem.unitPrice() != null
                    && current.price() != null
                    && cartItem.unitPrice().compareTo(current.price()) != 0) {
                    issues.add(CartPreflightIssueCode.PRICE_CHANGED);
                    reviewChange = true;
                }
                if (cartItem.kitchenId() != null && !cartItem.kitchenId().equals(current.kitchenId())) {
                    issues.add(CartPreflightIssueCode.KITCHEN_CHANGED);
                    reviewChange = true;
                }
                if (cartItem.itemName() != null
                    && current.itemName() != null
                    && !cartItem.itemName().equals(current.itemName())) {
                    issues.add(CartPreflightIssueCode.ITEM_NAME_CHANGED);
                    reviewChange = true;
                }
            }

            if (blocking) {
                blockingIssueCount++;
            }
            if (reviewChange) {
                reviewChangeCount++;
            }
            results.add(new CartItemPreflightResponse(
                cartItem.id(),
                cartItem.menuItemId(),
                cartItem.quantity(),
                current != null,
                blocking,
                cartItem.unitPrice(),
                current == null ? null : current.price(),
                cartItem.kitchenId(),
                current == null ? null : current.kitchenId(),
                cartItem.itemName(),
                current == null ? null : current.itemName(),
                List.copyOf(issues)
            ));
        }

        return new CartPreflightResponse(
            cart.id(),
            blockingIssueCount == 0,
            reviewChangeCount > 0,
            cart.items().size(),
            blockingIssueCount,
            reviewChangeCount,
            Instant.now(),
            List.copyOf(results)
        );
    }
}
