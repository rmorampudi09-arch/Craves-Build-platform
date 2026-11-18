package in.craves.integration.delivery.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.BorzoPidgeHandoffWorker;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.provider.DeliveryWebhookNormalizer;
import in.craves.integration.delivery.status.DeliveryStatusRepository.DeliveryJobState;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DeliveryStatusUpdateService {
    private static final Logger log = LoggerFactory.getLogger(DeliveryStatusUpdateService.class);
    private final Map<String, DeliveryWebhookNormalizer> normalizers;
    private final DeliveryStatusRepository repository;
    private final DeliveryOutboxRepository outbox;
    private final DeliveryCommandProperties properties;
    private final ObjectMapper objectMapper;
    private final BorzoPidgeHandoffRepository handoffs;

    @Autowired
    public DeliveryStatusUpdateService(List<DeliveryWebhookNormalizer> normalizers,
                                       DeliveryStatusRepository repository,
                                       DeliveryOutboxRepository outbox,
                                       DeliveryCommandProperties properties,
                                       ObjectMapper objectMapper,
                                       BorzoPidgeHandoffRepository handoffs) {
        this.normalizers = indexNormalizers(normalizers);
        this.repository = repository;
        this.outbox = outbox;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.handoffs = handoffs;
    }

    DeliveryStatusUpdateService(List<DeliveryWebhookNormalizer> normalizers,
                                DeliveryStatusRepository repository,
                                DeliveryOutboxRepository outbox,
                                DeliveryCommandProperties properties,
                                ObjectMapper objectMapper) {
        this(normalizers, repository, outbox, properties, objectMapper, null);
    }

    /** What a callback says, read from its payload alone. */
    public ProviderStatusUpdate heard(WebhookWorkItem workItem) {
        return normalizer(workItem.providerId()).normalize(workItem.rawPayload());
    }

    /** Whether a delivery job holds this courier booking. */
    public boolean hasJob(ProviderStatusUpdate update) {
        return repository.findJobByProviderOrder(update.providerId(), update.providerOrderId()).isPresent();
    }

    @Transactional
    public ProcessingResult processWebhook(WebhookWorkItem workItem) {
        return processWebhook(workItem, null);
    }

    /**
     * readBack: the booking as the courier's API holds it, or null. When its status differs from the callback's, the
     * read-back status is the one decided on and the result starts with VERIFY_FETCH_DISAGREED.
     */
    @Transactional
    public ProcessingResult processWebhook(WebhookWorkItem workItem, ProviderDelivery readBack) {
        DeliveryWebhookNormalizer normalizer = normalizer(workItem.providerId());
        ProviderStatusUpdate heard = normalizer.normalize(workItem.rawPayload());
        ProviderStatusUpdate update = readBack == null || readBack.status() == heard.status() ? heard
            : new ProviderStatusUpdate(heard.providerId(), heard.providerOrderId(), heard.providerDeliveryId(), readBack.status(),
                readBack.providerStatus(), heard.trackingUrl(), heard.observedAt(), heard.providerMetadata(), heard.courier());
        String disagreed = update == heard ? "" : "VERIFY_FETCH_DISAGREED_";
        requireProviderMatch(workItem.providerId(), update.providerId());

        if ("borzo".equals(update.providerId()) && handoffs != null) {
            var handoff = handoffs.lockByBorzoOrderId(update.providerOrderId()).orElse(null);
            if (handoff != null && ("PROCESSING_BORZO".equals(handoff.state())
                || ("WAITING".equals(handoff.state())
                    && update.status() == DeliveryStatus.DELAYED))) {
                repository.deferWebhookForHandoff(workItem.id());
                return new ProcessingResult(handoff.deliveryJobId(), false, false,
                    "HANDOFF_DECISION_PENDING");
            }
            if (handoff != null && (isSuperseded(handoff)
                || (update.status() == DeliveryStatus.CANCELLED
                    && !"RETAINED_BORZO".equals(handoff.state())
                    && !"MANUAL_REVIEW".equals(handoff.state())))) {
                repository.markWebhookProcessed(workItem.id(), handoff.deliveryJobId(),
                    update.providerOrderId(), update.providerDeliveryId(),
                    update.status().name(), "BORZO_HANDOFF_SUPERSEDED");
                return new ProcessingResult(handoff.deliveryJobId(), false, false,
                    "BORZO_HANDOFF_SUPERSEDED");
            }
        }

        DeliveryJobState discovered = repository.findJobByProviderOrder(
            update.providerId(),
            update.providerOrderId()
        ).orElseThrow(() -> new UnmatchedDeliveryJobException(
            "No delivery job matches provider order " + safe(update.providerOrderId()),
            update.providerId(),
            update.providerOrderId()
        ));

        DeliveryJobState job = repository.lockJob(discovered.id())
            .orElseThrow(() -> new UnmatchedDeliveryJobException(
                "Delivery job disappeared during processing"
            ));

        Decision decision = rankGuard(job, update, decide(job, update), "WEBHOOK");
        String eventType = webhookEventType(workItem.rawPayload());
        boolean inserted = repository.insertEventIfAbsent(
            job.id(),
            update.providerId(),
            workItem.providerEventId(),
            eventType,
            "WEBHOOK",
            update.status().name(),
            update.providerStatus(),
            workItem.rawPayload(),
            update.observedAt(),
            decision.applied(),
            decision.applied() ? null : decision.reason()
        );

        if (!inserted) {
            repository.markWebhookDuplicate(
                workItem.id(),
                "PROVIDER_EVENT_ALREADY_RECORDED"
            );
            return new ProcessingResult(
                job.id(),
                false,
                true,
                "PROVIDER_EVENT_ALREADY_RECORDED"
            );
        }

        if (decision.applied()) {
            applyAndPublish(job, update, "WEBHOOK");
            retainBorzoIfAccepted(job, update);
        }

        callbackHeard(job, decision.applied() ? update.status() : parseStatus(job.status()));
        repository.markWebhookProcessed(
            workItem.id(),
            job.id(),
            update.providerOrderId(),
            update.providerDeliveryId(),
            update.status().name(),
            disagreed + decision.reason()
        );
        return new ProcessingResult(
            job.id(),
            decision.applied(),
            false,
            disagreed + decision.reason()
        );
    }

    @Transactional
    public ProcessingResult processTracking(TrackingWorkItem workItem,
                                            TrackingSnapshot snapshot) {
        ProviderStatusUpdate update = ProviderStatusUpdate.fromTracking(snapshot);
        requireProviderMatch(workItem.providerId(), update.providerId());
        if (!workItem.providerDeliveryId().equals(update.providerOrderId())) {
            throw new IllegalStateException(
                "Tracking response provider order does not match the claimed job"
            );
        }

        // Webhooks lock the handoff before the job. Tracking must use the same order so
        // a courier callback cannot deadlock the timed cancellation decision.
        BorzoPidgeHandoffRepository.Handoff borzoHandoff =
            "borzo".equals(update.providerId()) && handoffs != null
                ? handoffs.lockByBorzoOrderId(update.providerOrderId()).orElse(null)
                : null;

        DeliveryJobState job = repository.lockJob(workItem.deliveryJobId())
            .orElseThrow(() -> new UnmatchedDeliveryJobException(
                "Tracked delivery job no longer exists"
            ));
        if (!job.providerId().equalsIgnoreCase(update.providerId())
            || !job.providerDeliveryId().equals(update.providerOrderId())) {
            repository.markTrackingNoChange(job.id(), nextTrackingAt(parseStatus(job.status())));
            return new ProcessingResult(job.id(), false, false, "PROVIDER_HANDOFF_SUPERSEDED");
        }
        if (borzoHandoff != null) {
            var handoff = borzoHandoff;
            if (handoff != null && ("PROCESSING_BORZO".equals(handoff.state())
                || ("WAITING".equals(handoff.state())
                    && update.status() == DeliveryStatus.DELAYED))) {
                repository.markTrackingNoChange(job.id(), Instant.now().plusSeconds(5));
                return new ProcessingResult(job.id(), false, false,
                    "HANDOFF_DECISION_PENDING");
            }
            if (handoff != null && (isSuperseded(handoff)
                || (update.status() == DeliveryStatus.CANCELLED
                    && !"RETAINED_BORZO".equals(handoff.state())
                    && !"MANUAL_REVIEW".equals(handoff.state())))) {
                repository.markTrackingNoChange(job.id(), nextTrackingAt(parseStatus(job.status())));
                return new ProcessingResult(job.id(), false, false,
                    "BORZO_HANDOFF_SUPERSEDED");
            }
        }
        Decision decision = rankGuard(job, update, decide(job, update), "TRACK");
        Instant nextTrackingAt = nextTrackingAt(update.status());

        if (!decision.applied()) {
            repository.markTrackingNoChange(job.id(), nextTrackingAt);
            return new ProcessingResult(
                job.id(),
                false,
                false,
                decision.reason()
            );
        }

        String providerEventId = trackingEventId(update);
        JsonNode payload = objectMapper.valueToTree(snapshot);
        boolean inserted = repository.insertEventIfAbsent(
            job.id(),
            update.providerId(),
            providerEventId,
            "TRACK_RECONCILIATION",
            "TRACK",
            update.status().name(),
            update.providerStatus(),
            payload,
            update.observedAt(),
            true,
            null
        );
        if (!inserted) {
            repository.markTrackingNoChange(job.id(), nextTrackingAt);
            return new ProcessingResult(
                job.id(),
                false,
                true,
                "TRACK_EVENT_ALREADY_RECORDED"
            );
        }

        applyAndPublish(job, update, "TRACK");
        retainBorzoIfAccepted(job, update);
        if (properties.isWebhookFirstTrackingEnabled()) {
            // Counted per courier in the logs: a rising number means that courier's callbacks are not arriving.
            log.info("DELIVERY_TRACKING_POLL_SAW_FIRST provider={} jobId={} from={} to={}", update.providerId(), job.id(), job.status(),
                update.status());
        }
        return new ProcessingResult(job.id(), true, false, "APPLIED");
    }

    /**
     * Webhook-first tracking: whether a poll's reading differs from what the job holds (decide()'s NO_STATE_CHANGE test).
     * True when the job cannot be found, so that nothing is skipped on a doubt.
     */
    public boolean pollHasNews(TrackingWorkItem workItem, ProviderDelivery delivery) {
        return repository.findJobByProviderOrder(workItem.providerId(), workItem.providerDeliveryId())
            .map(job -> !sameState(job, delivery.status(), delivery.providerStatus(), delivery.trackingUrl()))
            .orElse(true);
    }

    /**
     * Webhook-first tracking, under the job's row lock: a callback was heard, so the job's poll waits for the stage's
     * quiet period. In a savepoint: when it fails the callback is handled as it would be without it, with one error line.
     */
    private void callbackHeard(DeliveryJobState job, DeliveryStatus stage) {
        if (!properties.isWebhookFirstTrackingEnabled()) {
            return;
        }
        try {
            repository.inSavepoint(() -> repository.deferTrackingAfterCallback(job.id(), Instant.now(), quietSeconds(stage),
                properties.getTrackingSafetyPollSeconds()));
        } catch (RuntimeException failure) {
            log.error("DELIVERY_WEBHOOK_FIRST_TRACKING step=CALLBACK_HEARD failed jobId={} error={}", job.id(), safe(failure.getMessage()));
        }
    }

    /** Webhook-first tracking: seconds with no callback and no poll before a job at this stage is polled. */
    long quietSeconds(DeliveryStatus stage) {
        int rank = rank(stage);
        return rank >= rank(DeliveryStatus.PICKED_UP) ? properties.getTrackingQuietPickedUpSeconds()
            : rank >= rank(DeliveryStatus.COURIER_ASSIGNED) ? properties.getTrackingQuietAssignedSeconds()
            : properties.getTrackingQuietSearchingSeconds();
    }

    private void retainBorzoIfAccepted(DeliveryJobState job, ProviderStatusUpdate update) {
        if (handoffs != null && "borzo".equals(update.providerId())
            && BorzoPidgeHandoffWorker.isAccepted(update.status())) {
            handoffs.markRetained(job.id());
        }
    }

    private static boolean isSuperseded(BorzoPidgeHandoffRepository.Handoff handoff) {
        return "BORZO_CANCELLED".equals(handoff.state())
            || "PROCESSING_PIDGE".equals(handoff.state())
            || "PIDGE_RECONCILIATION_PENDING".equals(handoff.state())
            || "COMPLETED".equals(handoff.state())
            || ("MANUAL_REVIEW".equals(handoff.state()) && handoff.borzoCancelled());
    }

    private void applyAndPublish(DeliveryJobState job,
                                 ProviderStatusUpdate update,
                                 String source) {
        repository.applyJobStatus(
            job.id(),
            update.status().name(),
            update.providerStatus(),
            update.trackingUrl(),
            update.observedAt(),
            source,
            nextTrackingAt(update.status())
        );

        var completedHandoff = "pidge".equals(update.providerId()) && handoffs != null
            ? handoffs.findByDeliveryJobId(job.id())
                .filter(handoff -> "COMPLETED".equals(handoff.state())
                    && handoff.borzoCancelled()).orElse(null)
            : null;
        var courier = update.courier();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            job.id(),
            job.orderId(),
            job.chefSubOrderId(),
            update.providerId(),
            update.providerOrderId(),
            update.status().name(),
            update.trackingUrl(),
            update.observedAt(),
            completedHandoff == null ? null : "borzo",
            completedHandoff == null ? null : completedHandoff.borzoProviderDeliveryId(),
            completedHandoff == null ? null : Boolean.TRUE,
            courier == null ? null : courier.name(),
            courier == null ? null : courier.phone(),
            courier == null ? null : courier.photoUrl(),
            null
        );
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(),
            DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            "1.0",
            Instant.now(),
            job.orderId(),
            null,
            "integration-service",
            "delivery-job/" + job.id(),
            data
        );
        outbox.enqueue(
            DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            job.id(),
            job.orderId(),
            objectMapper.valueToTree(event)
        );
        courierEnded(job, update, source);
    }

    /**
     * CRAVES_DELIVERY_STATUS_RANK_GUARD, under the job's row lock: an update decide() accepted that would move the job to
     * an earlier stage is logged (shadow) or refused as STALE_RANK (enforce). Off, the decision is returned untouched.
     */
    private Decision rankGuard(DeliveryJobState job, ProviderStatusUpdate update, Decision decision, String source) {
        String mode = properties.getStatusRankGuard();
        if (!decision.applied() || !("shadow".equals(mode) || "enforce".equals(mode))) {
            return decision;
        }
        DeliveryStatus current = parseStatus(job.status());
        boolean pickedUp = rank(current) == 0 && guardStatements(mode, "PICKED_UP_READ", job, false, () -> repository.pickedUp(job.id()));
        if (!backwards(current, pickedUp, update.status())) {
            return decision;
        }
        log.warn("DELIVERY_STATUS_RANK_GUARD mode={} decision=STALE_RANK source={} provider={} jobId={} delivery={} from={} to={} "
            + "providerStatus={}", mode, source, update.providerId(), job.id(), safe(update.providerOrderId()), current,
            update.status(), safe(update.providerStatus()));
        return "enforce".equals(mode) ? Decision.ignored("STALE_RANK") : decision;
    }

    /**
     * With the rank guard on: a courier ended (CANCELLED or FAILED) a live booking that Craves did not cancel and whose
     * order is not cancelled. Shadow logs it; enforce also opens one ops case in this transaction and alerts once.
     */
    private void courierEnded(DeliveryJobState job, ProviderStatusUpdate update, String source) {
        String mode = properties.getStatusRankGuard();
        if (!("shadow".equals(mode) || "enforce".equals(mode))
            || (update.status() != DeliveryStatus.CANCELLED && update.status() != DeliveryStatus.FAILED)
            || isTerminal(parseStatus(job.status()))
            || "craves_fleet".equals(normalize(update.providerId()))
            || guardStatements(mode, "CRAVES_ENDED_READ", job, true,
                () -> repository.cravesEndedBooking(update.providerId(), update.providerOrderId(), job.chefSubOrderId()))) {
            return;
        }
        log.warn("DELIVERY_STATUS_RANK_GUARD mode={} decision=COURIER_ENDED source={} provider={} jobId={} delivery={} from={} to={} "
            + "providerStatus={}", mode, source, update.providerId(), job.id(), safe(update.providerOrderId()), job.status(),
            update.status(), safe(update.providerStatus()));
        String note = safe(update.providerId()) + " ended booking " + safe(update.providerOrderId()) + " as " + update.status()
            + " while it was " + job.status();
        if ("enforce".equals(mode) && guardStatements(mode, "CASE_OPEN", job, false,
            () -> repository.openCourierEndedCase(job.id(), job.orderId(), note))) {
            log.error("CRAVES_ALERT alert=COURIER_ENDED_DELIVERY provider={} orderId={} chefSubOrderId={} jobId={} delivery={} was={} "
                + "status={}", update.providerId(), job.orderId(), job.chefSubOrderId(), job.id(), safe(update.providerOrderId()),
                job.status(), update.status());
        }
    }

    /**
     * The guard's own statements, in a savepoint: when one fails the status update goes on as it would without the guard
     * (ifFailed), with one error line.
     */
    private boolean guardStatements(String mode, String step, DeliveryJobState job, boolean ifFailed, Supplier<Boolean> statements) {
        try {
            return repository.inSavepoint(statements);
        } catch (RuntimeException failure) {
            log.error("DELIVERY_STATUS_RANK_GUARD mode={} decision=GUARD_FAILED step={} jobId={} error={}", mode, step, job.id(),
                safe(failure.getMessage()));
            return ifFailed;
        }
    }

    /** A stage's place in a delivery; 100 is final; 0 for DELAYED and UNKNOWN, which are not stages. */
    static int rank(DeliveryStatus status) {
        return switch (status) {
            case PENDING -> 10;
            case SEARCHING -> 20;
            case COURIER_ASSIGNED -> 30;
            case COURIER_TO_PICKUP -> 35;
            case AT_PICKUP -> 40;
            case PICKED_UP -> 50;
            case IN_TRANSIT -> 60;
            case AT_DROPOFF -> 70;
            case RETURNING -> 80;
            case DELIVERED, RETURNED, CANCELLED, FAILED -> 100;
            case DELAYED, UNKNOWN -> 0;
        };
    }

    /**
     * Whether next is an earlier stage than current. pickedUp: for a job that is DELAYED (no stage), whether its parcel
     * was picked up. Allowed although lower, before pickup only: from an assigned courier back to PENDING or SEARCHING
     * (the courier dropped the job and the provider searches again) or to COURIER_ASSIGNED (the provider gave the job to
     * another rider without a search). DELAYED is never earlier.
     * shortcut: a re-match is told by its status alone and a DELAYED job keeps only the pickup boundary, upgrade with
     * provider clocks and delayed_at.
     */
    static boolean backwards(DeliveryStatus current, boolean pickedUp, DeliveryStatus next) {
        int to = rank(next);
        if (to == 0) {
            return false;
        }
        int from = rank(current) != 0 ? rank(current) : rank(pickedUp ? DeliveryStatus.PICKED_UP : DeliveryStatus.PENDING);
        boolean rematch = from >= rank(DeliveryStatus.COURIER_ASSIGNED) && from <= rank(DeliveryStatus.AT_PICKUP)
            && to <= rank(DeliveryStatus.COURIER_ASSIGNED);
        return to < from && !rematch;
    }

    private Decision decide(DeliveryJobState job,
                            ProviderStatusUpdate update) {
        if (update.status() == DeliveryStatus.UNKNOWN) {
            return Decision.ignored("UNKNOWN_PROVIDER_STATUS");
        }
        if (job.lastStatusObservedAt() != null
            && !update.observedAt().isAfter(job.lastStatusObservedAt())) {
            return Decision.ignored("STALE_OR_EQUAL_OBSERVED_AT");
        }
        DeliveryStatus current = parseStatus(job.status());
        if (isTerminal(current) && current != update.status()) {
            return Decision.ignored("TERMINAL_STATUS_PROTECTED");
        }
        if (sameState(job, update.status(), update.providerStatus(), update.trackingUrl())) {
            return Decision.ignored("NO_STATE_CHANGE");
        }
        return Decision.accepted();
    }

    private static boolean sameState(DeliveryJobState job, DeliveryStatus status, String providerStatus, String trackingUrl) {
        return parseStatus(job.status()) == status
            && Objects.equals(
                normalize(job.providerStatus()),
                normalize(providerStatus)
            )
            && Objects.equals(
                normalize(job.trackingUrl()),
                normalize(trackingUrl)
            );
    }

    private Instant nextTrackingAt(DeliveryStatus status) {
        return isTerminal(status)
            ? null
            : Instant.now().plusSeconds(properties.isWebhookFirstTrackingEnabled()
                ? quietSeconds(status)
                : properties.getTrackingPollSeconds());
    }

    private DeliveryWebhookNormalizer normalizer(String providerId) {
        DeliveryWebhookNormalizer normalizer = normalizers.get(normalize(providerId));
        if (normalizer == null) {
            throw new UnsupportedProviderException(
                "No webhook normalizer is registered for provider " + safe(providerId)
            );
        }
        return normalizer;
    }

    private static Map<String, DeliveryWebhookNormalizer> indexNormalizers(
        List<DeliveryWebhookNormalizer> normalizers
    ) {
        Map<String, DeliveryWebhookNormalizer> indexed = new HashMap<>();
        for (DeliveryWebhookNormalizer normalizer : normalizers) {
            DeliveryWebhookNormalizer previous = indexed.put(
                normalize(normalizer.providerId()),
                normalizer
            );
            if (previous != null) {
                throw new IllegalStateException(
                    "Duplicate delivery webhook normalizer " + normalizer.providerId()
                );
            }
        }
        return Map.copyOf(indexed);
    }

    private static void requireProviderMatch(String expected,
                                             String actual) {
        if (!normalize(expected).equals(normalize(actual))) {
            throw new IllegalStateException(
                "Webhook provider does not match the selected normalizer"
            );
        }
    }

    private static String webhookEventType(JsonNode payload) {
        String value = payload.path("event_type").asText(null);
        return StringUtils.hasText(value) ? value : "provider_webhook";
    }

    private static DeliveryStatus parseStatus(String value) {
        try {
            return DeliveryStatus.valueOf(value);
        } catch (Exception ignored) {
            return DeliveryStatus.UNKNOWN;
        }
    }

    private static boolean isTerminal(DeliveryStatus status) {
        return status == DeliveryStatus.DELIVERED
            || status == DeliveryStatus.CANCELLED
            || status == DeliveryStatus.RETURNED
            || status == DeliveryStatus.FAILED;
    }

    private static String trackingEventId(ProviderStatusUpdate update) {
        String canonical = String.join(
            "|",
            update.providerId(),
            update.providerOrderId(),
            update.status().name(),
            normalize(update.providerStatus()),
            update.observedAt().toString()
        );
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return "track-" + HexFormat.of().formatHex(
                digest.digest(canonical.getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception ex) {
            throw new IllegalStateException(
                "Could not derive tracking event identity",
                ex
            );
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String safe(String value) {
        if (value == null) {
            return "<null>";
        }
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= 200
            ? normalized
            : normalized.substring(0, 200);
    }

    private record Decision(boolean applied, String reason) {
        static Decision accepted() {
            return new Decision(true, "APPLIED");
        }

        static Decision ignored(String reason) {
            return new Decision(false, reason);
        }
    }

    public record ProcessingResult(
        UUID deliveryJobId,
        boolean applied,
        boolean duplicate,
        String result
    ) {}

    public static class UnmatchedDeliveryJobException extends RuntimeException {
        private final String providerId;
        private final String providerOrderId;

        public UnmatchedDeliveryJobException(String message) {
            this(message, null, null);
        }

        /** With the courier and its booking id, when it was the booking that matched no job. */
        public UnmatchedDeliveryJobException(String message, String providerId, String providerOrderId) {
            super(message);
            this.providerId = providerId;
            this.providerOrderId = providerOrderId;
        }

        public String providerId() {
            return providerId;
        }

        public String providerOrderId() {
            return providerOrderId;
        }
    }

    public static class UnsupportedProviderException extends RuntimeException {
        public UnsupportedProviderException(String message) {
            super(message);
        }
    }
}
