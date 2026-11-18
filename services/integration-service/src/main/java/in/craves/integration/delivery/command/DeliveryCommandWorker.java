package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandCompletionService.CompletionReceipt;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService.StaleCommandLeaseException;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryRoutingException;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DeliveryCommandWorker {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DeliveryCommandWorker.class);
    /** The receipt and the command's last error when its order was cancelled before a courier was booked. */
    static final String ORDER_CANCELLED = "ORDER_CANCELLED";
    /** A courier's list may lag a new booking: with the journal on, the first look for a lost answer waits this long. */
    static final Duration FIRST_LOOK_AFTER = Duration.ofSeconds(20);
    private final DeliveryCommandRepository commands;
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryProviderRouter router;
    private final DeliveryCommandCompletionService completionService;
    private final DeliveryCommandProperties properties;
    private final DeliveryCommandRetryProperties retryProperties;
    private DeliveryCommandScheduler foodTiming;
    private ProviderCreateAttemptRepository journal;

    public DeliveryCommandWorker(DeliveryCommandRepository commands,
                                 DeliveryJobRepository deliveryJobs,
                                 DeliveryProviderRouter router,
                                 DeliveryCommandCompletionService completionService,
                                 DeliveryCommandProperties properties,
                                 DeliveryCommandRetryProperties retryProperties) {
        this.commands = commands;
        this.deliveryJobs = deliveryJobs;
        this.router = router;
        this.completionService = completionService;
        this.properties = properties;
        this.retryProperties = retryProperties;
    }

    /** With delivery commands on: a command due before its riders would meet the food waits (R16 18, holdUntil). */
    @Autowired(required = false)
    public void setFoodTiming(DeliveryCommandScheduler scheduler) {
        this.foodTiming = scheduler;
    }

    /** The booking journal (V191); used only while CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED is on. */
    @Autowired(required = false)
    public void setJournal(ProviderCreateAttemptRepository journal) {
        this.journal = journal;
    }

    public WorkerReceipt process(DeliveryCommandMessage message) {
        if (message == null || message.commandId() == null || message.chefSubOrderId() == null) {
            throw new DeliveryCommandNonRetryableException("Delivery command identity is missing");
        }
        // Before the claim, so a wait counts no attempt and the command stays SCHEDULED for the chef's ready tap.
        // shortcut: a waiting command keeps its first dispatch_at (FOOD_TIMED_DISPATCH logs the wait); store the new
        // time too once dispatch timing is analysed from the table.
        Instant heldUntil = foodTiming == null ? null : foodTiming.holdUntil(message).orElse(null);
        if (heldUntil != null) {
            throw new DeliveryCommandDeferredException("Riders near the kitchen would arrive before the food", heldUntil,
                "food-timed-" + message.commandId() + "-" + heldUntil.toEpochMilli());
        }

        boolean journalOn = journal != null && journal.enabled();
        Optional<CommandRecord> claimed = journalOn
            ? commands.claim(message.commandId(), properties.getMaxDeliveryAttempts(), ProviderCreateAttemptRepository.COMMAND_LEASE_MINUTES)
            : commands.claim(
            message.commandId(), properties.getMaxDeliveryAttempts()
        );
        if (claimed.isEmpty()) {
            return handleUnclaimed(message.commandId(), message.chefSubOrderId());
        }

        CommandRecord command = claimed.get();
        // With the journal on, this pass's writes carry its claim: they change nothing once another pass holds the command.
        Instant lease = journalOn ? command.processingStartedAt() : null;
        Optional<UUID> existingJob = deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId());
        if (existingJob.isPresent()) {
            commands.markCompleted(message.commandId());
            return new WorkerReceipt(existingJob.get(), true, "ALREADY_COMPLETED");
        }
        // R16 item 11: order-service cancelled the order (ORDER_CANCELLED; a refund alone never stops the food) before anyone
        // was booked, so no rider is offered it and no courier booked.
        if (commands.orderCancelled(message.chefSubOrderId())) {
            commands.markDeadLetter(command.id(), ORDER_CANCELLED);
            return new WorkerReceipt(null, false, ORDER_CANCELLED);
        }

        // Until the fleet stage answers, a provider wait is Craves riders deciding: it must not lengthen the courier back-off.
        boolean ridersDeciding = true;
        RoutingResult booked = null;
        try {
            // Craves riders first (off unless the fleet and dispatch_policy say so); Borzo's window starts only after.
            Optional<UUID> fleetJob = router.fleetStage(command.message());
            ridersDeciding = false;
            if (fleetJob.isPresent()) {
                commands.markCompleted(message.commandId());
                return new WorkerReceipt(fleetJob.get(), true, "craves_fleet");
            }
            RoutingResult routingResult = router.borzoTimedPolicyReady()
                ? router.route(command.message(), commands.startBorzoWindow(command.id()))
                : router.route(command.message());
            booked = routingResult;
            CompletionReceipt receipt = lease == null ? completionService.complete(command.message(), routingResult)
                : completionService.complete(command.message(), routingResult, lease);
            return new WorkerReceipt(
                receipt.deliveryJobId(), receipt.duplicate(), routingResult.providerId()
            );
        } catch (StaleCommandLeaseException stale) {
            throw superseded(command, booked);
        } catch (DeliveryCreateReconciliationPendingException ex) {
            boolean stored = journalOn
                ? commands.markReconciliationPending(command.id(), ex.providerId(), ex.clientReference(), ex.attemptedAt(),
                    safeMessage(ex), FIRST_LOOK_AFTER, lease)
                : commands.markReconciliationPending(
                command.id(),
                ex.providerId(),
                ex.clientReference(),
                ex.attemptedAt(),
                safeMessage(ex)
            );
            if (!stored) {
                throw transientRetry(
                    command,
                    "Uncertain provider create could not be moved to reconciliation",
                    ex
                );
            }
            return new WorkerReceipt(null, false, "RECONCILIATION_PENDING");
        } catch (DeliveryProviderTemporarilyUnavailableException ex) {
            int providerWaitAttempt = command.providerWaitAttemptCount() + 1;
            Instant retryAt = Instant.now().plus(retryProperties.delay(providerWaitAttempt));
            if (ex.policyDeadline() != null && retryAt.isAfter(ex.policyDeadline())) {
                retryAt = ex.policyDeadline().isAfter(Instant.now())
                    ? ex.policyDeadline() : Instant.now().plusSeconds(1);
            }
            boolean stored = lease != null ? commands.markProviderWait(command.id(), retryAt, safeMessage(ex), !ridersDeciding, lease)
                : ridersDeciding
                ? commands.markProviderWait(command.id(), retryAt, safeMessage(ex), false)
                : commands.markProviderWait(command.id(), retryAt, safeMessage(ex));
            // The count stays put while riders decide, so each such wait needs its own Service Bus message id.
            String waitKey = ridersDeciding ? "fleet-wait-" + command.id() + "-" + retryAt.toEpochMilli()
                : "provider-wait-" + command.id() + "-" + providerWaitAttempt;
            if (!stored) {
                throw new DeliveryCommandTransientException(
                    "Provider wait state could not be persisted",
                    Instant.now().plus(retryProperties.claimContentionDelay()),
                    waitKey.replaceFirst("-wait-", "-wait-store-"),
                    ex
                );
            }
            throw new DeliveryCommandDeferredException(
                safeMessage(ex),
                retryAt,
                waitKey,
                ex
            );
        } catch (DeliveryProviderRouter.NoCapableCourierException ex) {
            // Only with courier capabilities on. An order with no delivery job cannot have a delivery_exception_case, so
            // it ends as the wait cap ends one: a dead letter with its own reason, and a page.
            commands.markDeadLetter(command.id(), DeliveryProviderRouter.NO_CAPABLE_COURIER, lease);
            log.error("CRAVES_ALERT alert=NO_CAPABLE_COURIER commandId={} chefSubOrderId={} orderId={} reason={}",
                command.id(), command.chefSubOrderId(), command.orderId(), safeMessage(ex));
            return new WorkerReceipt(null, false, DeliveryProviderRouter.NO_CAPABLE_COURIER);
        } catch (DeliveryRoutingException ex) {
            handleFailure(command, ex, lease);
            throw transientRetry(command, ex.getMessage(), ex);
        } catch (RuntimeException ex) {
            handleFailure(command, ex, lease);
            throw transientRetry(command, "Delivery command processing failed", ex);
        }
    }

    /**
     * This pass booked a courier, but its lease had lapsed and another pass holds the command, so the booking was not
     * recorded. While its attempt is unresolved the other pass books nobody and the lookup adopts it. If the attempt was
     * already written off (a lookup that ran while the call was out), the booking is kept on it and a person is told.
     */
    private DeliveryCommandTransientException superseded(CommandRecord command, RoutingResult booked) {
        String booking = booked.delivery().providerDeliveryId();
        log.warn("Delivery command pass was superseded after booking commandId={} chefSubOrderId={} provider={} clientRef={} providerRef={}",
            command.id(), command.chefSubOrderId(), booked.providerId(), booked.clientReference(), booking);
        try {
            journal.find(booked.providerId(), booked.clientReference())
                .filter(row -> ProviderCreateAttemptRepository.REJECTED.equals(row.state())
                    || ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state()))
                .filter(row -> journal.foundAt(row, booking))
                .ifPresent(row -> log.error("CRAVES_ALERT alert={} provider={} chefSubOrderId={} providerRef={} orderHasJob={} commandStatus={}",
                    ProviderCreateAttemptRepository.REJECTED.equals(row.state()) ? "COURIER_REJECTED_BOOKING_EXISTS" : "COURIER_ORPHAN_BOOKING_FOUND",
                    row.providerId(), row.chefSubOrderId(), booking, deliveryJobs.findIdByChefSubOrderId(row.chefSubOrderId()).isPresent(),
                    commands.findById(command.id()).map(CommandRecord::status).orElse("NONE")));
        } catch (RuntimeException journalFailure) {
            // The journal's own lookups of the attempt still find the booking.
            log.error("Superseded booking could not be kept on the journal chefSubOrderId={} provider={} providerRef={}",
                command.chefSubOrderId(), booked.providerId(), booking, journalFailure);
        }
        return new DeliveryCommandTransientException("Another pass has taken over this delivery command",
            Instant.now().plus(retryProperties.claimContentionDelay()), "superseded-" + command.id() + "-" + UUID.randomUUID());
    }

    private WorkerReceipt handleUnclaimed(UUID commandId, UUID chefSubOrderId) {
        Optional<CommandRecord> current = commands.findById(commandId);
        if (current.isEmpty()) {
            throw new DeliveryCommandNonRetryableException("Delivery command does not exist in the database");
        }
        CommandRecord command = current.get();
        if ("COMPLETED".equals(command.status())) {
            UUID deliveryJobId = deliveryJobs.findIdByChefSubOrderId(chefSubOrderId)
                .orElseThrow(() -> new DeliveryCommandNonRetryableException(
                    "Completed delivery command has no delivery job"
                ));
            return new WorkerReceipt(deliveryJobId, true, "ALREADY_COMPLETED");
        }
        if ("RECONCILIATION_PENDING".equals(command.status())) {
            // The reconciliation worker sends this message just before it makes the command due. If the message got here
            // first, or that worker died in between, finish the step here: the booking is already resolved without a job,
            // and nothing else would run the command.
            if (journal != null && journal.enabled() && command.reconciliationProviderId() != null
                && journal.find(command.reconciliationProviderId(), command.reconciliationClientReference())
                    .filter(row -> ProviderCreateAttemptRepository.REJECTED.equals(row.state())
                        || ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state())).isPresent()) {
                commands.makeDueFromReconciliation(commandId, command.reconciliationClientReference());
                throw new DeliveryCommandTransientException(
                    "Delivery command was made due after reconciliation",
                    Instant.now().plusSeconds(1),
                    "reconciled-" + commandId + "-" + UUID.randomUUID()
                );
            }
            return new WorkerReceipt(null, true, "RECONCILIATION_PENDING");
        }
        // Another copy of a cancelled order's command (a ready tap or a decline also sends one): done, not a dead letter.
        if ("DEAD_LETTER".equals(command.status()) && commands.orderCancelled(chefSubOrderId)) {
            return new WorkerReceipt(null, true, ORDER_CANCELLED);
        }
        // A message still on its way for a command the sweeper ended at the wait cap: done, and the reason stays on the row.
        if ("DEAD_LETTER".equals(command.status()) && properties.isSweeperEnabled() && commands.endedAtWaitCap(commandId)) {
            return new WorkerReceipt(null, true, DeliveryCommandSweeper.WAIT_CAP);
        }
        // Another message for a command ended because no courier can carry the order: done, and the reason stays on the row.
        if ("DEAD_LETTER".equals(command.status()) && properties.isCourierCapabilitiesEnabled()
            && commands.endedWith(commandId, DeliveryProviderRouter.NO_CAPABLE_COURIER)) {
            return new WorkerReceipt(null, true, DeliveryProviderRouter.NO_CAPABLE_COURIER);
        }
        if ("WAITING_FOR_PROVIDER".equals(command.status())) {
            Instant retryAt = command.nextProviderRetryAt();
            if (retryAt == null) {
                throw new DeliveryCommandNonRetryableException(
                    "Provider wait command has no next retry time"
                );
            }
            throw new DeliveryCommandDeferredException(
                "Delivery provider is temporarily unavailable",
                retryAt,
                // The queue drops a repeated message id for 10 minutes. A command that is already due (made due after
                // reconciliation, or a message a moment ahead of the database clock) must not be put back under an id
                // its earlier wait used.
                journal != null && journal.enabled() && !retryAt.isAfter(Instant.now())
                    ? "provider-due-" + command.id() + "-" + UUID.randomUUID()
                    : "provider-wait-" + command.id() + "-" + command.providerWaitAttemptCount()
            );
        }
        // With the journal on, a pass in its last attempt is left to finish: its completion is refused once the command is
        // no longer its own. After its lease the command is given up as before.
        boolean lastPassRunning = journal != null && journal.enabled() && "PROCESSING".equals(command.status())
            && command.processingStartedAt() != null && command.processingStartedAt().isAfter(
                Instant.now().minus(Duration.ofMinutes(ProviderCreateAttemptRepository.COMMAND_LEASE_MINUTES)));
        if ("DEAD_LETTER".equals(command.status())
            || (command.attemptCount() >= properties.getMaxDeliveryAttempts() && !lastPassRunning)) {
            commands.markDeadLetter(commandId, "Delivery command attempt limit exhausted");
            throw new DeliveryCommandNonRetryableException(
                "Delivery command attempt limit exhausted"
            );
        }
        throw new DeliveryCommandTransientException(
            "Delivery command is currently being processed or is not claimable",
            Instant.now().plus(retryProperties.claimContentionDelay()),
            "claim-contention-" + commandId + "-" + UUID.randomUUID()
        );
    }

    private DeliveryCommandTransientException transientRetry(CommandRecord command,
                                                              String message,
                                                              Throwable cause) {
        Instant retryAt = Instant.now().plus(
            retryProperties.delay(Math.max(1, command.attemptCount()))
        );
        return new DeliveryCommandTransientException(
            message,
            retryAt,
            "delivery-attempt-" + command.id() + "-" + command.attemptCount(),
            cause
        );
    }

    private void handleFailure(CommandRecord command, RuntimeException error, Instant lease) {
        String message = safeMessage(error);
        if (lease != null) {
            if (command.attemptCount() >= properties.getMaxDeliveryAttempts()) {
                commands.markDeadLetter(command.id(), message, lease);
                throw new DeliveryCommandNonRetryableException("Delivery command exhausted its retry budget: " + message, error);
            }
            commands.markFailed(command.id(), message, lease);
            return;
        }
        if (command.attemptCount() >= properties.getMaxDeliveryAttempts()) {
            commands.markDeadLetter(command.id(), message);
            throw new DeliveryCommandNonRetryableException(
                "Delivery command exhausted its retry budget: " + message,
                error
            );
        }
        commands.markFailed(command.id(), message);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    public record WorkerReceipt(UUID deliveryJobId, boolean duplicate, String providerId) {}

    public static class DeliveryCommandTransientException extends RuntimeException {
        private final Instant retryAt;
        private final String retryKey;

        public DeliveryCommandTransientException(String message,
                                                 Instant retryAt,
                                                 String retryKey) {
            super(message);
            this.retryAt = retryAt;
            this.retryKey = retryKey;
        }

        public DeliveryCommandTransientException(String message,
                                                 Instant retryAt,
                                                 String retryKey,
                                                 Throwable cause) {
            super(message, cause);
            this.retryAt = retryAt;
            this.retryKey = retryKey;
        }

        public Instant retryAt() {
            return retryAt;
        }

        public String retryKey() {
            return retryKey;
        }
    }

    public static final class DeliveryCommandDeferredException
        extends DeliveryCommandTransientException {

        public DeliveryCommandDeferredException(String message,
                                                Instant retryAt,
                                                String retryKey) {
            super(message, retryAt, retryKey);
        }

        public DeliveryCommandDeferredException(String message,
                                                Instant retryAt,
                                                String retryKey,
                                                Throwable cause) {
            super(message, retryAt, retryKey, cause);
        }
    }

    public static class DeliveryCommandNonRetryableException extends RuntimeException {
        public DeliveryCommandNonRetryableException(String message) {
            super(message);
        }

        public DeliveryCommandNonRetryableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
