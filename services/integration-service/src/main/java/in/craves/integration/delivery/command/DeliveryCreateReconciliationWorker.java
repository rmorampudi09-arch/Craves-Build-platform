package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateDefinitivelyNotFoundException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationStatus;
import in.craves.integration.delivery.status.DeliveryLeaseRecoveryRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "craves.delivery-command",
    name = "reconciliation-enabled",
    havingValue = "true"
)
public class DeliveryCreateReconciliationWorker {
    private static final Logger log = LoggerFactory.getLogger(
        DeliveryCreateReconciliationWorker.class
    );
    private static final long MAX_RETRY_DELAY_SECONDS = 3600;
    // The booking journal's clock. A lost answer is looked for 4 times (the first 20 s after the call, then 15, 30 and 60 s
    // apart, about 2 minutes) before the order may move on without it.
    static final int LOOKS_BEFORE_ORPHAN = 4;
    private static final Duration LOOK_AGAIN_BASE = Duration.ofSeconds(15);
    private static final Duration ORPHAN_FIRST_CHECK = Duration.ofSeconds(60);
    /** One more look after a "not found", in case the courier's list missed the booking. */
    private static final Duration NOT_FOUND_RECHECK = Duration.ofMinutes(5);
    // As ProviderCreateAttemptRepository.claimDueChecks schedules them.
    private static final Duration ORPHAN_RECHECK_FOR = Duration.ofHours(2);
    private static final Duration REFUSAL_RECHECK_FOR = Duration.ofMinutes(15);
    private static final Duration COME_BACK = Duration.ofSeconds(15);
    /** A few a tick, after the commands: a slow courier must not hold up other orders' looks. */
    private static final int CHECKS_PER_TICK = 5;
    private static final Set<String> UNRESOLVED = Set.of(ProviderCreateAttemptRepository.INTENT, ProviderCreateAttemptRepository.UNKNOWN);

    private final DeliveryCommandRepository commands;
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryProviderRouter router;
    private final DeliveryCommandCompletionService completionService;
    private final DeliveryLeaseRecoveryRepository leaseRecovery;
    private final DeliveryCommandProperties properties;
    private ProviderCreateAttemptRepository journal;
    private DeliveryServiceBusPublisher publisher;

    /** The booking journal (V191); used only while CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED is on. */
    @Autowired(required = false)
    public void setJournal(ProviderCreateAttemptRepository journal) {
        this.journal = journal;
    }

    private CourierStrayBookings strayBookings;

    /** Adopts or cancels a booking the journal found that is not the order's job; reached only with the journal on. */
    @Autowired(required = false)
    public void setStrayBookings(CourierStrayBookings strayBookings) {
        this.strayBookings = strayBookings;
    }

    private DeliveryCommandSweeper sweeper;

    /** Re-sends due commands nobody is working on; does nothing unless CRAVES_DELIVERY_COMMAND_SWEEPER_ENABLED is on. */
    @Autowired(required = false)
    public void setSweeper(DeliveryCommandSweeper sweeper) {
        this.sweeper = sweeper;
    }

    /** Sends the message that runs a command made due here; a bean only while delivery commands are enabled. */
    @Autowired(required = false)
    public void setPublisher(DeliveryServiceBusPublisher publisher) {
        this.publisher = publisher;
    }

    public DeliveryCreateReconciliationWorker(
        DeliveryCommandRepository commands,
        DeliveryJobRepository deliveryJobs,
        DeliveryProviderRouter router,
        DeliveryCommandCompletionService completionService,
        DeliveryLeaseRecoveryRepository leaseRecovery,
        DeliveryCommandProperties properties
    ) {
        this.commands = commands;
        this.deliveryJobs = deliveryJobs;
        this.router = router;
        this.completionService = completionService;
        this.leaseRecovery = leaseRecovery;
        this.properties = properties;
    }

    @Scheduled(scheduler = in.craves.integration.config.WorkerSchedulingConfiguration.DELIVERY_SCHEDULER,
        fixedDelayString = "${craves.delivery-command.reconciliation-interval-ms:15000}"
    )
    public void reconcilePending() {
        try {
            reconcile();
        } finally {
            if (sweeper != null) {
                // Last, so its sends never hold up the lookups. It checks its own flag and never throws.
                sweeper.sweep();
            }
        }
    }

