package in.craves.fleetengine.rules;

import in.craves.fleetengine.geo.Geo;
import in.craves.fleetengine.wire.Wire;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Ranks riders for one order exactly as integration-service's FleetDispatcher does (nearbyRiders, ranked, fair, standings;
 * docs/riders/DISPATCH.md): who may hear of the order, then nearest first, then fair turns within the band. Declines,
 * ratings and history play no part, as Telangana Act 21 of 2026 s.13(3)(b) requires.
 */
public final class Rules {
    /** FleetDispatcher's thresholds. */
    public static final long SEEN_WITHIN_MS = 45_000;
    public static final long FIX_WITHIN_MS = 180_000;
    public static final long FAIR_STEP_PAISE = 1_000;
    public static final long MIN_ONLINE_SECONDS = 1_800;
    public static final long SHIFT_TAIL_MS = 180_000;
    static final long IST_OFFSET_MS = 19_800_000;
    static final long DAY_MS = 86_400_000;

    /** Unsigned byte order of two ids, as Postgres orders uuids. */
    public static final Comparator<UUID> ID_ORDER = (a, b) -> {
        int c = Long.compareUnsigned(a.getMostSignificantBits(), b.getMostSignificantBits());
        return c != 0 ? c : Long.compareUnsigned(a.getLeastSignificantBits(), b.getLeastSignificantBits());
    };

    /** Ranked by: rankM, then straight metres, then id. */
    private static final Comparator<Ranked> NEAREST = Comparator.comparingDouble((Ranked r) -> r.rankM)
        .thenComparingDouble(r -> r.straightM).thenComparing(r -> r.rider.id, ID_ORDER);

    private static final Comparator<Ranked> FAIR = Comparator.comparingLong((Ranked r) -> r.perHourPaise / FAIR_STEP_PAISE)
        .thenComparingLong(r -> r.freeSinceMs);

    private Rules() {
    }

    /**
     * One rider who may hear of the order. rankM is what riders are ranked by: straight metres. homeNearerM: heading home,
     * metres nearer home; null when not heading home.
     */
    public static final class Ranked {
        public final Rider rider;
        public final double straightM;
        public double rankM;
        public final Integer homeNearerM;
        public boolean inBand;
        public long perHourPaise;
        public long freeSinceMs;

        public Ranked(Rider rider, double straightM, Integer homeNearerM) {
            this.rider = rider;
            this.straightM = straightM;
            this.rankM = straightM;
            this.homeNearerM = homeNearerM;
        }
    }

    /**
     * The riders who may hear of the order, in the order they would: nearbyRiders' filters, nearest first, then fair turns
     * within the band. t is the time the rules are applied at: the request's own time for a shadow comparison, now for a
     * live one. Live, riders held for another order are left out; in shadow, offers made at or after the request (most
     * likely the ones Java made for it) don't count.
     */
    public static List<Ranked> rank(Wire.DispatchRequest q, List<Rider> riders, long t) {
        List<Ranked> out = new ArrayList<>();
        boolean live = q.mode() == Wire.LIVE;
        Wire.Policy p = q.policy();
        double[] box = Geo.box(q.kitchenLat(), q.kitchenLng(), p.radiusM());
        boolean choices = p.riderChoices() && q.dropM() >= 0;
        for (Rider r : riders) {
            if (!r.active || !r.hasShift || r.shiftEndsMs <= t || r.breakUntilMs > t || r.onTrip || !r.testAllowed || r.cannotRing) {
                continue;
            }
            if (r.seenMs <= t - SEEN_WITHIN_MS || r.fixMock || r.fixMs <= t - FIX_WITHIN_MS) {
                continue;
            }
            if (r.offeredUntilMs > t && (live || r.offeredFromMs == 0 || r.offeredFromMs < q.atMs())) {
                continue;
            }
            if (live && r.holdUntilMs > t && !q.requestId().equals(r.holdBy)) {
                continue;
            }
            if (q.exclude().contains(r.id)) {
                continue;
            }
            if (r.lat < box[0] || r.lat > box[2] || r.lng < box[1] || r.lng > box[3]) {
                continue;
            }
            if (choices && r.maxDropM != 0 && r.maxDropM < q.dropM()) {
                continue;
            }
            double metres = Geo.straightLineMetres(q.kitchenLat(), q.kitchenLng(), r.lat, r.lng);
            if (choices && r.maxPickupM != 0 && Geo.pickupDistanceM(metres, p.detourPercent()) > r.maxPickupM) {
                continue;
            }
            Integer nearer = null;
            if (choices && r.headingHomeUntilMs > t && r.hasHome) {
                nearer = Geo.homeNearerM(r.lat, r.lng, q.kitchenLat(), q.kitchenLng(), q.dropLat(), q.dropLng(), r.homeLat, r.homeLng);
                if (nearer == null) {
                    continue;
                }
            }
            if (metres > p.radiusM()) {
                continue;
            }
            out.add(new Ranked(r, metres, nearer));
        }
        out.sort(NEAREST);
        if (p.fairBandM() > 0 && !out.isEmpty()) {
            double limit = out.get(0).rankM + p.fairBandM();
            int n = 0;
            while (n < out.size() && out.get(n).rankM <= limit) {
                Ranked r = out.get(n);
                r.inBand = true;
                long[] standing = standing(r.rider, t);
                r.perHourPaise = standing[0];
                r.freeSinceMs = standing[1];
                n++;
            }
            out.subList(0, n).sort(FAIR);
        }
        return out;
    }

