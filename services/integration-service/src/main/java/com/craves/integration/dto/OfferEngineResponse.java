package com.craves.integration.dto;

import java.math.BigDecimal;

public record OfferEngineResponse(
        String id,
        String couponCode,
        String title,
        BigDecimal discountAmount,
        BigDecimal finalPayable,
        String walletLabel,
        boolean eligible) {
}
