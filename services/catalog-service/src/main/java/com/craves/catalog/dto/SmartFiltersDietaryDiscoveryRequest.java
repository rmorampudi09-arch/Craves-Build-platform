package com.craves.catalog.dto;

public record SmartFiltersDietaryDiscoveryRequest(
        boolean veg,
        boolean healthy,
        int maxDeliveryMins,
        int maxPrice,
        String protein,
        String occasion,
        String customerId) {
}
