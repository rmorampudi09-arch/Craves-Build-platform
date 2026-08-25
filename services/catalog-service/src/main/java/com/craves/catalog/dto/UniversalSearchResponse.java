package com.craves.catalog.dto;

import java.util.List;
import java.util.Map;

public record UniversalSearchResponse(
        String query,
        int page,
        int size,
        int total,
        Map<String, Long> counts,
        List<SearchHit> hits,
        List<String> suggestions) {

    public record SearchHit(
            String id,
            String type,
            String title,
            String subtitle,
            String imageUrl,
            Double distanceKm,
            Integer deliveryEtaMinutes,
            boolean availableNow,
            double score,
            List<String> tags) {
    }
}