    private void reconcile() {
        int recovered = leaseRecovery.deadLetterExhaustedCreateReconciliationLeases(
            properties.getMaxReconciliationAttempts(),
            properties.getReconciliationStaleMinutes()
        );
        if (recovered > 0) {
            log.error(
                "Dead-lettered {} create-reconciliation rows whose final processing lease expired",
                recovered
            );
        }

        List<CommandRecord> records = commands.claimReconciliationBatch(
            properties.getReconciliationBatchSize(),
            properties.getMaxReconciliationAttempts(),
            properties.getReconciliationStaleMinutes()
        );
        for (CommandRecord command : records) {
            reconcileOne(command);
        }
        if (journal != null && journal.enabled()) {
            try {
                checkJournal();
            } catch (RuntimeException ex) {
                log.error("Courier booking journal checks could not run", ex);
            }
        }
    }

    /** Stray-booking lookups: orphan suspects for 2 hours, and refusals and "not found" answers while they are fresh. */
    private void checkJournal() {
        int abandoned = journal.sweepAbandoned();
        if (abandoned > 0) {
            log.warn("Courier booking journal: {} unresolved attempt(s) nobody was working on are now orphan suspects", abandoned);
        }
        for (Attempt row : journal.claimDueChecks(CHECKS_PER_TICK)) {
            try {
                check(row);
            } catch (RuntimeException ex) {
                // One row's failure must not drop the rest of the batch, whose next look the claim has already moved on.
                log.error("Courier booking journal: lookup failed chefSubOrderId={} provider={} clientRef={} state={}", row.chefSubOrderId(),
                    row.providerId(), row.clientRef(), row.state(), ex);
            }
        }
    }

