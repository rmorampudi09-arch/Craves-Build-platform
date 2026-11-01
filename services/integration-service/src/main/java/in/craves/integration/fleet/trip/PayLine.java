package in.craves.integration.fleet.trip;

/**
 * One line of a rider's pay (rider-v1 PayLine: label, amountPaise). component names the line for the money phase's
 * rider_earning key fleet-trip-pay/{tripId}/{component}/{revision}: base, drop-km, pickup-km, waiting, cancellation,
 * return-km.
 */
public record PayLine(String component, String label, long amountPaise) {
}
