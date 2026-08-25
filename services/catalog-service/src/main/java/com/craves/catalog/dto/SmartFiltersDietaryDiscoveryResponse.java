package com.craves.catalog.dto;

import java.util.List;
import java.util.Map;

public record SmartFiltersDietaryDiscoveryResponse(
        List<DiscoveryCard> cards,
        Map<String, List<String>> filters,
        List<String> collections) {

    public record DiscoveryCard(
            String id,
            String title,
            String subtitle,
            int priceForTwo,
            int deliveryEtaMinutes,
            List<String> tags,
            int relevance) {
    }
}
