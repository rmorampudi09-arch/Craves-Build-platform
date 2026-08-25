package com.craves.catalog.dto;

import java.math.BigDecimal;

public record AdvancedSearchResponse(
        String id,
        String dishName,
        String chefName,
        String cuisine,
        String locality,
        boolean veg,
        boolean healthy,
        BigDecimal price,
        double rating,
        int etaMinutes,
        String tags) {
}
