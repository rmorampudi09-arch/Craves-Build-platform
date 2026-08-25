package com.craves.catalog.entity;

import java.util.List;

public record SmartFiltersDietaryDiscovery(
        String id,
        String title,
        String subtitle,
        int priceForTwo,
        int deliveryEtaMinutes,
        List<String> tags,
        int relevance) {
}