    /**
     * {pay per available online hour today, free since} for the rider at time t (FleetDispatcher.standings,
     * FleetEarnings.perOnlineHourPaise). It starts from the last snapshot integration-service read and grows the online
     * time since then while the shift is open and no break runs, up to 3 minutes after the phone's last call and the
     * shift credential's end. A break that has ended since counts from its end, for both the online time and the time
     * free. A rider with no snapshot yet counts as ₹0 an hour and free since the start (Java's Instant.EPOCH when nothing
     * is known), so they go first.
     */
    public static long[] standing(Rider r, long t) {
        if (!r.hasStanding) {
            return new long[] {0, 0};
        }
        long earned = r.earnedPaise;
        long online = r.onlineSeconds;
        long freeSince = r.freeSinceMs;
        long breakEnd = r.lastBreakEndMs;
        if (r.breakUntilMs > 0 && r.breakUntilMs <= t && r.breakUntilMs > breakEnd) {
            breakEnd = r.breakUntilMs;
        }
        if (breakEnd > freeSince && breakEnd <= t) {
            freeSince = breakEnd;
        }
        long from = r.standAtMs;
        boolean accruing = r.accruing;
        if (!accruing && breakEnd > r.standAtMs && breakEnd <= t) {
            from = breakEnd;
            accruing = true;
        }
        if (!r.hasShift || r.breakUntilMs > t) {
            accruing = false;
        }
        if (istDay(t) != r.istDay) {
            earned = 0;
            online = 0;
            from = Math.max(from, istMidnight(t));
        }
        if (accruing) {
            long end = Math.min(Math.min(t, r.seenMs + SHIFT_TAIL_MS), r.shiftEndsMs);
            if (end > from) {
                online += (end - from) / 1000;
            }
        }
        online = Math.max(online, MIN_ONLINE_SECONDS);
        return new long[] {earned * 3600 / online, freeSince};
    }

    /** The yyyymmdd of t in India (UTC+5:30, no daylight saving). */
    public static int istDay(long t) {
        java.time.LocalDate d = java.time.LocalDate.ofEpochDay(Math.floorDiv(t + IST_OFFSET_MS, DAY_MS));
        return d.getYear() * 10_000 + d.getMonthValue() * 100 + d.getDayOfMonth();
    }

    /** The start of t's IST day, in epoch milliseconds. */
    public static long istMidnight(long t) {
        return Math.floorDiv(t + IST_OFFSET_MS, DAY_MS) * DAY_MS - IST_OFFSET_MS;
    }
}
