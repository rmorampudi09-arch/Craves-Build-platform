package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import java.time.Instant;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The Craves rider stage that runs before Borzo and Pidge (in.craves.integration.fleet.dispatch.FleetDispatcher, a bean
 * only with CRAVES_FLEET_ENABLED). dispatch_policy mode governs it: off and no policy change nothing, shadow only logs,
 * live offers the order to riders for at most the policy's fleet stage seconds.
 */
public interface FleetStage {
    /**
     * Empty: carry on with Borzo and Pidge; any fleet stage for this order is already closed in the database, so a late
     * accept is refused. A delivery job id: a rider accepted and the job exists. While riders are deciding, throws
     * DeliveryProviderTemporarilyUnavailableException whose deadline is the next check.
     *
     * @param courierQuotePaise the live quote of the courier routing would book next, for the cost guard
     * @param borzoNext whether Borzo's timed window comes next (else Pidge)
     */
    Optional<UUID> run(DeliveryCommandMessage command, Supplier<OptionalLong> courierQuotePaise, boolean borzoNext);

    /** The chef marked the food ready; the rider's free wait starts no earlier than this. */
    void chefReady(UUID chefSubOrderId, Instant readyAt);
}
