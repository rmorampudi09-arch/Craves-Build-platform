package in.craves.fleetengine.rules;

import java.util.UUID;

/**
 * What dispatch knows about one rider: FleetDispatcher.nearbyRiders' columns, read from the live state (LiveStore).
 * Times are epoch milliseconds; 0 means none. A plain holder: one is read per rider per batch, so no accessors.
 */
public final class Rider {
    public UUID id;
    public double lat;
    public double lng;
    public long fixMs;
    public boolean fixMock;
    public long seenMs;
    public boolean hasShift;
    public long shiftEndsMs;
    public boolean active;
    public boolean onTrip;
    public long offeredUntilMs;
    public long offeredFromMs;
    public long breakUntilMs;
    /** A break seen running that has since ended. */
    public long lastBreakEndMs;
    public boolean cannotRing;
    public int maxPickupM;
    public int maxDropM;
    public boolean hasHome;
    public double homeLat;
    public double homeLng;
    public long headingHomeUntilMs;
    public boolean testAllowed;
    public long holdUntilMs;
    /** The request holding the rider; null: none. */
    public UUID holdBy;
    public boolean hasStanding;
    public long standAtMs;
    public int istDay;
    public long earnedPaise;
    public long onlineSeconds;
    public boolean accruing;
    public long freeSinceMs;
}
