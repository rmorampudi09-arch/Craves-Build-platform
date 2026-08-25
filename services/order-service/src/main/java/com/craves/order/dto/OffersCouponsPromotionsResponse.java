package com.craves.order.dto;

import java.util.List;

public record OffersCouponsPromotionsResponse(
        String code,
        String title,
        boolean eligible,
        int discountApplied,
        int finalTotal,
        String reason,
        List<PromotionCard> activeOffers) {

    public record PromotionCard(
            String code,
            String title,
            String description,
            int minOrderValue,
            int discountAmount,
            List<String> tags) {
    }
}
