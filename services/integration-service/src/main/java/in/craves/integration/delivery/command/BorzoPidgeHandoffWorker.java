package in.craves.integration.delivery.command;

import in.craves.integration.config.BorzoProperties;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.borzo.BorzoApiClient;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository.Handoff;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
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
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
    // Attempts count the Borzo phase too: the Pidge fallback starts at about attempt 2, so attempt 7 is ~10 minutes in.
    private static final int STALLED_ALERT_ATTEMPT = 7;
    // Courier capabilities only: the Pidge phase's last try when nothing was sent to Pidge.
    static final int PIDGE_PHASE_TRIES = 10;

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
    private ProviderCreateAttemptRepository journal;
    private DeliveryCommandProperties properties;
    private in.craves.integration.delivery.status.DeliveryStatusRepository cases;

    /** Courier capabilities (CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED); off, or unset, nothing below changes. */
    @Autowired(required = false)
    public void setCapabilities(DeliveryCommandProperties properties, in.craves.integration.delivery.status.DeliveryStatusRepository cases) {
        this.properties = properties;
        this.cases = cases;
    }

    private boolean capabilitiesOn() {
        return properties != null && cases != null && properties.isCourierCapabilitiesEnabled();
    }

    /** A Borzo search kept because Pidge cannot carry the order gets a person once the courier wait cap is over. */
    private void capRetainedSearches() {
        try {
            for (BorzoPidgeHandoffRepository.RetainedSearch search : handoffs.retainedSearchesPastCap(properties.getCourierWaitCapMinutes())) {
                if (cases.openSystemCase(search.deliveryJobId(), search.orderId(), "RIDER_NOT_ASSIGNED",
                    "Borzo has not assigned a courier and Pidge cannot carry this order")) {
                    log.error("CRAVES_ALERT alert=DELIVERY_COURIER_WAIT_CAP jobId={} chefSubOrderId={} orderId={} was=RETAINED_BORZO capMinutes={}",
                        search.deliveryJobId(), search.chefSubOrderId(), search.orderId(), properties.getCourierWaitCapMinutes());
                }
            }
        } catch (RuntimeException error) {
            log.error("Retained Borzo searches could not be checked against the wait cap", error);
        }
    }

    /** The Pidge phase is over without a courier: a person takes it from here. */
    private void endPidgePhase(Handoff handoff, int tries, boolean pidgeBookingMayExist, String reason) {
        handoffs.manualReview(handoff.deliveryJobId(), reason);
        UUID orderId = jobs.findHandoffJob(handoff.deliveryJobId()).map(DeliveryJobRepository.HandoffJob::orderId).orElse(null);
        log.error("CRAVES_ALERT alert=DELIVERY_HANDOFF_NO_COURIER orderId={} jobId={} reason={}", orderId, handoff.deliveryJobId(), reason);
        if (orderId != null) {
            cases.openSystemCase(handoff.deliveryJobId(), orderId, "RIDER_NOT_ASSIGNED", "Borzo was cancelled and the handoff to Pidge "
                + "did not finish after " + tries + " tries. " + (pidgeBookingMayExist ? "A Pidge booking may exist: check Pidge first. "
                : "Nothing was booked with Pidge. ") + reason);
        }
    }

    /**
     * Whether Pidge may hold a booking for this handoff. PidgeApiClient records pidge_booking before it calls Pidge, under
     * the order's id or, with the journal on, the attempt's reference; a row that is not REJECTED or CANCELLED may be live.
     * When that cannot be read the answer is yes.
     */
    private boolean pidgeBookingMayExist(Handoff handoff) {
        try {
            DeliveryJobRepository.HandoffJob job = jobs.findHandoffJob(handoff.deliveryJobId()).orElse(null);
            if (job == null) {
                return true;
            }
            List<String> references = new java.util.ArrayList<>(List.of(job.chefSubOrderId().toString()));
            if (journalOn()) {
                pidgeAttempts(job.chefSubOrderId()).forEach(attempt -> references.add(attempt.clientRef()));
            }
            return references.stream().anyMatch(reference -> pidgeBookings.find(reference)
                .filter(booking -> !"REJECTED".equals(booking.state()) && !"CANCELLED".equals(booking.state())).isPresent());
        } catch (RuntimeException unreadable) {
            return true;
        }
    }

    /** The booking journal (V191); used only while CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED is on. */
    @Autowired(required = false)
    public void setJournal(ProviderCreateAttemptRepository journal) {
        this.journal = journal;
    }

    private boolean journalOn() {
        return journal != null && journal.enabled();
    }

    private List<Attempt> pidgeAttempts(UUID chefSubOrderId) {
        return journal.forOrder(chefSubOrderId).stream().filter(row -> "pidge".equals(row.providerId())).toList();
    }

    private static boolean unresolved(Attempt row) {
        return ProviderCreateAttemptRepository.INTENT.equals(row.state()) || ProviderCreateAttemptRepository.UNKNOWN.equals(row.state());
    }

    /** The handoff's Pidge attempt is over without a booking; no attempt when the journal is off. */
    private void close(Attempt attempt, String state, String why) {
        if (attempt != null) {
            journal.move(attempt, Set.of(ProviderCreateAttemptRepository.INTENT, ProviderCreateAttemptRepository.UNKNOWN), state, why, null);
        }
    }

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

    @Scheduled(scheduler = in.craves.integration.config.WorkerSchedulingConfiguration.DELIVERY_SCHEDULER, fixedDelayString = "${craves.delivery-command.borzo-pidge-handoff-interval-ms:5000}")
    public void processDue() {
        if (capabilitiesOn()) {
            capRetainedSearches();
        }
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
            } catch (PidgeBookingEndedException error) {
                // Borzo is cancelled and Pidge refused or cancelled the booking, so no courier holds the order and a retry
                // would get the same answer forever (incident of 14 Oct): a person books one by hand or cancels the order.
                handoffs.manualReview(handoff.deliveryJobId(), safeMessage(error));
                log.error("CRAVES_ALERT alert=DELIVERY_HANDOFF_NO_COURIER orderId={} jobId={} reason={}",
                    error.orderId, handoff.deliveryJobId(), safeMessage(error));
            } catch (RuntimeException error) {
                String reason = safeMessage(error);
                if (capabilitiesOn() && "PROCESSING_PIDGE".equals(handoff.state())) {
                    // The Pidge phase has an end. While Pidge may hold a booking (its answer was lost, or it was booked and a
                    // later step failed) the booking is only looked up from here on, and the phase is never ended as "not booked".
                    boolean outcomeUnknown = error instanceof PidgeOutcomeUnknownException
                        || error instanceof in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException
                        || pidgeBookingMayExist(handoff);
                    int tries = handoffs.pidgePhaseTry(handoff.deliveryJobId(), handoff.attemptCount());
                    long delaySeconds = Math.min(300L, 5L << Math.min(handoff.attemptCount(), 6));
                    if (tries >= MAX_ATTEMPTS || (tries >= PIDGE_PHASE_TRIES && !outcomeUnknown)) {
                        endPidgePhase(handoff, tries, outcomeUnknown, outcomeUnknown
                            ? "Pidge booking outcome is still unknown; check Pidge before booking anyone: " + reason : reason);
                        continue;
                    }
                    if (handoff.attemptCount() == STALLED_ALERT_ATTEMPT) {
                        log.error("CRAVES_ALERT alert=DELIVERY_HANDOFF_STALLED jobId={} attempts={} reason={}",
                            handoff.deliveryJobId(), handoff.attemptCount(), reason);
                    }
                    if (outcomeUnknown) {
                        handoffs.awaitPidgeOutcome(handoff.deliveryJobId(), Instant.now().plusSeconds(delaySeconds), reason);
                    } else {
                        handoffs.retry(handoff.deliveryJobId(), handoff.state(), Instant.now().plusSeconds(delaySeconds), reason);
                    }
                    log.warn("Delivery handoff Pidge phase jobId={} attempts={} outcomeUnknown={} reason={}",
                        handoff.deliveryJobId(), handoff.attemptCount(), outcomeUnknown, reason);
                    continue;
                }
                if (handoff.attemptCount() >= MAX_ATTEMPTS
                    && !"PROCESSING_PIDGE".equals(handoff.state())) {
                    handoffs.manualReview(handoff.deliveryJobId(), reason);
                    log.error("Delivery handoff requires manual review jobId={} phase={} reason={}",
                        handoff.deliveryJobId(), handoff.state(), reason);
                } else {
                    if (handoff.attemptCount() == STALLED_ALERT_ATTEMPT && "PROCESSING_PIDGE".equals(handoff.state())) {
                        // Borzo is cancelled: keep retrying, since an uncertain Pidge booking must be reconciled and never
                        // doubled, but page once.
                        log.error("CRAVES_ALERT alert=DELIVERY_HANDOFF_STALLED jobId={} attempts={} reason={}",
                            handoff.deliveryJobId(), handoff.attemptCount(), reason);
                    }
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
        if (capabilitiesOn()) {
            var needs = in.craves.integration.delivery.provider.DeliveryProviderAdapter.needs(request(job.chefSubOrderId()));
            if (!pidge.capabilities().containsAll(needs)) {
                // Pidge cannot carry it, so Borzo is not cancelled: its search goes on, up to the courier wait cap.
                handoffs.markRetainedByWorker(job.id());
                log.info("Borzo kept: Pidge cannot carry this order jobId={} needs={}", job.id(), needs);
                return;
            }
        }
        if (!pidgeReady()) {
            throw new IllegalStateException("Pidge is not ready to accept the fallback");
        }
        if (journalOn()) {
            // Borzo is kept while Pidge could not be booked for this order: an attempt of its own would not begin.
            List<Attempt> earlier = pidgeAttempts(job.chefSubOrderId());
            if (earlier.stream().noneMatch(BorzoPidgeHandoffWorker::unresolved) && !ProviderCreateAttemptRepository.bookable(earlier)) {
                if (earlier.stream().anyMatch(row -> ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state()))) {
                    // That attempt may yet turn out refused, or be cancelled: tried again.
                    throw new IllegalStateException("Pidge may not be booked again for this order");
                }
                // Nothing will change that: a retry would get the same answer every time.
                handoffs.manualReview(job.id(), "Pidge may not be booked again for this order; Borzo was kept");
                log.error("Delivery handoff requires manual review jobId={} phase={} reason=Pidge may not be booked again for this order",
                    job.id(), handoff.state());
                return;
            }
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
        // With the journal on the booking goes under its own attempt's reference: the unresolved one this handoff began
        // earlier (PidgeApiClient records pidge_booking before it calls Pidge, so none there means nothing was sent), or a
        // new one begun just before the call.
        Attempt attempt = null;
        if (journalOn()) {
            attempt = pidgeAttempts(job.chefSubOrderId()).stream().filter(BorzoPidgeHandoffWorker::unresolved).findFirst().orElse(null);
            if (attempt != null) {
                reference = attempt.clientRef();
            } else if (pidgeBookings.find(reference).isEmpty()) {
                reference = null;
            } // else a booking this handoff made before the journal was on: it goes on under the order's id, as then
        }
        PidgeBookingRepository.Booking booking = reference == null ? null : pidgeBookings.find(reference).orElse(null);
        if (!orderEligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())) {
            compensateIneligiblePidge(handoff, job, reference, booking, null, attempt);
            return;
        }
        ProviderDelivery delivery;
        if (booking != null) {
            if ("REJECTED".equals(booking.state()) || "CANCELLED".equals(booking.state())) {
                close(attempt, ProviderCreateAttemptRepository.REJECTED, "Pidge rejected or cancelled the booking");
                throw new PidgeBookingEndedException(job.orderId(),
                    "Pidge booking was definitively rejected or cancelled");
            }
            CreateReconciliationResult result = pidge.reconcileCreate(reference, handoff.dueAt());
            if (result.status() != CreateReconciliationStatus.FOUND) {
                throw new PidgeOutcomeUnknownException();
            }
            delivery = result.delivery();
        } else {
            QuoteRequest request = request(job.chefSubOrderId());
            ProviderQuote quote = pidge.quote(request);
            if (quote == null || !quote.available()) {
                throw new IllegalStateException("Pidge has no currently available immediate delivery quote");
            }
            requireCommercialOrder(job);
            if (journalOn() && attempt == null) {
                // Committed before the call. Refused: Pidge already holds or refused this order's bookings; a person decides.
                attempt = journal.begin(job.chefSubOrderId(), "pidge").orElseThrow(() -> new PidgeBookingEndedException(job.orderId(),
                    "Pidge may not be booked again for this order"));
                reference = attempt.clientRef();
            }
            delivery = pidge.create(new CreateDeliveryRequest(reference, request, quote));
        }
        if (delivery.status() == DeliveryStatus.UNKNOWN || delivery.status() == DeliveryStatus.PENDING
            || delivery.status() == DeliveryStatus.CANCELLED || delivery.status() == DeliveryStatus.FAILED) {
            throw new IllegalStateException("Pidge delivery is not confirmed ready");
        }
        try {
            requireCommercialOrder(job);
        } catch (CommercialOrderIneligibleException noLongerEligible) {
            compensateIneligiblePidge(handoff, job, reference, booking, delivery, attempt);
            return;
        }
        if (attempt == null) {
            completion.complete(handoff, delivery);
        } else {
            completion.complete(handoff, delivery, attempt.clientRef());
        }
        log.info("Borzo-to-Pidge delivery handoff completed jobId={}", job.id());
    }

    private void compensateIneligiblePidge(Handoff handoff,
                                           DeliveryJobRepository.HandoffJob job,
                                           String reference,
                                           PidgeBookingRepository.Booking booking,
                                           ProviderDelivery knownDelivery,
                                           Attempt attempt) {
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
        close(attempt, pidgeId != null ? "CANCELLED" : ProviderCreateAttemptRepository.REJECTED, "The order was no longer eligible");
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

    private static final class PidgeBookingEndedException extends RuntimeException {
        private final UUID orderId;

        PidgeBookingEndedException(UUID orderId, String message) {
            super(message);
            this.orderId = orderId;
        }
    }

    /** A Pidge booking was sent and Pidge does not show it yet. */
    private static final class PidgeOutcomeUnknownException extends IllegalStateException {
        PidgeOutcomeUnknownException() {
            super("Pidge booking outcome still requires reconciliation");
        }
    }

    private static final class CommercialOrderIneligibleException extends RuntimeException {
        CommercialOrderIneligibleException() {
            super("Commercial order is not eligible for delivery handoff");
        }
    }
}
