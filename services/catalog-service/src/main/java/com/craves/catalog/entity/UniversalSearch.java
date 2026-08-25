package com.craves.catalog.entity;

import java.util.List;

public record UniversalSearch(
        String id,
        String type,
        String displayName,
        String subtitle,
        String imageUrl,
        String queryText,
        Double distanceKm,
        Integer deliveryEtaMinutes,
        boolean availableNow,
        int popularity,
        List<String> tags) {
}
