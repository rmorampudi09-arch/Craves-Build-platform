package in.craves.integration.delivery.command;

import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentCandidateInput;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateInput;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentRequest;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateScore;
import in.craves.integration.delivery.DeliveryIntelligenceModels.ProviderQuoteSnapshot;
import in.craves.integration.delivery.DeliveryIntelligenceService;
import in.craves.integration.delivery.command.DeliveryCommandModels.CreateAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.QuoteAudit;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateRejectedException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class DeliveryProviderRouter {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DeliveryProviderRouter.class);
    /** A new order may take a moment to show in a courier's list, so a refusal is looked up no sooner than this. */
    static final Duration REFUSAL_LOOKUP_AFTER = Duration.ofSeconds(20);
    private static final String BREAKER_OPEN = "Courier breaker is open";
    private final Map<String, DeliveryProviderAdapter> adapters;
    private final DeliveryProviderCatalogRepository providerCatalog;
    private final DeliveryIntelligenceService intelligenceService;
    private final DeliveryAssignmentRepository assignmentRepository;
    private final DeliveryCommandProperties properties;
    private final ExecutorService quoteExecutor;
    private final Clock clock;
    private final BorzoProperties borzoProperties;
    private final FleetStage fleetStage;
    private ProviderGuard providerGuard;
    private ProviderCreateAttemptRepository journal;
    private CourierBreaker courierBreaker;

    @Autowired
    public DeliveryProviderRouter(List<DeliveryProviderAdapter> adapters,
                                  DeliveryProviderCatalogRepository providerCatalog,
                                  DeliveryIntelligenceService intelligenceService,
                                  DeliveryAssignmentRepository assignmentRepository,
                                  DeliveryCommandProperties properties,
                                  @Qualifier("deliveryQuoteExecutor") ExecutorService quoteExecutor,
                                  Clock clock,
                                  BorzoProperties borzoProperties,
                                  Optional<FleetStage> fleetStage) {
        Map<String, DeliveryProviderAdapter> indexed = new LinkedHashMap<>();
        for (DeliveryProviderAdapter adapter : adapters) {
            String providerId = normalize(adapter.providerId());
            if (indexed.put(providerId, adapter) != null) {
                throw new IllegalStateException("Duplicate delivery provider adapter: " + providerId);
            }
        }
        this.adapters = Map.copyOf(indexed);
        this.providerCatalog = providerCatalog;
        this.intelligenceService = intelligenceService;
        this.assignmentRepository = assignmentRepository;
        this.properties = properties;
        this.quoteExecutor = quoteExecutor;
        this.clock = clock;
        this.borzoProperties = borzoProperties;
        this.fleetStage = fleetStage.orElse(null);
    }

    public DeliveryProviderRouter(List<DeliveryProviderAdapter> adapters,
                                  DeliveryProviderCatalogRepository providerCatalog,
                                  DeliveryIntelligenceService intelligenceService,
                                  DeliveryAssignmentRepository assignmentRepository,
                                  DeliveryCommandProperties properties,
                                  ExecutorService quoteExecutor,
                                  Clock clock,
                                  BorzoProperties borzoProperties) {
        this(adapters, providerCatalog, intelligenceService, assignmentRepository,
            properties, quoteExecutor, clock, borzoProperties, Optional.empty());
    }

    DeliveryProviderRouter(List<DeliveryProviderAdapter> adapters,
                           DeliveryProviderCatalogRepository providerCatalog,
                           DeliveryIntelligenceService intelligenceService,
                           DeliveryAssignmentRepository assignmentRepository,
                           DeliveryCommandProperties properties,
                           ExecutorService quoteExecutor,
                           Clock clock) {
        this(adapters, providerCatalog, intelligenceService, assignmentRepository,
            properties, quoteExecutor, clock, null);
    }

    /** Handbook 104: present only when CRAVES_PROVIDER_RESILIENCE_ENABLED=true; quotes go straight to the provider otherwise. */
    @Autowired(required = false)
    void setProviderGuard(ProviderGuard providerGuard) {
        this.providerGuard = providerGuard;
    }

    /** The booking journal (V191); every branch on it is behind journal.enabled(), CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED. */
    @Autowired(required = false)
    public void setJournal(ProviderCreateAttemptRepository journal) {
        this.journal = journal;
    }

    private boolean journalOn() {
        return journal != null && journal.enabled();
    }

    /** Present only when CRAVES_COURIER_BREAKER_ENABLED=true. */
    @Autowired(required = false)
    public void setCourierBreaker(CourierBreaker courierBreaker) {
        this.courierBreaker = courierBreaker;
    }

    /**
     * The shared breaker's leave to call a courier in this pass, read once per courier; null when the breaker is off.
     * It needs the journal: without it a courier's refusal of one order cannot be told from a failing courier.
     */
    private CourierBreaker.Pass admit(String providerId, Map<String, CourierBreaker.Pass> passes) {
        return courierBreaker == null || !journalOn() ? null : passes.computeIfAbsent(providerId, courierBreaker::admit);
    }

    private static boolean refused(CourierBreaker.Pass pass) {
        return pass != null && pass.refused();
    }

    public boolean borzoTimedPolicyReady() {
        return properties.isBorzoPidgeHandoffEnabled()
            && providerCatalog.activeProviderIds().stream()
                .map(DeliveryProviderRouter::normalize).anyMatch("borzo"::equals)
            && adapters.containsKey("borzo")
            && (borzoProperties == null || borzoProperties.productionCreateReady());
    }

    /**
     * The Craves rider stage, before Borzo and Pidge. Empty when the fleet is off or its stage is closed (then route as
     * before); a delivery job id when a rider accepted. Throws DeliveryProviderTemporarilyUnavailableException while
     * riders are deciding, so the command waits without starting Borzo's window.
     */
    public Optional<java.util.UUID> fleetStage(DeliveryCommandMessage command) {
        if (fleetStage == null) {
            return Optional.empty();
        }
        return fleetStage.run(command, () -> courierQuotePaise(command), borzoTimedPolicyReady());
    }

    public RoutingResult route(DeliveryCommandMessage command) {
        return route(command, null);
    }

    /** The cheapest available quote among the couriers routing would try next, in paise, for the fleet's cost guard. */
    private OptionalLong courierQuotePaise(DeliveryCommandMessage command) {
        String only = !properties.isBorzoPidgeHandoffEnabled() ? null : borzoTimedPolicyReady() ? "borzo" : "pidge";
        List<Callable<QuoteOutcome>> tasks = new ArrayList<>();
        for (String configuredProviderId : providerCatalog.activeProviderIds()) {
            DeliveryProviderAdapter adapter = adapters.get(normalize(configuredProviderId));
            if (adapter != null && (only == null || only.equals(normalize(configuredProviderId)))) {
                // The cost guard's quote books nothing, so it never takes the breaker's probe.
                CourierBreaker.Pass pass = courierBreaker == null || !journalOn() ? null : courierBreaker.read(normalize(configuredProviderId));
                if (!refused(pass)) {
                    tasks.add(() -> quote(adapter, command, pass));
                }
            }
        }
        return invokeQuotes(tasks, new ArrayList<>()).stream().map(QuoteOutcome::quote)
            .filter(quote -> quote != null && quote.available() && quote.deliveryFeeAmount() != null)
            .mapToLong(quote -> quote.deliveryFeeAmount().movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValue())
            .min();
    }

    public RoutingResult route(DeliveryCommandMessage command, Instant borzoWindowStartedAt) {
        Objects.requireNonNull(command, "delivery command is required");
        List<String> activeProviderIds = providerCatalog.activeProviderIds();
        if (activeProviderIds.isEmpty()) {
            throw new DeliveryProviderTemporarilyUnavailableException(
                "No active delivery providers are configured"
            );
        }
        boolean timedPolicy = properties.isBorzoPidgeHandoffEnabled();
        boolean borzoReady = timedPolicy
            && activeProviderIds.stream().map(DeliveryProviderRouter::normalize)
                .anyMatch("borzo"::equals)
            && adapters.containsKey("borzo")
            && (borzoProperties == null || borzoProperties.productionCreateReady());
        if (borzoReady && borzoWindowStartedAt == null) {
            throw new DeliveryProviderTemporarilyUnavailableException(
                "Borzo selection window has not been durably initialized");
        }
        // Look before booking: an unresolved earlier attempt goes to the reconciliation worker before anyone is quoted.
        Map<String, List<Attempt>> attempts = journalOn() ? attemptsByCourier(command.chefSubOrderId()) : Map.of();
        Map<String, CourierBreaker.Pass> passes = new HashMap<>();
        // A refusal in this window sends the order to Pidge at once. A window ops opens later lets Borzo be tried again.
        boolean borzoWindow = borzoReady && borzoWindowStartedAt != null
            && clock.instant().isBefore(borzoWindowStartedAt.plusSeconds(120))
            && !(journalOn() && attempts.containsKey("borzo") && (!bookable(attempts, "borzo")
                || attempts.get("borzo").stream().anyMatch(row -> !row.createdAt().isBefore(borzoWindowStartedAt))));
        // An open breaker closes Borzo's window for this order: Pidge is next.
        boolean borzoWindowOpen = borzoWindow && !refused(admit("borzo", passes));
        Set<String> bookableOnly = null;
        if (journalOn()) {
            List<String> deployed = timedPolicy ? List.of(borzoWindowOpen ? "borzo" : "pidge")
                : activeProviderIds.stream().map(DeliveryProviderRouter::normalize).filter(adapters::containsKey).toList();
            bookableOnly = deployed.stream().filter(providerId -> bookable(attempts, providerId)).collect(Collectors.toSet());
            if (bookableOnly.isEmpty() && !deployed.isEmpty()) {
                throw new DeliveryRoutingException("No courier may be booked again for this order");
            }
        }

        List<QuoteAudit> quoteAudit = new ArrayList<>();
        List<Callable<QuoteOutcome>> tasks = new ArrayList<>();
        if (borzoWindow && !borzoWindowOpen) {
            quoteAudit.add(new QuoteAudit("borzo", false, false, null, null, null, BREAKER_OPEN));
        }

        for (String configuredProviderId : activeProviderIds) {
            String providerId = normalize(configuredProviderId);
            if (timedPolicy && !(borzoWindowOpen ? "borzo" : "pidge").equals(providerId)) {
                continue;
            }
            if (bookableOnly != null && adapters.containsKey(providerId) && !bookableOnly.contains(providerId)) {
                continue;
            }
            DeliveryProviderAdapter adapter = adapters.get(providerId);
            if (adapter == null) {
                quoteAudit.add(new QuoteAudit(
                    providerId, false, false, null, null, null,
                    "Provider is active in the database but no adapter is deployed"
                ));
                continue;
            }
            CourierBreaker.Pass pass = admit(providerId, passes);
            if (refused(pass)) {
                quoteAudit.add(new QuoteAudit(providerId, false, false, null, null, null, BREAKER_OPEN));
                continue;
            }
            tasks.add(() -> quote(adapter, command, pass));
        }

        List<QuoteOutcome> outcomes = invokeQuotes(tasks, quoteAudit);
        if (timedPolicy) {
            String required = borzoWindowOpen ? "borzo" : "pidge";
            if (outcomes.stream().noneMatch(outcome -> required.equals(outcome.providerId())
                && outcome.quote() != null && outcome.quote().available())) {
                throw new DeliveryProviderTemporarilyUnavailableException(
                    required + " has no available quote in its selection window",
                    borzoWindowOpen ? borzoWindowStartedAt.plusSeconds(120) : null
                );
            }
        }
        boolean anyAvailableQuote = outcomes.stream()
            .anyMatch(outcome -> outcome.quote() != null && outcome.quote().available());
        if (!anyAvailableQuote) {
            boolean anyProviderResponse = outcomes.stream().anyMatch(outcome -> outcome.quote() != null);
            if (!anyProviderResponse) {
                throw new DeliveryProviderTemporarilyUnavailableException(
                    "Active delivery providers did not return a quote"
                );
            }
            throw new DeliveryRoutingException(
                "No active delivery provider returned an available quote"
            );
        }

        AssignmentResponse assignment = intelligenceService.assign(
            assignmentRequest(command, outcomes, timedPolicy)
        );
        if (timedPolicy && !borzoWindowOpen) {
            ProviderQuote pidgeQuote = outcomes.stream()
                .filter(outcome -> "pidge".equals(outcome.providerId()))
                .map(QuoteOutcome::quote).filter(Objects::nonNull)
                .filter(ProviderQuote::available).findFirst().orElseThrow();
            boolean hasPidge = assignment.rankedCandidates().stream()
                .anyMatch(candidate -> "pidge".equals(normalize(candidate.providerId())));
            assignmentRepository.ensureTimedPidgeCandidate(assignment.assignmentId(), pidgeQuote);
            if (!hasPidge) {
                assignment = assignmentRepository.find(assignment.assignmentId())
                    .orElseThrow(() -> new DeliveryRoutingException(
                        "The timed Pidge candidate could not be loaded"));
            }
        }
        List<RankedQuoteOutcome> candidates = orderByIntelligence(assignment, outcomes);
        if (timedPolicy) {
            String required = borzoWindowOpen ? "borzo" : "pidge";
            candidates = candidates.stream()
                .filter(candidate -> required.equals(candidate.outcome().providerId()))
                .toList();
        }
        if (candidates.isEmpty()) {
            throw new DeliveryRoutingException(
                "The persisted intelligent assignment has no currently available provider quote"
            );
        }

        if (journalOn()) {
            // A courier that already refused this order is tried again only after those not yet tried.
            candidates = candidates.stream()
                .sorted(Comparator.comparing(candidate -> attempts.containsKey(candidate.outcome().providerId()))).toList();
        }

        List<CreateAudit> createAudit = new ArrayList<>();
        int maximumAttempts = Math.min(properties.getMaxProviderAttempts(), candidates.size());

        for (int index = 0; index < maximumAttempts; index++) {
            RankedQuoteOutcome ranked = candidates.get(index);
            QuoteOutcome candidate = ranked.outcome();
            if (borzoWindowOpen
                && !clock.instant().isBefore(borzoWindowStartedAt.plusSeconds(120))) {
                throw new DeliveryProviderTemporarilyUnavailableException(
                    "Borzo selection window expired before booking",
                    borzoWindowStartedAt.plusSeconds(120));
            }
            // Journalled and committed before the call, outside the try: a database error is never read as a refusal.
            Attempt attempt = journalOn() ? beginAttempt(command.chefSubOrderId(), candidate.providerId()) : null;
            String clientReference = attempt == null ? clientReference(command.chefSubOrderId()) : attempt.clientRef();
            CourierBreaker.Pass pass = passes.get(candidate.providerId());
            try {
                ProviderDelivery delivery = candidate.adapter().create(
                    new CreateDeliveryRequest(
                        clientReference,
                        command.deliveryRequest(),
                        candidate.quote()
                    )
                );
                if (delivery == null || delivery.providerDeliveryId() == null
                    || delivery.providerDeliveryId().isBlank()) {
                    IllegalStateException noId = new IllegalStateException("Provider returned no delivery identifier");
                    if (attempt != null) {
                        // An answer without an id may still be a booking.
                        throw new ProviderCreateUncertainException(candidate.providerId(), clientReference, attempt.createdAt(), noId);
                    }
                    throw noId;
                }
                createAudit.add(new CreateAudit(candidate.providerId(), true, null));
                if (pass != null) {
                    courierBreaker.booked(pass, Boolean.TRUE);
                }
                return new RoutingResult(
                    candidate.providerId(),
                    delivery,
                    assignment,
                    ranked.candidate().candidateId(),
                    List.copyOf(quoteAudit),
                    List.copyOf(createAudit),
                    clientReference
                );
            } catch (ProviderCreateUncertainException ex) {
                createAudit.add(new CreateAudit(
                    candidate.providerId(), false, "Provider create outcome requires reconciliation"
                ));
                if (pass != null) {
                    courierBreaker.booked(pass, CourierBreaker.bookingHealth(ex));
                }
                if (attempt != null) {
                    record(attempt, ProviderCreateAttemptRepository.UNKNOWN, safeMessage(ex.getCause() == null ? ex : ex.getCause()), null);
                    throw pending(attempt, "Provider create response was not received; fallback is blocked", ex);
                }
                throw new DeliveryCreateReconciliationPendingException(
                    ex.providerId(),
                    ex.clientReference(),
                    ex.attemptedAt(),
                    "Provider create response was not received; fallback is blocked",
                    ex
                );
            } catch (RuntimeException ex) {
                createAudit.add(new CreateAudit(candidate.providerId(), false, safeMessage(ex)));
                if (pass != null) {
                    courierBreaker.booked(pass, CourierBreaker.bookingHealth(ex));
                }
                if (attempt != null) {
                    // Every adapter raises ProviderCreateUncertainException when a booking may exist; anything else booked nothing.
                    boolean recorded = record(attempt, ProviderCreateAttemptRepository.REJECTED, safeMessage(ex),
                        ex instanceof ProviderCreateRejectedException refusal && refusal.verifyLater()
                            ? clock.instant().plus(REFUSAL_LOOKUP_AFTER) : null);
                    if (recorded && timedPolicy && "borzo".equals(candidate.providerId())) {
                        // The worker waits a second and runs again; the journal row then closes Borzo's window.
                        throw new DeliveryProviderTemporarilyUnavailableException("Borzo refused the booking; Pidge is next", clock.instant());
                    }
                }
            }
        }

        throw new DeliveryRoutingException(
            "Delivery creation failed across " + maximumAttempts + " intelligently ranked provider attempt(s)"
        );
    }

    private Map<String, List<Attempt>> attemptsByCourier(UUID chefSubOrderId) {
        List<Attempt> rows = journal.forOrder(chefSubOrderId);
        for (Attempt row : rows) {
            if (unresolved(row)) {
                throw pending(row, "An earlier booking attempt is unresolved; it is looked up before any other booking", null);
            }
        }
        return rows.stream().collect(Collectors.groupingBy(Attempt::providerId));
    }

    private Attempt beginAttempt(UUID chefSubOrderId, String providerId) {
        Optional<Attempt> begun = journal.begin(chefSubOrderId, providerId);
        if (begun.isPresent()) {
            return begun.get();
        }
        // An index or the cap refused it: another pass got there first.
        for (Attempt row : journal.forOrder(chefSubOrderId)) {
            if (unresolved(row)) {
                throw pending(row, "Another booking attempt for this order is unresolved", null);
            }
        }
        throw new DeliveryProviderTemporarilyUnavailableException("Booking journal is busy for this order");
    }

    /**
     * The courier has answered; the answer goes on the attempt. If that write fails the attempt stays INTENT, which blocks
     * every other booking for the order until the reconciliation worker has looked: safe, so the answer's own handling goes on.
     */
    private boolean record(Attempt attempt, String state, String error, Instant nextCheckAt) {
        try {
            if (journal.move(attempt, Set.of(ProviderCreateAttemptRepository.INTENT), state, error, nextCheckAt)) {
                if (ProviderCreateAttemptRepository.REJECTED.equals(state)) {
                    log.warn("Courier refused the booking chefSubOrderId={} provider={} clientRef={}: {}", attempt.chefSubOrderId(),
                        attempt.providerId(), attempt.clientRef(), error);
                }
                return true;
            }
            log.error("Courier booking journal: attempt was no longer INTENT when its answer ({}) arrived chefSubOrderId={} provider={} "
                + "clientRef={}", state, attempt.chefSubOrderId(), attempt.providerId(), attempt.clientRef());
        } catch (RuntimeException journalFailure) {
            log.error("Courier booking journal: answer {} could not be recorded chefSubOrderId={} provider={} clientRef={} answer={}", state,
                attempt.chefSubOrderId(), attempt.providerId(), attempt.clientRef(), error, journalFailure);
        }
        return false;
    }

    private static boolean unresolved(Attempt row) {
        return ProviderCreateAttemptRepository.INTENT.equals(row.state()) || ProviderCreateAttemptRepository.UNKNOWN.equals(row.state());
    }

    private static boolean bookable(Map<String, List<Attempt>> attempts, String providerId) {
        return ProviderCreateAttemptRepository.bookable(attempts.getOrDefault(providerId, List.of()));
    }

    private static DeliveryCreateReconciliationPendingException pending(Attempt row, String message, Throwable cause) {
        return new DeliveryCreateReconciliationPendingException(row.providerId(), row.clientRef(), row.createdAt(), message, cause);
    }

    /**
     * With the journal on: whether some courier other than this one may still be booked for the order. When none may,
     * an unanswered booking is the order's only chance and is not given up as an orphan.
     */
    public boolean anotherCourierBookable(UUID chefSubOrderId, String exceptProviderId) {
        Map<String, List<Attempt>> attempts = journal.forOrder(chefSubOrderId).stream().collect(Collectors.groupingBy(Attempt::providerId));
        String except = normalize(exceptProviderId);
        return providerCatalog.activeProviderIds().stream().map(DeliveryProviderRouter::normalize)
            .filter(providerId -> !providerId.equals(except) && adapters.containsKey(providerId))
            // The timed policy has one next courier: Pidge, after Borzo.
            .filter(providerId -> !properties.isBorzoPidgeHandoffEnabled() || ("borzo".equals(except) && "pidge".equals(providerId)))
            .anyMatch(providerId -> bookable(attempts, providerId));
    }

    /** A read-only look for one journalled attempt at its courier; inconclusive when the courier cannot be asked. */
    public CreateReconciliationResult lookup(String providerId, String clientReference, Instant attemptedAt) {
        DeliveryProviderAdapter adapter = adapters.get(normalize(providerId));
        if (adapter == null) {
            return CreateReconciliationResult.inconclusive("The provider adapter is not deployed");
        }
        try {
            CreateReconciliationResult result = adapter.reconcileCreate(clientReference, attemptedAt);
            return result == null ? CreateReconciliationResult.inconclusive("Provider lookup returned no result") : result;
        } catch (RuntimeException ex) {
            return CreateReconciliationResult.inconclusive(safeMessage(ex));
        }
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
                "The reconciliation provider adapter is not deployed"
            );
        }

        CreateReconciliationResult reconciliation;
        try {
            reconciliation = adapter.reconcileCreate(clientReference, attemptedAt);
        } catch (RuntimeException ex) {
            throw new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                "Provider create reconciliation call failed",
                ex
            );
        }
        if (reconciliation == null) {
            throw new DeliveryCreateReconciliationPendingException(
                providerId,
                clientReference,
                attemptedAt,
                "Provider create reconciliation returned no result"
            );
        }

        if (reconciliation.status() == CreateReconciliationStatus.FOUND) {
            ProviderDelivery delivery = Objects.requireNonNull(
                reconciliation.delivery(), "reconciled provider delivery is required"
            );
            return recovered(command.chefSubOrderId(), providerId, clientReference, delivery);
        }

        if (reconciliation.status() == CreateReconciliationStatus.NOT_FOUND) {
            throw new DeliveryCreateDefinitivelyNotFoundException(
                providerId,
                clientReference,
                attemptedAt,
                safeDetail(reconciliation.detail(), "Provider confirmed no matching delivery")
            );
        }

        throw new DeliveryCreateReconciliationPendingException(
            providerId,
            clientReference,
            attemptedAt,
            safeDetail(reconciliation.detail(), "Provider create reconciliation is inconclusive")
        );
    }

    /** The routing result for a journalled attempt's booking, fetched from its courier, that is to become the order's job. */
    public RoutingResult recovered(Attempt attempt, ProviderDelivery delivery) {
        return recovered(attempt.chefSubOrderId(), normalize(attempt.providerId()), attempt.clientRef(), delivery);
    }

    private RoutingResult recovered(UUID chefSubOrderId, String providerId, String clientReference, ProviderDelivery delivery) {
        AssignmentResponse assignment = existingAssignment(chefSubOrderId);
        CandidateScore selected = selectedCandidate(assignment, providerId);
        return new RoutingResult(
            providerId,
            delivery,
            assignment,
            selected.candidateId(),
            List.of(),
            List.of(new CreateAudit(providerId, true, "Recovered by provider reconciliation")),
            clientReference
        );
    }

    private AssignmentResponse existingAssignment(java.util.UUID chefSubOrderId) {
        return assignmentRepository.findResponseByChefSubOrderId(chefSubOrderId)
            .orElseThrow(() -> new DeliveryRoutingException(
                "The delivery assignment is missing during provider create reconciliation"
            ));
    }

    private static CandidateScore selectedCandidate(AssignmentResponse assignment, String providerId) {
        if (assignment.selectedCandidateId() != null) {
            for (CandidateScore candidate : assignment.rankedCandidates()) {
                if (assignment.selectedCandidateId().equals(candidate.candidateId())) {
                    return candidate;
                }
            }
        }
        return assignment.rankedCandidates().stream()
            .filter(candidate -> providerId.equals(normalize(candidate.providerId())))
            .findFirst()
            .orElseThrow(() -> new DeliveryRoutingException(
                "The persisted assignment has no candidate for reconciliation provider " + providerId
            ));
    }

    /** pass: the shared breaker's leave for this courier, null when the breaker is off. */
    private QuoteOutcome quote(DeliveryProviderAdapter adapter, DeliveryCommandMessage command, CourierBreaker.Pass pass) {
        String providerId = normalize(adapter.providerId());
        long started = System.nanoTime();
        Boolean healthy = null;
        try {
            ProviderQuote quote = providerGuard == null
                ? adapter.quote(command.deliveryRequest())
                : providerGuard.quote(providerId, () -> adapter.quote(command.deliveryRequest()), properties.quoteTimeout());
            healthy = Boolean.TRUE;
            if (quote == null) {
                return new QuoteOutcome(providerId, adapter, null, "Provider returned no quote");
            }
            return new QuoteOutcome(providerId, adapter, quote, null);
        } catch (RuntimeException ex) {
            // The per-replica guard's own refusal is not an answer from the courier.
            healthy = ex instanceof ProviderGuard.ProviderRefusedException ? null : ProviderGuard.health(ex);
            return new QuoteOutcome(providerId, adapter, null, safeMessage(ex));
        } finally {
            if (pass != null) {
                // A quote slower than the fan-out deadline cannot be used, so it counts against the courier whatever it says.
                courierBreaker.quoted(pass, System.nanoTime() - started > properties.quoteTimeout().toNanos() ? Boolean.FALSE : healthy);
            }
        }
    }

    private List<QuoteOutcome> invokeQuotes(List<Callable<QuoteOutcome>> tasks,
                                            List<QuoteAudit> quoteAudit) {
        if (tasks.isEmpty()) {
            return List.of();
        }
        List<Future<QuoteOutcome>> futures = new ArrayList<>(tasks.size());
        for (Callable<QuoteOutcome> task : tasks) {
            futures.add(quoteExecutor.submit(task));
        }

        List<QuoteOutcome> outcomes = new ArrayList<>(tasks.size());
        Duration timeout = properties.quoteTimeout();
        long deadlineNanos = System.nanoTime() + timeout.toNanos();
        for (Future<QuoteOutcome> future : futures) {
            long remainingNanos = deadlineNanos - System.nanoTime();
            if (remainingNanos <= 0) {
                future.cancel(true);
                quoteAudit.add(new QuoteAudit(
                    "unknown", false, false, null, null, null,
                    "Quote fan-out timed out"
                ));
                continue;
            }
            try {
                QuoteOutcome outcome = future.get(remainingNanos, TimeUnit.NANOSECONDS);
                outcomes.add(outcome);
                ProviderQuote quote = outcome.quote();
                Double pickupEta = quote == null ? null : pickupEtaMinutes(quote);
                quoteAudit.add(new QuoteAudit(
                    outcome.providerId(),
                    quote != null,
                    quote != null && quote.available(),
                    quote == null ? null : pickupDistanceKm(quote),
                    pickupEta == null ? null : (int) Math.round(pickupEta),
                    quote,
                    outcome.error()
                ));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new DeliveryRoutingException("Delivery quote fan-out was interrupted", ex);
            } catch (ExecutionException | TimeoutException ex) {
                future.cancel(true);
                quoteAudit.add(new QuoteAudit(
                    "unknown", false, false, null, null, null,
                    safeMessage(ex)
                ));
            }
        }
        return List.copyOf(outcomes);
    }

    private AssignmentRequest assignmentRequest(DeliveryCommandMessage command,
                                                List<QuoteOutcome> outcomes,
                                                boolean includePidgePlaceholder) {
        List<CandidateInput> candidates = new ArrayList<>();
        boolean pidgeIncluded = false;
        for (QuoteOutcome outcome : outcomes) {
            ProviderQuote quote = outcome.quote();
            if (quote == null || !quote.available()) {
                continue;
            }
            pidgeIncluded |= "pidge".equals(outcome.providerId());
            candidates.add(new CandidateInput(
                outcome.providerId(),
                providerQuoteId(quote),
                agentId(quote),
                pickupDistanceKm(quote),
                pickupEtaMinutes(quote),
                quote.deliveryFeeAmount(),
                quote.currency(),
                true,
                quote.providerMetadata()
            ));
        }
        if (includePidgePlaceholder && !pidgeIncluded) {
            candidates.add(new CandidateInput("pidge", null, null, null, null,
                null, "INR", false, null));
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

    private List<RankedQuoteOutcome> orderByIntelligence(AssignmentResponse assignment,
                                                         List<QuoteOutcome> outcomes) {
        Map<String, QuoteOutcome> byProvider = new HashMap<>();
        for (QuoteOutcome outcome : outcomes) {
            if (outcome.quote() != null && outcome.quote().available()) {
                byProvider.put(outcome.providerId(), outcome);
            }
        }

        List<RankedQuoteOutcome> result = new ArrayList<>();
        for (CandidateScore candidate : assignment.rankedCandidates()) {
            if (candidate.status() != in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus.SELECTED
                && candidate.status() != in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus.RANKED
                && candidate.status() != in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus.ACCEPTED
                && !(properties.isBorzoPidgeHandoffEnabled()
                    && "pidge".equals(normalize(candidate.providerId()))
                    && candidate.status() == in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus.SKIPPED))
                continue;
            QuoteOutcome outcome = byProvider.get(normalize(candidate.providerId()));
            if (outcome != null) {
                result.add(new RankedQuoteOutcome(candidate, outcome));
            }
        }
        result.sort(Comparator.<RankedQuoteOutcome>comparingInt(ranked ->
            Objects.equals(ranked.candidate().candidateId(), assignment.selectedCandidateId()) ? 0 : 1)
            .thenComparingInt(ranked -> ranked.candidate().candidateRank()));
        return List.copyOf(result);
    }

    private static String clientReference(java.util.UUID chefSubOrderId) {
        return chefSubOrderId.toString();
    }

    private static String providerQuoteId(ProviderQuote quote) {
        return textMetadata(quote, "quote_id");
    }

    private static String agentId(ProviderQuote quote) {
        return textMetadata(quote, "agent_id");
    }

    private static Double pickupDistanceKm(ProviderQuote quote) {
        return doubleMetadata(quote, "pickup_distance_km");
    }

    private static Double pickupEtaMinutes(ProviderQuote quote) {
        return doubleMetadata(quote, "pickup_eta_minutes");
    }

    private static Double providerSuccessProbability(ProviderQuote quote) {
        Double value = doubleMetadata(quote, "predicted_success_probability");
        if (value == null) {
            return 1.0d;
        }
        return Math.max(0.0d, Math.min(1.0d, value));
    }

    private static String textMetadata(ProviderQuote quote, String field) {
        if (quote.providerMetadata() == null || quote.providerMetadata().get(field) == null
            || quote.providerMetadata().get(field).isNull()) {
            return null;
        }
        String value = quote.providerMetadata().get(field).asText();
        return value == null || value.isBlank() ? null : value;
    }

    private static Double doubleMetadata(ProviderQuote quote, String field) {
        if (quote.providerMetadata() == null || quote.providerMetadata().get(field) == null
            || quote.providerMetadata().get(field).isNull()) {
            return null;
        }
        if (quote.providerMetadata().get(field).isNumber()) {
            return quote.providerMetadata().get(field).asDouble();
        }
        try {
            return Double.valueOf(quote.providerMetadata().get(field).asText());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private static String safeDetail(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.length() <= 500 ? value : value.substring(0, 500);
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new DeliveryRoutingException(label + " is required");
        }
        return value.trim();
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private record QuoteOutcome(
        String providerId,
        DeliveryProviderAdapter adapter,
        ProviderQuote quote,
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

    public static class DeliveryProviderTemporarilyUnavailableException extends DeliveryRoutingException {
        private final Instant policyDeadline;

        public DeliveryProviderTemporarilyUnavailableException(String message) {
            this(message, null);
        }

        public DeliveryProviderTemporarilyUnavailableException(String message,
                                                               Instant policyDeadline) {
            super(message);
            this.policyDeadline = policyDeadline;
        }

        public Instant policyDeadline() {
            return policyDeadline;
        }
    }

    public static class DeliveryCreateReconciliationPendingException extends RuntimeException {
        private final String providerId;
        private final String clientReference;
        private final Instant attemptedAt;

        public DeliveryCreateReconciliationPendingException(String providerId,
                                                             String clientReference,
                                                             Instant attemptedAt,
                                                             String message) {
            super(message);
            this.providerId = providerId;
            this.clientReference = clientReference;
            this.attemptedAt = attemptedAt;
        }

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

    public static class DeliveryCreateDefinitivelyNotFoundException extends RuntimeException {
        private final String providerId;
        private final String clientReference;
        private final Instant attemptedAt;

        public DeliveryCreateDefinitivelyNotFoundException(String providerId,
                                                            String clientReference,
                                                            Instant attemptedAt,
                                                            String message) {
            super(message);
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
