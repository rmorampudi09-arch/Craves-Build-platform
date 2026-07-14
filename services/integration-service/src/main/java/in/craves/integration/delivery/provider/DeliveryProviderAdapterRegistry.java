package in.craves.integration.delivery.provider;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class DeliveryProviderAdapterRegistry {
    private final Map<String, DeliveryProviderAdapter> adapters;

    public DeliveryProviderAdapterRegistry(List<DeliveryProviderAdapter> discoveredAdapters) {
        Map<String, DeliveryProviderAdapter> indexed = new LinkedHashMap<>();
        for (DeliveryProviderAdapter adapter : discoveredAdapters) {
            String providerId = normalize(adapter.providerId());
            DeliveryProviderAdapter previous = indexed.putIfAbsent(providerId, adapter);
            if (previous != null) {
                throw new IllegalStateException("Duplicate delivery provider adapter: " + providerId);
            }
        }
        this.adapters = Map.copyOf(indexed);
    }

    public DeliveryProviderAdapter require(String providerId) {
        DeliveryProviderAdapter adapter = adapters.get(normalize(providerId));
        if (adapter == null) {
            throw new IllegalArgumentException("No delivery provider adapter is registered for " + providerId);
        }
        return adapter;
    }

    public boolean contains(String providerId) {
        return adapters.containsKey(normalize(providerId));
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("providerId is required");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
