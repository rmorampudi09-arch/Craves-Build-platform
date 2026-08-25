package com.craves.notification.repository;

import com.craves.notification.entity.ReactNativeCustomerAppMvp;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class ReactNativeCustomerAppMvpRepository {

    private final Map<String, String> pushTokens = new ConcurrentHashMap<>();

    public ReactNativeCustomerAppMvp findByCustomerId(String customerId) {
        return new ReactNativeCustomerAppMvp(
                customerId,
                pushTokens.containsKey(customerId),
                "craves://app",
                List.of("Auth", "Home", "KitchenDetails", "DishDetails", "Cart", "Checkout", "Orders", "Tracking", "Notifications", "Profile", "Wishlist"),
                List.of("Your order is out for delivery", "New chef special dropped nearby", "Wallet coins are ready to redeem"));
    }

    public void registerPush(String customerId, String pushToken) {
        pushTokens.put(customerId, pushToken);
    }
}
