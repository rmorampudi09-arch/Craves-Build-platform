package in.craves.integration.delivery.status;

import in.craves.integration.delivery.command.CourierStrayBookings;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService.UnmatchedDeliveryJobException;
import in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "craves.delivery-command",
    name = "webhook-processing-enabled",
    havingValue = "true"
)
public class DeliveryWebhookProcessor {
    private static final Logger log = LoggerFactory.getLogger(DeliveryWebhookProcessor.class);
    private static final long MAX_RETRY_SECONDS = 300;

    private final DeliveryStatusRepository repository;
    private final DeliveryLeaseRecoveryRepository leaseRecovery;
    private final DeliveryStatusUpdateService statusService;
    private final DeliveryCommandProperties properties;
    // shortcut: a waiting callback asks the courier again on each retry, up to 60 times; keep the reference on the inbox
    // row instead if a courier's API budget ever feels it.
    private static final int PARK_RETRY_SECONDS = 30;
    /** Longer than an unanswered booking takes to be given up and found again (15 minutes, then a 5-minute check). */
    private static final int PARK_FOR_MINUTES = 30;
    private CourierStrayBookings strayBookings;

    /** Used only while CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED is on. */
    @Autowired(required = false)
    public void setStrayBookings(CourierStrayBookings strayBookings) {
        this.strayBookings = strayBookings;
    }

    public DeliveryWebhookProcessor(DeliveryStatusRepository repository,
                                    DeliveryLeaseRecoveryRepository leaseRecovery,
                                    DeliveryStatusUpdateService statusService,
                                    DeliveryCommandProperties properties) {
        this.repository = repository;
        this.leaseRecovery = leaseRecovery;
        this.statusService = statusService;
        this.properties = properties;
    }

    @Scheduled(scheduler = in.craves.integration.config.WorkerSchedulingConfiguration.DELIVERY_SCHEDULER,
        fixedDelayString = "${craves.delivery-command.webhook-processing-interval-ms:2000}"
    )
    public void process() {
        int recovered = leaseRecovery.deadLetterExhaustedWebhookLeases(
            properties.getMaxWebhookAttempts(),
            properties.getWebhookStaleMinutes()
        );
        if (recovered > 0) {
            log.error(
                "Dead-lettered {} webhook rows whose final processing lease expired",
                recovered
            );
        }

        List<WebhookWorkItem> workItems = repository.claimWebhookBatch(
            properties.getWebhookBatchSize(),
            properties.getWebhookStaleMinutes(),
            properties.getMaxWebhookAttempts()
        );
        for (WebhookWorkItem workItem : workItems) {
            processOne(workItem);
        }
    }

    private void processOne(WebhookWorkItem workItem) {
        try {
            DeliveryStatusUpdateService.ProcessingResult result =
                statusService.processWebhook(workItem);
            log.info(
                "Delivery webhook processed inboxId={} provider={} providerEventId={} deliveryJobId={} applied={} duplicate={} result={}",
                workItem.id(),
                workItem.providerId(),
                workItem.providerEventId(),
                result.deliveryJobId(),
                result.applied(),
                result.duplicate(),
                result.result()
            );
        } catch (UnmatchedDeliveryJobException unmatched) {
            if (!parked(workItem, unmatched)) {
                failed(workItem, unmatched);
            }
        } catch (RuntimeException ex) {
            failed(workItem, ex);
        }
    }

    /**
     * Journal on only. The callback's booking is no delivery job's: it waits while the booking is being recorded, adopted
     * or cancelled, and is done once Craves has cancelled the booking. False: handle it as a failure, as before.
     */
    private boolean parked(WebhookWorkItem workItem, UnmatchedDeliveryJobException unmatched) {
        if (strayBookings == null || !strayBookings.enabled() || unmatched.providerOrderId() == null) {
            return false;
        }
        try {
            CourierStrayBookings.Callback decision = strayBookings.onCallback(unmatched.providerId(), unmatched.providerOrderId());
            if (decision == CourierStrayBookings.Callback.SETTLED) {
                repository.markWebhookProcessed(workItem.id(), null, unmatched.providerOrderId(), null, null, "STRAY_BOOKING_CANCELLED");
            } else if (decision != CourierStrayBookings.Callback.WAIT
                || !repository.parkWebhook(workItem.id(), PARK_RETRY_SECONDS, PARK_FOR_MINUTES)) {
                return false;
            }
            log.info("Delivery webhook for a booking that is no delivery job's inboxId={} provider={} providerOrderId={} decision={}",
                workItem.id(), workItem.providerId(), unmatched.providerOrderId(), decision);
            return true;
        } catch (RuntimeException ex) {
            log.warn("Delivery webhook's booking could not be looked up inboxId={} provider={}: {}", workItem.id(), workItem.providerId(),
                safeMessage(ex));
            return false;
        }
    }

    private void failed(WebhookWorkItem workItem, RuntimeException ex) {
        long delaySeconds = retryDelaySeconds(workItem.attemptCount());
        repository.markWebhookFailed(
            workItem.id(),
            workItem.attemptCount(),
            properties.getMaxWebhookAttempts(),
            Instant.now().plusSeconds(delaySeconds),
            safeMessage(ex)
        );
        log.error(
            "Delivery webhook processing failed inboxId={} provider={} providerEventId={} attempt={}",
            workItem.id(),
            workItem.providerId(),
            workItem.providerEventId(),
            workItem.attemptCount(),
            ex
        );
    }

    private long retryDelaySeconds(int attemptCount) {
        int exponent = Math.max(0, Math.min(attemptCount - 1, 20));
        long multiplier = 1L << exponent;
        long base = properties.getWebhookRetryBaseSeconds();
        if (base > MAX_RETRY_SECONDS / multiplier) {
            return MAX_RETRY_SECONDS;
        }
        return Math.min(MAX_RETRY_SECONDS, base * multiplier);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        String normalized = message.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= 1000
            ? normalized
            : normalized.substring(0, 1000);
    }
}
