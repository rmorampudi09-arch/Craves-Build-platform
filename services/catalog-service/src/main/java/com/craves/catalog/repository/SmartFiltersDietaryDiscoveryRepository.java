package com.craves.catalog.repository;

import com.craves.catalog.dto.SmartFiltersDietaryDiscoveryRequest;
import com.craves.catalog.entity.SmartFiltersDietaryDiscovery;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class SmartFiltersDietaryDiscoveryRepository {

    private final List<SmartFiltersDietaryDiscovery> cards = List.of(
            new SmartFiltersDietaryDiscovery("kitchen-veg-1", "Pure Veg Lunch Box", "Jain and no-onion options from Himayatnagar", 249, 28, List.of("VEG", "JAIN", "BUDGET"), 96),
            new SmartFiltersDietaryDiscovery("dish-protein-1", "High Protein Millet Combo", "Paneer, sprouts and millet bowl", 299, 24, List.of("VEG", "HEALTHY", "HIGH_PROTEIN"), 93),
            new SmartFiltersDietaryDiscovery("dish-special-1", "Today's Andhra Specials", "Limited quantity spicy home-style specials", 349, 35, List.of("TODAY_SPECIAL", "SPICY", "NON_VEG"), 91));

    private final Map<String, SmartFiltersDietaryDiscoveryRequest> preferences = new ConcurrentHashMap<>();

    public List<SmartFiltersDietaryDiscovery> findAll() {
        return cards;
    }

    public Map<String, List<String>> availableFilters() {
        return Map.of(
                "dietary", List.of("VEG", "NON_VEG", "JAIN", "HEALTHY"),
                "protein", List.of("HIGH_PROTEIN", "BALANCED"),
                "experience", List.of("BUDGET", "TODAY_SPECIAL", "SUBSCRIPTION_ELIGIBLE"));
    }

    public void savePreference(String customerId, SmartFiltersDietaryDiscoveryRequest request) {
        preferences.put(customerId, request);
    }
}
