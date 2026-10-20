package in.craves.integration.fleet.trip;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Published (Spring application event) once when a trip ends with pay: delivered by OTP or photo, failed, or cancelled
 * with pay. The final lines are already stored on the trip. The money phase listens and writes the ledger; dispatch
 * and trip code never do. held means ops checks the trip before the pay is released, for holdReason.
 */
public record FleetTripPayFinalized(UUID tripId, UUID riderId, String rateCardVersion, List<PayLine> lines, boolean held,
                                    String holdReason, Instant finalizedAt) {
}
