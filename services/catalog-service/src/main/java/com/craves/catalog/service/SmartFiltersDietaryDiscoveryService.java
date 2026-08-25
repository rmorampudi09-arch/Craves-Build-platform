package com.craves.catalog.service;

import com.craves.catalog.dto.SmartFiltersDietaryDiscoveryRequest;
import com.craves.catalog.dto.SmartFiltersDietaryDiscoveryResponse;
import com.craves.catalog.entity.SmartFiltersDietaryDiscovery;
import com.craves.catalog.repository.SmartFiltersDietaryDiscoveryRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SmartFiltersDietaryDiscoveryService {

    private final SmartFiltersDietaryDiscoveryRepository repository;

    public SmartFiltersDietaryDiscoveryService(SmartFiltersDietaryDiscoveryRepository repository) {
        this.repository = repository;
    }

    public Map<String, List<String>> availableFilters() {
        return repository.availableFilters();
    }

    public List<String> dietaryCollections() {
        return List.of("Veg", "Healthy", "High Protein", "Budget Meals", "Today's Specials");
    }

    public SmartFiltersDietaryDiscoveryResponse discover(SmartFiltersDietaryDiscoveryRequest request) {
        List<SmartFiltersDietaryDiscoveryResponse.DiscoveryCard> cards = repository.findAll().stream()
                .filter(card -> !request.veg() || card.tags().contains("VEG"))
                .filter(card -> !request.healthy() || card.tags().contains("HEALTHY"))
                .filter(card -> request.maxDeliveryMins() <= 0 || card.deliveryEtaMinutes() <= request.maxDeliveryMins())
                .filter(card -> request.maxPrice() <= 0 || card.priceForTwo() <= request.maxPrice())
                .filter(card -> !StringUtils.hasText(request.protein()) || card.tags().contains(request.protein().toUpperCase()))
                .sorted(Comparator.comparingInt(SmartFiltersDietaryDiscovery::relevance).reversed())
                .map(card -> new SmartFiltersDietaryDiscoveryResponse.DiscoveryCard(
                        card.id(),
                        card.title(),
                        card.subtitle(),
                        card.priceForTwo(),
                        card.deliveryEtaMinutes(),
                        card.tags(),
                        card.relevance()))
                .toList();
        return new SmartFiltersDietaryDiscoveryResponse(cards, availableFilters(), dietaryCollections());
    }

    public void savePreference(String customerId, SmartFiltersDietaryDiscoveryRequest request) {
        if (StringUtils.hasText(customerId)) {
            repository.savePreference(customerId, request);
        }
    }
}