    private void check(Attempt row) {
        boolean orphan = ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state());
        if (orphan && row.providerRef() != null && strayBookings != null) {
            // The booking exists and is not the order's job: adopted or cancelled, not looked up again.
            if (!strayBookings.resolve(row) && row.updatedAt().isBefore(Instant.now().minus(ORPHAN_RECHECK_FOR))) {
                log.error("CRAVES_ALERT alert=COURIER_UNRESOLVED_BOOKING provider={} chefSubOrderId={} clientRef={} state={} reason=stray-"
                    + "booking-not-settled providerRef={}", row.providerId(), row.chefSubOrderId(), row.clientRef(), row.state(), row.providerRef());
            }
            return;
        }
        CreateReconciliationResult result = router.lookup(row.providerId(), row.clientRef(), row.createdAt());
        if (result.status() == CreateReconciliationStatus.FOUND) {
            String booking = result.delivery().providerDeliveryId();
            // Read before the row is marked, so the alert cannot be lost between the two.
            String orderHasJob = describe(() -> String.valueOf(deliveryJobs.findIdByChefSubOrderId(row.chefSubOrderId()).isPresent()));
            String commandStatus = describe(() -> commands.findByChefSubOrderId(row.chefSubOrderId()).map(CommandRecord::status).orElse("NONE"));
            if (journal.foundAt(row, booking)) {
                // A person cancels it with the courier, unless the order has no job and its command is dead: then it is the
                // order's only courier.
                log.error("CRAVES_ALERT alert={} provider={} chefSubOrderId={} providerRef={} orderHasJob={} commandStatus={}",
                    orphan ? "COURIER_ORPHAN_BOOKING_FOUND" : "COURIER_REJECTED_BOOKING_EXISTS", row.providerId(), row.chefSubOrderId(),
                    booking, orderHasJob, commandStatus);
            }
        } else if (result.status() == CreateReconciliationStatus.NOT_FOUND) {
            if (orphan) {
                // Looked for again while the refusal is fresh, as after any "not found": a courier's list can lag.
                boolean moved = journal.move(row, Set.of(ProviderCreateAttemptRepository.ORPHAN_SUSPECT), ProviderCreateAttemptRepository.REJECTED,
                    result.detail(), Instant.now().plus(NOT_FOUND_RECHECK));
                log.info("Courier booking journal: orphan suspect not found at the courier chefSubOrderId={} provider={} clientRef={} "
                    + "rejected={}", row.chefSubOrderId(), row.providerId(), row.clientRef(), moved);
            } else {
                journal.checkAgain(row, null);
            }
        } else if (row.updatedAt().isBefore(Instant.now().minus(orphan ? ORPHAN_RECHECK_FOR : REFUSAL_RECHECK_FOR))) {
            // The claim scheduled no further look for a row this old: its last one has just failed.
            log.error("CRAVES_ALERT alert=COURIER_UNRESOLVED_BOOKING provider={} chefSubOrderId={} clientRef={} state={} reason=last-lookup-"
                + "inconclusive detail={}", row.providerId(), row.chefSubOrderId(), row.clientRef(), row.state(), result.detail());
        }
    }

    private static String describe(java.util.function.Supplier<String> read) {
        try {
            return read.get();
        } catch (RuntimeException ex) {
            return "unknown";
        }
    }

    /**
     * The journalled path. False when the command has no journal row to work from (it predates the flag), so the caller
     * runs the path below unchanged.
     */
    private boolean reconcileJournalled(CommandRecord command) {
        if (journal == null || !journal.enabled() || command.reconciliationProviderId() == null) {
            return false;
        }
        Attempt row = journal.find(command.reconciliationProviderId(), command.reconciliationClientReference()).orElse(null);
        if (row == null) {
            return false;
        }
        if (UNRESOLVED.contains(row.state())) {
            // INTENT here means the pass that made the call died before recording any answer.
            journal.move(row, Set.of(ProviderCreateAttemptRepository.INTENT), ProviderCreateAttemptRepository.UNKNOWN,
                "No answer was recorded for this booking call", null);
            RoutingResult found;
            try {
                found = router.reconcile(command);
            } catch (DeliveryCreateDefinitivelyNotFoundException notFound) {
                if (!journal.move(row, UNRESOLVED, ProviderCreateAttemptRepository.REJECTED, safeMessage(notFound),
                    Instant.now().plus(NOT_FOUND_RECHECK))) {
                    commands.deferReconciliation(command.id(), Instant.now().plus(COME_BACK), command.reconciliationAttemptCount());
                    return true;
                }
                makeDue(command, "the courier has no such booking");
                return true;
            } catch (DeliveryCreateReconciliationPendingException inconclusive) {
                int look = command.reconciliationAttemptCount();
                if (look < Math.min(LOOKS_BEFORE_ORPHAN, properties.getMaxReconciliationAttempts())) {
                    commands.scheduleReconciliationRetry(command.id(), look, properties.getMaxReconciliationAttempts(),
                        Instant.now().plus(LOOK_AGAIN_BASE.multipliedBy(1L << (look - 1))), safeMessage(inconclusive));
                    return true;
                }
                if (!router.anotherCourierBookable(command.chefSubOrderId(), row.providerId())) {
                    // This booking is the order's only chance: keep looking as before, so a late confirmation is adopted.
                    retry(command, safeMessage(inconclusive));
                    return true;
                }
                if (!journal.move(row, UNRESOLVED, ProviderCreateAttemptRepository.ORPHAN_SUSPECT, safeMessage(inconclusive),
                    Instant.now().plus(ORPHAN_FIRST_CHECK))) {
                    commands.deferReconciliation(command.id(), Instant.now().plus(COME_BACK), command.reconciliationAttemptCount());
                    return true;
                }
                makeDue(command, "the booking could not be confirmed either way");
                return true;
            }
            // Found. An exception from here on goes to the caller's retry: a booking that exists is never given up as an orphan.
            var receipt = completionService.complete(command.message(), found);
            log.info("Delivery create reconciliation adopted the booking commandId={} chefSubOrderId={} providerId={} deliveryJobId={}",
                command.id(), command.chefSubOrderId(), found.providerId(), receipt.deliveryJobId());
            return true;
        }
        if (ProviderCreateAttemptRepository.REJECTED.equals(row.state()) || ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state())) {
            // Resolved on an earlier tick whose message could not be sent.
            makeDue(command, "resolved earlier");
            return true;
        }
        return false;
    }

    /**
     * Runs the command again for the next courier. The message goes first, with a fresh id (the queue drops a repeated id
     * for 10 minutes); if it is processed before the update below, DeliveryCommandWorker sends it back rather than drop it.
     */
    private void makeDue(CommandRecord command, String why) {
        try {
            if (publisher == null) {
                // Only when delivery commands are switched off while this worker runs: nothing would process the message.
                // The command is still made due, so DELIVERY_COMMAND_STALLED shows it.
                throw new IllegalStateException("No Service Bus publisher is configured");
            }
            publisher.publishNow(command.message(), "reconciled:" + command.id() + ":" + UUID.randomUUID());
        } catch (RuntimeException ex) {
            // Tried again every 15 seconds, without asking the courier again, for as long as the message cannot be sent.
            log.error("CRAVES_ALERT alert=DELIVERY_COMMAND_STALLED commandId={} chefSubOrderId={} reason=the message that runs it after "
                + "reconciliation could not be sent: {}", command.id(), command.chefSubOrderId(), safeMessage(ex));
            if (publisher != null) {
                commands.deferReconciliation(command.id(), Instant.now().plus(COME_BACK), command.reconciliationAttemptCount());
                return;
            }
        }
        boolean due = commands.makeDueFromReconciliation(command.id(), command.reconciliationClientReference());
        log.info("Delivery create reconciliation moves the order on commandId={} chefSubOrderId={} providerId={} reason={} due={}",
            command.id(), command.chefSubOrderId(), command.reconciliationProviderId(), why, due);
    }

    private void reconcileOne(CommandRecord command) {
        try {
            if (deliveryJobs.findIdByChefSubOrderId(
                command.chefSubOrderId()
            ).isPresent()) {
                commands.markCompleted(command.id());
                log.info(
                    "Delivery create reconciliation found an existing local job commandId={} chefSubOrderId={}",
                    command.id(),
                    command.chefSubOrderId()
                );
                return;
            }

            if (reconcileJournalled(command)) {
                return;
            }
            RoutingResult result = router.reconcile(command);
            var receipt = completionService.complete(command.message(), result);
            log.info(
                "Delivery create reconciliation completed commandId={} chefSubOrderId={} providerId={} deliveryJobId={} duplicate={}",
                command.id(),
                command.chefSubOrderId(),
                result.providerId(),
                receipt.deliveryJobId(),
                receipt.duplicate()
            );
        } catch (DeliveryCreateReconciliationPendingException ex) {
            retry(command, safeMessage(ex));
        } catch (RuntimeException ex) {
            retry(
                command,
                "Delivery create reconciliation failed: " + safeMessage(ex)
            );
            log.error(
                "Delivery create reconciliation failed commandId={} chefSubOrderId={}",
                command.id(),
                command.chefSubOrderId(),
                ex
            );
        }
    }

    private void retry(CommandRecord command,
                       String error) {
        int attempt = command.reconciliationAttemptCount();
        Instant nextAttemptAt = Instant.now().plusSeconds(
            retryDelaySeconds(attempt)
        );
        commands.scheduleReconciliationRetry(
            command.id(),
            attempt,
            properties.getMaxReconciliationAttempts(),
            nextAttemptAt,
            error
        );
        log.warn(
            "Delivery create reconciliation remains pending commandId={} chefSubOrderId={} providerId={} attempt={} nextAttemptAt={} error={}",
            command.id(),
            command.chefSubOrderId(),
            command.reconciliationProviderId(),
            attempt,
            nextAttemptAt,
            error
        );
    }

    private long retryDelaySeconds(int attempt) {
        long base = properties.getReconciliationRetryBaseSeconds();
        int exponent = Math.max(0, Math.min(attempt - 1, 20));
        long multiplier = 1L << exponent;
        if (base > MAX_RETRY_DELAY_SECONDS / multiplier) {
            return MAX_RETRY_DELAY_SECONDS;
        }
        return Math.min(MAX_RETRY_DELAY_SECONDS, base * multiplier);
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
