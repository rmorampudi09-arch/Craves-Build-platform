package in.craves.integration.delivery.command;

import in.craves.integration.config.BorzoProperties;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.borzo.BorzoApiClient;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository.Handoff;
import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.pidge.PidgeBookingRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Borzo has 120 seconds from the first selection attempt to assign a courier. This worker is deliberately separate
 * from the completed delivery command: a lost process or callback cannot create two couriers.
 */
@Component
public class BorzoPidgeHandoffWorker {
    private static final Logger log = LoggerFactory.getLogger(BorzoPidgeHandoffWorker.class);
    private static final int BATCH_SIZE = 20;
    private static final int MAX_ATTEMPTS = 20;

    private final BorzoPidgeHandoffRepository handoffs;
    private final DeliveryJobRepository jobs;
    private final DeliveryCommandRepository commands;
    private final DeliveryOutboxRepository outbox;
    private final OrderHandoffEligibilityClient orderEligibility;
    private final DeliveryProviderCatalogRepository catalog;
    private final BorzoApiClient borzo;
    private final BorzoProperties borzoProperties;
    private final PidgeApiClient pidge;
    private final PidgeProperties pidgeProperties;
    private final PidgeBookingRepository pidgeBookings;
    private final DeliveryStatusUpdateService statusUpdates;
    private final BorzoPidgeHandoffCompletionService completion;

    public BorzoPidgeHandoffWorker(BorzoPidgeHandoffRepository handoffs,
                                  DeliveryJobRepository jobs,
                                  DeliveryCommandRepository commands,
                                  DeliveryOutboxRepository outbox,
                                  OrderHandoffEligibilityClient orderEligibility,
                                  DeliveryProviderCatalogRepository catalog,
                                  BorzoApiClient borzo,
                                  BorzoProperties borzoProperties,
                                  PidgeApiClient pidge,
                                  PidgeProperties pidgeProperties,
                                  PidgeBookingRepository pidgeBookings,
                                  DeliveryStatusUpdateService statusUpdates,
                                  BorzoPidgeHandoffCompletionService completion) {
        this.handoffs = handoffs;
        this.jobs = jobs;
        this.commands = commands;
        this.outbox = outbox;
        this.orderEligibility = orderEligibility;
        this.catalog = catalog;
        this.borzo = borzo;
        this.borzoProperties = borzoProperties;
        this.pidge = pidge;
        this.pidgeProperties = pidgeProperties;
        this.pidgeBookings = pidgeBookings;
        this.statusUpdates = statusUpdates;
        this.completion = completion;
    }

    @Scheduled(fixedDelayString = "${craves.delivery-command.borzo-pidge-handoff-interval-ms:5000}")
    public void processDue() {
        for (int index = 0; index < BATCH_SIZE; index++) {
            List<Handoff> due = handoffs.claimDue(1);
            if (due.isEmpty()) return;
            Handoff handoff = due.getFirst();
            try {
                if ("PROCESSING_BORZO".equals(handoff.state())) {
                    checkBorzo(handoff);
                } else {
                    bookPidge(handoff);
                }
            } catch (ExternalBorzoCancellationException error) {
                handoffs.manualReview(handoff.deliveryJobId(), safeMessage(error));
                log.error("External Borzo cancellation requires review jobId={}",
                    handoff.deliveryJobId());
            } catch (RuntimeException error) {
                String reason = safeMessage(error);
                if (handoff.attemptCount() >= MAX_ATTEMPTS
                    && !"PROCESSING_PIDGE".equals(handoff.state())) {
                    handoffs.manualReview(handoff.deliveryJobId(), reason);
                    log.error("Delivery handoff requires manual review jobId={} phase={} reason={}",
                        handoff.deliveryJobId(), handoff.state(), reason);
                } else {
                    long delaySeconds = Math.min(300L, 5L << Math.min(handoff.attemptCount(), 6));
                    handoffs.retry(handoff.deliveryJobId(), handoff.state(),
                        Instant.now().plusSeconds(delaySeconds), reason);
                    log.warn("Delivery handoff retry scheduled jobId={} phase={} reason={}",
                        handoff.deliveryJobId(), handoff.state(), reason);
                }
            }
        }
    }

