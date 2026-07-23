package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentRequest;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateInput;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateScore;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus;
import in.craves.integration.delivery.DeliveryIntelligenceService;
import in.craves.integration.delivery.command.DeliveryCommandModels.CreateAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.QuoteAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

@Service
public class DeliveryProviderRouter {
    private final Map<String, DeliveryProviderAdapter> adapters;
    private final DeliveryProviderCatalogRepository providerCatalog;
    private final DeliveryIntelligenceService intelligenceService;
    private final DeliveryAssignmentRepository assignmentRepository;
    private final DeliveryCommandProperties properties;
    private final ExecutorService quoteExecutor = Executors.newVirtualThreadPerTaskExecutor();

    public DeliveryProviderRouter(List<DeliveryProviderAdapter> discoveredAdapters,
                                  DeliveryProviderCatalogRepository providerCatalog,
                                  DeliveryIntelligenceService intelligenceService,
                                  DeliveryAssignmentRepository assignmentRepository,
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
        this.intelligenceService = intelligenceService;
        this.assignmentRepository = assignmentRepository;
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
                    providerId, false, false, null, null, null,
                    "Provider is active in the database but no adapter is deployed"
                ));
                continue;
            }
            tasks.add(() -> quote(adapter, command));
        }

        List<QuoteOutcome> outcomes = invokeQuotes(tasks, quoteAudit);
        boolean anyAvailableQuote = outcomes.stream()
            .anyMatch(outcome -> outcome.quote() != null && outcome.quote().available());
        if (!anyAvailableQuote) {
            throw new DeliveryRoutingException("No active delivery provider returned an available quote");
        }

        AssignmentResponse assignment = intelligenceService.assign(
            assignmentRequest(command, outcomes)
        );
        List<RankedQuoteOutcome> candidates = orderByIntelligence(assignment, outcomes);
        if (candidates.isEmpty()) {
            throw new DeliveryRoutingException(
                "The persisted intelligent assignment has no currently available provider quote"
            );
        }

        List<CreateAudit> createAudit = new ArrayList<>();
        int maximumAttempts = Math.min(properties.getMaxProviderAttempts(), candidates.size());
        String clientReference = clientReference(command.chefSubOrderId());

        for (int index = 0; index < maximumAttempts; index++) {
            RankedQuoteOutcome ranked = candidates.get(index);
            QuoteOutcome candidate = ranked.outcome();
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
                    assignment,
                    ranked.candidate().candidateId(),
                    List.copyOf(quoteAudit),
                    List.copyOf(createAudit)
                );
            } catch (ProviderCreateUncertainException ex) {
                createAudit.add(new CreateAudit(
                    candidate.providerId(), false, "Provider create outcome requires reconciliation"
                ));
                throw new DeliveryCreateReconciliationPendingException(
                    ex.providerId(),
                    ex.clientReference(),
                    ex.attemptedAt(),
                    "Provider create response was not received; fallback is blocked",
                    ex
                );
            } catch (RuntimeException ex) {
                createAudit.add(new CreateAudit(candidate.providerId(), false, safeMessage(ex)));
            }
        }

        throw new DeliveryRoutingException(
            "Delivery creation failed across " + maximumAttempts + " intelligently ranked provider attempt(s)"
        );
    }

    /**
     * Performs a read-only reconciliation for an uncertain provider create. This method never calls
     * the provider create operation and never falls back to another provider.
     */
    public RoutingResult reconcile(CommandRecord command) {
        Objects.requireNonNull(command, "delivery command is required");
        String providerId = normalize(command.reconciliationProviderId());
        String clientReference = requireText(
            command.reconciliationClientReference(), "reconciliation client reference"
        );
        Instant attemptedAt = Objects.requireNonNull(
            command.reconciliationStartedAt(), "reconciliation startedAt is required"
        );

        DeliveryProviderAdapter adapter = adapters.get(providerId);
        if (adapter == null) {
            throw new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                "No deployed adapter is available for reconciliation",
                null
            );
        }

        AssignmentResponse assignment = assignmentRepository
            .findByChefSubOrderId(command.chefSubOrderId())
            .orElseThrow(() -> new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                "The persisted delivery assignment is missing",
                null
            ));

        CandidateScore candidate = assignment.candidates().stream()
            .filter(value -> providerId.equals(normalize(value.providerId())))
            .findFirst()
            .orElseThrow(() -> new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                "The provider is not present in the persisted assignment",
                null
            ));

        CreateReconciliationResult result = adapter.reconcileCreate(clientReference, attemptedAt);
        return switch (result.status()) {
            case FOUND -> new RoutingResult(
                providerId,
                result.delivery(),
                assignment,
                candidate.candidateId(),
                List.of(),
                List.of(new CreateAudit(providerId, true, "RECOVERED_BY_CLIENT_REFERENCE"))
            );
            case NOT_FOUND, INCONCLUSIVE, UNSUPPORTED -> throw new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                result.detail() == null ? "Provider create reconciliation is still unresolved" : result.detail(),
                null
            );
        };
    }

    private AssignmentRequest assignmentRequest(DeliveryCommandMessage command,
                                                 List<QuoteOutcome> outcomes) {
        List<CandidateInput> candidates = outcomes.stream()
            .filter(outcome -> outcome.quote() != null)
            .map(this::candidateInput)
            .toList();
        if (candidates.isEmpty()) {
            throw new DeliveryRoutingException("No provider quote could be submitted to delivery intelligence");
        }
        return new AssignmentRequest(
            command.chefSubOrderId(),
            command.orderId(),
            command.distanceKm(),
            command.orderHour(),
            command.dayOfWeek(),
            command.area(),
            null,
            candidates
        );
    }

    private CandidateInput candidateInput(QuoteOutcome outcome) {
        ProviderQuote quote = outcome.quote();
        return new CandidateInput(
            outcome.providerId(),
            extractText(quote.providerMetadata(), List.of("provider_quote_id", "quote_id", "order_id")),
            extractText(quote.providerMetadata(), List.of("agent_id", "courier_id")),
            outcome.pickupDistanceKm(),
            outcome.pickupEtaMinutes() == null ? null : outcome.pickupEtaMinutes().doubleValue(),
            quotedCost(quote),
            quote.currency(),
            quote.available(),
            quote.providerMetadata()
        );
    }

    private static List<RankedQuoteOutcome> orderByIntelligence(AssignmentResponse assignment,
                                                                 List<QuoteOutcome> outcomes) {
        Map<String, QuoteOutcome> availableOutcomes = new HashMap<>();
        for (QuoteOutcome outcome : outcomes) {
            if (outcome.quote() != null && outcome.quote().available()) {
                availableOutcomes.put(normalize(outcome.providerId()), outcome);
            }
        }

        Map<String, CandidateScore> rankedCandidates = new LinkedHashMap<>();
        assignment.candidates().stream()
            .filter(candidate -> candidate.status() != CandidateStatus.SKIPPED)
            .sorted(Comparator.comparingInt(CandidateScore::rank))
            .forEach(candidate -> rankedCandidates.putIfAbsent(
                normalize(candidate.providerId()), candidate
            ));

        List<String> orderedProviderIds = new ArrayList<>();
        if (assignment.selectedProviderId() != null) {
            orderedProviderIds.add(normalize(assignment.selectedProviderId()));
        }
        for (String providerId : rankedCandidates.keySet()) {
            if (!orderedProviderIds.contains(providerId)) {
                orderedProviderIds.add(providerId);
            }
        }

        List<RankedQuoteOutcome> ordered = new ArrayList<>();
        for (String providerId : orderedProviderIds) {
            QuoteOutcome outcome = availableOutcomes.get(providerId);
            CandidateScore candidate = rankedCandidates.get(providerId);
            if (outcome != null && candidate != null) {
                ordered.add(new RankedQuoteOutcome(candidate, outcome));
            }
        }
        return List.copyOf(ordered);
    }

    private QuoteOutcome quote(DeliveryProviderAdapter adapter, DeliveryCommandMessage command) {
        String providerId = normalize(adapter.providerId());
        try {
            ProviderQuote quote = adapter.quote(command.deliveryRequest());
            JsonNode metadata = quote == null ? null : quote.providerMetadata();
            Integer pickupEtaMinutes = extractPickupEtaMinutes(metadata);
            Double pickupDistanceKm = extractPickupDistanceKm(metadata);
            return new QuoteOutcome(
                adapter, providerId, quote, pickupDistanceKm, pickupEtaMinutes, null
            );
        } catch (RuntimeException ex) {
            return new QuoteOutcome(adapter, providerId, null, null, null, safeMessage(ex));
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
                        "unknown", false, false, null, null, null,
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
                    outcome.pickupDistanceKm(),
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
        Double value = extractNumber(metadata, List.of(
            "pickup_eta_minutes",
            "estimated_pickup_minutes",
            "eta_minutes",
            "pickup_duration_minutes"
        ));
        return value == null ? null : Math.max(0, (int) Math.ceil(value));
    }

    private static Double extractPickupDistanceKm(JsonNode metadata) {
        Double value = extractNumber(metadata, List.of(
            "pickup_distance_km",
            "courier_to_pickup_distance_km",
            "agent_distance_km"
        ));
        return value == null ? null : Math.max(0.0, value);
    }

    private static Double extractNumber(JsonNode metadata, List<String> fields) {
        if (metadata == null || metadata.isNull() || metadata.isMissingNode()) {
            return null;
        }
        for (String field : fields) {
            JsonNode value = metadata.path(field);
            if (value.isNumber()) {
                return value.doubleValue();
            }
            if (value.isTextual()) {
                try {
                    return Double.parseDouble(value.asText());
                } catch (NumberFormatException ignored) {
                    // Continue to the next normalized field.
                }
            }
        }
        JsonNode order = metadata.path("order");
        if (order.isObject()) {
            return extractNumber(order, fields);
        }
        return null;
    }

    private static String extractText(JsonNode metadata, List<String> fields) {
        if (metadata == null || metadata.isNull() || metadata.isMissingNode()) {
            return null;
        }
        for (String field : fields) {
            JsonNode value = metadata.path(field);
            if (value.isValueNode() && !value.isNull() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        JsonNode order = metadata.path("order");
        if (order.isObject()) {
            return extractText(order, fields);
        }
        return null;
    }

    private static BigDecimal quotedCost(ProviderQuote quote) {
        if (quote.deliveryFeeAmount() != null) {
            return quote.deliveryFeeAmount();
        }
        return quote.paymentAmount();
    }

    private static String clientReference(UUID chefSubOrderId) {
        String compact = chefSubOrderId.toString().replace("-", "");
        return "CRV-" + compact.substring(0, 28);
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("providerId is required");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
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
        Double pickupDistanceKm,
        Integer pickupEtaMinutes,
        String error
    ) {}

    private record RankedQuoteOutcome(CandidateScore candidate, QuoteOutcome outcome) {}

    public static class DeliveryRoutingException extends RuntimeException {
        public DeliveryRoutingException(String message) {
            super(message);
        }

        public DeliveryRoutingException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static class DeliveryCreateReconciliationPendingException extends RuntimeException {
        private final String providerId;
        private final String clientReference;
        private final Instant attemptedAt;

        public DeliveryCreateReconciliationPendingException(String providerId,
                                                            String clientReference,
                                                            Instant attemptedAt,
                                                            String message,
                                                            Throwable cause) {
            super(message, cause);
            this.providerId = providerId;
            this.clientReference = clientReference;
            this.attemptedAt = attemptedAt;
        }

        public String providerId() {
            return providerId;
        }

        public String clientReference() {
            return clientReference;
        }

        public Instant attemptedAt() {
            return attemptedAt;
        }
    }
}
