package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.command.DeliveryCommandModels.CreateAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.QuoteAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

@Service
public class DeliveryProviderRouter {
    private static final BigDecimal UNKNOWN_PRICE = new BigDecimal("999999999");

    private final Map<String, DeliveryProviderAdapter> adapters;
    private final DeliveryProviderCatalogRepository providerCatalog;
    private final DeliveryCommandProperties properties;
    private final ExecutorService quoteExecutor = Executors.newVirtualThreadPerTaskExecutor();

    public DeliveryProviderRouter(List<DeliveryProviderAdapter> discoveredAdapters,
                                  DeliveryProviderCatalogRepository providerCatalog,
                                  DeliveryCommandProperties properties) {
        Map<String, DeliveryProviderAdapter> indexed = new HashMap<>();
        for (DeliveryProviderAdapter adapter : discoveredAdapters) {
            String providerId = normalize(adapter.providerId());
            DeliveryProviderAdapter previous = indexed.putIfAbsent(providerId, adapter);
            if (previous != null) {
                throw new IllegalStateException("Duplicate delivery provider adapter: " + providerId);
            }
        }
        this.adapters = Map.copyOf(indexed);
        this.providerCatalog = providerCatalog;
        this.properties = properties;
    }

    public RoutingResult route(DeliveryCommandMessage command) {
        Objects.requireNonNull(command, "delivery command is required");
        List<String> activeProviderIds = providerCatalog.activeProviderIds();
        if (activeProviderIds.isEmpty()) {
            throw new DeliveryRoutingException("No active delivery providers are configured");
        }

        List<QuoteAudit> quoteAudit = new ArrayList<>();
        List<Callable<QuoteOutcome>> tasks = new ArrayList<>();

        for (String configuredProviderId : activeProviderIds) {
            String providerId = normalize(configuredProviderId);
            DeliveryProviderAdapter adapter = adapters.get(providerId);
            if (adapter == null) {
                quoteAudit.add(new QuoteAudit(
                    providerId, false, false, null, null,
                    "Provider is active in the database but no adapter is deployed"
                ));
                continue;
            }
            tasks.add(() -> quote(adapter, command));
        }

        List<QuoteOutcome> outcomes = invokeQuotes(tasks, quoteAudit);
        List<QuoteOutcome> candidates = outcomes.stream()
            .filter(outcome -> outcome.quote() != null && outcome.quote().available())
            .sorted(Comparator
                .comparingInt(QuoteOutcome::pickupEtaMinutesForSort)
                .thenComparing(QuoteOutcome::priceForSort)
                .thenComparing(QuoteOutcome::providerId))
            .toList();

        if (candidates.isEmpty()) {
            throw new DeliveryRoutingException("No active delivery provider returned an available quote");
        }

        List<CreateAudit> createAudit = new ArrayList<>();
        int maximumAttempts = Math.min(properties.getMaxProviderAttempts(), candidates.size());
        String clientReference = clientReference(command.chefSubOrderId());

        for (int index = 0; index < maximumAttempts; index++) {
            QuoteOutcome candidate = candidates.get(index);
            try {
                ProviderDelivery delivery = candidate.adapter().create(
                    new CreateDeliveryRequest(clientReference, command.deliveryRequest())
                );
                if (delivery == null || delivery.providerDeliveryId() == null
                    || delivery.providerDeliveryId().isBlank()) {
                    throw new IllegalStateException("Provider returned no delivery identifier");
                }
                createAudit.add(new CreateAudit(candidate.providerId(), true, null));
                return new RoutingResult(
                    candidate.providerId(),
                    delivery,
                    List.copyOf(quoteAudit),
                    List.copyOf(createAudit)
                );
            } catch (RuntimeException ex) {
                createAudit.add(new CreateAudit(candidate.providerId(), false, safeMessage(ex)));
            }
        }

        throw new DeliveryRoutingException(
            "Delivery creation failed across " + maximumAttempts + " quoted provider attempt(s)"
        );
    }

    private QuoteOutcome quote(DeliveryProviderAdapter adapter, DeliveryCommandMessage command) {
        String providerId = normalize(adapter.providerId());
        try {
            ProviderQuote quote = adapter.quote(command.deliveryRequest());
            Integer pickupEtaMinutes = extractPickupEtaMinutes(quote == null ? null : quote.providerMetadata());
            return new QuoteOutcome(adapter, providerId, quote, pickupEtaMinutes, null);
        } catch (RuntimeException ex) {
            return new QuoteOutcome(adapter, providerId, null, null, safeMessage(ex));
        }
    }

    private List<QuoteOutcome> invokeQuotes(List<Callable<QuoteOutcome>> tasks, List<QuoteAudit> audit) {
        if (tasks.isEmpty()) {
            return List.of();
        }
        try {
            List<Future<QuoteOutcome>> futures = quoteExecutor.invokeAll(
                tasks,
                properties.quoteTimeout().toMillis(),
                TimeUnit.MILLISECONDS
            );
            List<QuoteOutcome> outcomes = new ArrayList<>();
            for (Future<QuoteOutcome> future : futures) {
                if (future.isCancelled()) {
                    audit.add(new QuoteAudit(
                        "unknown", false, false, null, null,
                        "Provider quote timed out after " + properties.getQuoteTimeoutSeconds() + " seconds"
                    ));
                    continue;
                }
                QuoteOutcome outcome = future.get();
                outcomes.add(outcome);
                audit.add(new QuoteAudit(
                    outcome.providerId(),
                    outcome.error() == null,
                    outcome.quote() != null && outcome.quote().available(),
                    outcome.pickupEtaMinutes(),
                    outcome.quote(),
                    outcome.error()
                ));
            }
            return outcomes;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new DeliveryRoutingException("Delivery provider quote fan-out was interrupted", ex);
        } catch (Exception ex) {
            throw new DeliveryRoutingException("Delivery provider quote fan-out failed", ex);
        }
    }

    private static Integer extractPickupEtaMinutes(JsonNode metadata) {
        if (metadata == null || metadata.isNull() || metadata.isMissingNode()) {
            return null;
        }
        for (String field : List.of(
            "pickup_eta_minutes",
            "estimated_pickup_minutes",
            "eta_minutes",
            "pickup_duration_minutes"
        )) {
            JsonNode value = metadata.path(field);
            if (value.canConvertToInt()) {
                return Math.max(0, value.asInt());
            }
        }
        JsonNode order = metadata.path("order");
        if (order.isObject()) {
            return extractPickupEtaMinutes(order);
        }
        return null;
    }

    private static String clientReference(java.util.UUID chefSubOrderId) {
        String compact = chefSubOrderId.toString().replace("-", "");
        return "CRV-" + compact.substring(0, 28);
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("providerId is required");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    @PreDestroy
    void closeExecutor() {
        quoteExecutor.close();
    }

    private record QuoteOutcome(
        DeliveryProviderAdapter adapter,
        String providerId,
        ProviderQuote quote,
        Integer pickupEtaMinutes,
        String error
    ) {
        int pickupEtaMinutesForSort() {
            return pickupEtaMinutes == null ? Integer.MAX_VALUE : pickupEtaMinutes;
        }

        BigDecimal priceForSort() {
            if (quote == null) {
                return UNKNOWN_PRICE;
            }
            if (quote.deliveryFeeAmount() != null) {
                return quote.deliveryFeeAmount();
            }
            return quote.paymentAmount() == null ? UNKNOWN_PRICE : quote.paymentAmount();
        }
    }

    public static class DeliveryRoutingException extends RuntimeException {
        public DeliveryRoutingException(String message) {
            super(message);
        }

        public DeliveryRoutingException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