    private void checkBorzo(Handoff handoff) {
        DeliveryJobRepository.HandoffJob job = currentBorzoJob(handoff);
        if (isAccepted(parseStatus(job.status()))) {
            handoffs.markRetainedByWorker(job.id());
            return;
        }
        if (!"PENDING".equals(job.status()) && !"SEARCHING".equals(job.status())
            && !"DELAYED".equals(job.status())) {
            throw new IllegalStateException("Borzo delivery status needs review before fallback");
        }
        if (!borzoProperties.isEnabled() || !borzoProperties.productionReady()) {
            throw new IllegalStateException("Borzo production tracking/cancellation is unavailable");
        }

        ProviderDelivery latest = borzo.readOrder(handoff.borzoProviderDeliveryId());
        if (isAccepted(latest.status())) {
            handoffs.markRetainedByWorker(job.id());
            statusUpdates.processTracking(new TrackingWorkItem(job.id(), job.orderId(),
                job.chefSubOrderId(), "borzo", handoff.borzoProviderDeliveryId(), 0),
                new TrackingSnapshot(latest, null, Instant.now()));
            return;
        }
        if (latest.status() == DeliveryStatus.DELAYED) {
            var courier = borzo.readCourier(handoff.borzoProviderDeliveryId());
            if (courier != null && courier.providerCourierId() != null
                && !courier.providerCourierId().isBlank()) {
                handoffs.markRetainedByWorker(job.id());
                statusUpdates.processTracking(new TrackingWorkItem(job.id(), job.orderId(),
                    job.chefSubOrderId(), "borzo", handoff.borzoProviderDeliveryId(), 0),
                    new TrackingSnapshot(latest, courier, Instant.now()));
                return;
            }
        }
        if (latest.status() == DeliveryStatus.CANCELLED) {
            if (!handoff.cancelIntentRecorded()) {
                throw new ExternalBorzoCancellationException(
                    "Borzo was cancelled without a recorded worker cancellation intent");
            }
            requireCommercialOrder(job);
            requireStateChange(handoffs.markBorzoCancelled(job.id()),
                "Borzo cancellation state changed");
            return;
        }
        if (latest.status() != DeliveryStatus.PENDING && latest.status() != DeliveryStatus.SEARCHING
            && latest.status() != DeliveryStatus.DELAYED) {
            throw new IllegalStateException("Borzo state is not safe for automatic cancellation");
        }
        if (!pidgeReady()) {
            throw new IllegalStateException("Pidge is not ready to accept the fallback");
        }
        requireCommercialOrder(job);
        ProviderQuote quote = pidge.quote(request(job.chefSubOrderId()));
        if (quote == null || !quote.available()) {
            throw new IllegalStateException("Pidge has no currently available immediate delivery quote");
        }
        if (!outbox.hasPublishedBorzoStatus(job.id())) {
            throw new IllegalStateException("Initial Borzo delivery status has not been published");
        }
        DeliveryJobRepository.HandoffJob beforeCancel = currentBorzoJob(handoff);
        if (!"PENDING".equals(beforeCancel.status()) && !"SEARCHING".equals(beforeCancel.status())
            && !"DELAYED".equals(beforeCancel.status())) {
            handoffs.markRetainedByWorker(job.id());
            return;
        }
        requireCommercialOrder(beforeCancel);
        ProviderDelivery immediatelyBeforeCancel = borzo.readOrder(handoff.borzoProviderDeliveryId());
        if (isAccepted(immediatelyBeforeCancel.status())) {
            handoffs.markRetainedByWorker(job.id());
            return;
        }
        if (immediatelyBeforeCancel.status() == DeliveryStatus.DELAYED) {
            var courier = borzo.readCourier(handoff.borzoProviderDeliveryId());
            if (courier != null && courier.providerCourierId() != null
                && !courier.providerCourierId().isBlank()) {
                handoffs.markRetainedByWorker(job.id());
                return;
            }
        }
        if (immediatelyBeforeCancel.status() != DeliveryStatus.PENDING
            && immediatelyBeforeCancel.status() != DeliveryStatus.SEARCHING
            && immediatelyBeforeCancel.status() != DeliveryStatus.DELAYED) {
            throw new IllegalStateException("Borzo changed to a non-cancellable state before fallback");
        }

        // A failed or uncertain cancellation never permits Pidge create. A retry tracks Borzo first.
        requireStateChange(handoffs.markCancelIntent(job.id()),
            "Borzo cancellation intent could not be recorded");
        ProviderDelivery cancellation = borzo.cancel(handoff.borzoProviderDeliveryId());
        if (cancellation.status() != DeliveryStatus.CANCELLED
            || borzo.readOrder(handoff.borzoProviderDeliveryId()).status()
                != DeliveryStatus.CANCELLED) {
            throw new IllegalStateException("Borzo cancellation was not confirmed by tracking");
        }
        requireStateChange(handoffs.markBorzoCancelled(job.id()), "Borzo cancellation state changed");
    }

