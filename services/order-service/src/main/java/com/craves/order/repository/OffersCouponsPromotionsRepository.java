package com.craves.order.repository;

import com.craves.order.entity.OffersCouponsPromotions;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class OffersCouponsPromotionsRepository {

    private final List<OffersCouponsPromotions> promotions = List.of(
            new OffersCouponsPromotions("WELCOME100", "₹100 off first order", "For first-time Craves customers above ₹399", 399, 100, "First order eligible", List.of("FIRST_ORDER", "INTRO")),
            new OffersCouponsPromotions("FREEDEL", "Free delivery", "Free delivery above ₹249 in select localities", 249, 49, "Delivery fee waived", List.of("FREE_DELIVERY", "LOCALITY")));

    private final Map<String, List<String>> redemptions = new ConcurrentHashMap<>();

    public OffersCouponsPromotions findByCode(String code) {
        return promotions.stream().filter(promo -> promo.code().equalsIgnoreCase(code)).findFirst().orElse(promotions.get(0));
    }

    public List<OffersCouponsPromotions> activeOffers() {
        return promotions;
    }

    public void recordRedemption(String customerId, String code) {
        redemptions.merge(customerId, List.of(code), (current, incoming) -> {
            java.util.ArrayList<String> updated = new java.util.ArrayList<>(current);
            updated.addAll(incoming);
            return updated;
        });
    }
}
