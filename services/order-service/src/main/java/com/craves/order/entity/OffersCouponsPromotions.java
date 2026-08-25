package com.craves.order.entity;

import java.util.List;

public record OffersCouponsPromotions(
        String code,
        String title,
        String description,
        int minOrderValue,
        int discountAmount,
        String reason,
        List<String> tags) {
}