    private void bookPidge(Handoff handoff) {
        DeliveryJobRepository.HandoffJob job = currentBorzoJob(handoff);
        if (!"PENDING".equals(job.status()) && !"SEARCHING".equals(job.status())
            && !"DELAYED".equals(job.status())) {
            throw new IllegalStateException("Borzo delivery progressed during handoff");
        }
        if (!pidgeReady()) {
            throw new IllegalStateException("Pidge production booking gates are incomplete");
        }
        String reference = job.chefSubOrderId().toString();
        PidgeBookingRepository.Booking booking = pidgeBookings.find(reference).orElse(null);
        if (!orderEligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())) {
            compensateIneligiblePidge(handoff, job, reference, booking, null);
            return;
        }
        ProviderDelivery delivery;
        if (booking != null) {
            if ("REJECTED".equals(booking.state()) || "CANCELLED".equals(booking.state())) {
                throw new IllegalStateException("Pidge booking was definitively rejected or cancelled");
            }
            CreateReconciliationResult result = pidge.reconcileCreate(reference, handoff.dueAt());
            if (result.status() != CreateReconciliationStatus.FOUND) {
                throw new IllegalStateException("Pidge booking outcome still requires reconciliation");
            }
            delivery = result.delivery();
        } else {
            QuoteRequest request = request(job.chefSubOrderId());
            ProviderQuote quote = pidge.quote(request);
            if (quote == null || !quote.available()) {
                throw new IllegalStateException("Pidge has no currently available immediate delivery quote");
            }
            requireCommercialOrder(job);
            delivery = pidge.create(new CreateDeliveryRequest(reference, request, quote));
        }
        if (delivery.status() == DeliveryStatus.UNKNOWN || delivery.status() == DeliveryStatus.PENDING
            || delivery.status() == DeliveryStatus.CANCELLED || delivery.status() == DeliveryStatus.FAILED) {
            throw new IllegalStateException("Pidge delivery is not confirmed ready");
        }
        try {
            requireCommercialOrder(job);
        } catch (CommercialOrderIneligibleException noLongerEligible) {
            compensateIneligiblePidge(handoff, job, reference, booking, delivery);
            return;
        }
        completion.complete(handoff, delivery);
        log.info("Borzo-to-Pidge delivery handoff completed jobId={}", job.id());
    }

    private void compensateIneligiblePidge(Handoff handoff,
                                           DeliveryJobRepository.HandoffJob job,
                                           String reference,
                                           PidgeBookingRepository.Booking booking,
                                           ProviderDelivery knownDelivery) {
        String pidgeId = knownDelivery == null ? null : knownDelivery.providerDeliveryId();
        if (pidgeId == null && booking != null) pidgeId = booking.id();
        if (pidgeId == null && booking != null
            && !"REJECTED".equals(booking.state())
            && !"CANCELLED".equals(booking.state())) {
            CreateReconciliationResult result = pidge.reconcileCreate(reference, handoff.dueAt());
            if (result.status() == CreateReconciliationStatus.FOUND) {
                pidgeId = result.delivery().providerDeliveryId();
            } else if (result.status() != CreateReconciliationStatus.NOT_FOUND) {
                throw new IllegalStateException("Pidge booking must be reconciled before compensation");
            }
        }
        if (pidgeId != null) {
            ProviderDelivery existing = pidge.track(pidgeId).delivery();
            if (existing.status() != DeliveryStatus.CANCELLED) {
                ProviderDelivery cancelled = pidge.cancel(pidgeId);
                if (cancelled.status() != DeliveryStatus.CANCELLED
                    || pidge.track(pidgeId).delivery().status() != DeliveryStatus.CANCELLED) {
                    throw new IllegalStateException("Pidge cancellation is not confirmed");
                }
            }
            pidgeBookings.mark(reference, "CANCELLED");
        }
        handoffs.manualReview(job.id(),
            "Commercial order became ineligible; Pidge booking was not retained");
    }

    private DeliveryJobRepository.HandoffJob currentBorzoJob(Handoff handoff) {
        DeliveryJobRepository.HandoffJob job = jobs.findHandoffJob(handoff.deliveryJobId())
            .orElseThrow(() -> new IllegalStateException("Delivery job is missing"));
        if (!"borzo".equals(job.providerId())
            || !handoff.borzoProviderDeliveryId().equals(job.providerDeliveryId())) {
            throw new IllegalStateException("Delivery job no longer points to the enrolled Borzo order");
        }
        return job;
    }

    private QuoteRequest request(UUID chefSubOrderId) {
        return commands.findByChefSubOrderId(chefSubOrderId)
            .orElseThrow(() -> new IllegalStateException("Original delivery command is missing"))
            .message().deliveryRequest();
    }

    private boolean pidgeReady() {
        return pidgeProperties.productionCreateReady()
            && catalog.activeProviderIds().stream().anyMatch("pidge"::equalsIgnoreCase);
    }

    private void requireCommercialOrder(DeliveryJobRepository.HandoffJob job) {
        if (!orderEligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())) {
            throw new CommercialOrderIneligibleException();
        }
    }

    public static boolean isAccepted(DeliveryStatus status) {
        return status == DeliveryStatus.COURIER_ASSIGNED
            || status == DeliveryStatus.COURIER_TO_PICKUP
            || status == DeliveryStatus.AT_PICKUP
            || status == DeliveryStatus.PICKED_UP
            || status == DeliveryStatus.IN_TRANSIT
            || status == DeliveryStatus.AT_DROPOFF
            || status == DeliveryStatus.DELIVERED
            || status == DeliveryStatus.RETURNING
            || status == DeliveryStatus.RETURNED;
    }

    private static DeliveryStatus parseStatus(String value) {
        try { return DeliveryStatus.valueOf(value); }
        catch (Exception ignored) { return DeliveryStatus.UNKNOWN; }
    }

    private static void requireStateChange(boolean changed, String error) {
        if (!changed) throw new IllegalStateException(error);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) return error.getClass().getSimpleName();
        String safe = message.replace('\n', ' ').replace('\r', ' ');
        return safe.length() <= 500 ? safe : safe.substring(0, 500);
    }

    private static final class ExternalBorzoCancellationException extends RuntimeException {
        ExternalBorzoCancellationException(String message) { super(message); }
    }

    private static final class CommercialOrderIneligibleException extends RuntimeException {
        CommercialOrderIneligibleException() {
            super("Commercial order is not eligible for delivery handoff");
        }
    }
}
