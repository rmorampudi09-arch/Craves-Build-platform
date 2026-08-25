package com.craves.catalog.dto;

import java.math.BigDecimal;

public record AdvancedSearchRequest(
        String query,
        Boolean vegOnly,
        Boolean healthyOnly,
        BigDecimal maxPrice) {
    public boolean vegOnly() { return Boolean.TRUE.equals(vegOnly); }
    public boolean healthyOnly() { return Boolean.TRUE.equals(healthyOnly); }
}
