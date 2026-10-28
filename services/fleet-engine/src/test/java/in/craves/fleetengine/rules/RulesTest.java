package in.craves.fleetengine.rules;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.wire.Wire;
import java.util.List;
import java.util.UUID;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Test;

/** The engine's ranking against FleetDispatcher's rules (docs/riders/DISPATCH.md). */
class RulesTest {
    static final long NOW = 1793160000000L; // 28 Oct 2026, 09:30 IST
    static final double KITCHEN_LAT = 17.4483; // a Madhapur kitchen, as in FleetDispatchFixtures
    static final double KITCHEN_LNG = 78.3915;
    static final double METRES_LAT = 1 / 111_194.93; // degrees of latitude per metre on Java's 6,371 km sphere
    static final Wire.Policy NEAREST = new Wire.Policy(5000, 140, 3, 0, 40, true, false);

    static UUID uid(int n) {
        return new UUID(0, n);
    }

    /** A rider who may hear of an order: online, heard from, a fresh real fix, metresNorth of the kitchen. */
    static Rider free(int n, double metresNorth) {
        Rider r = new Rider();
        r.id = uid(n);
        r.lat = KITCHEN_LAT + metresNorth * METRES_LAT;
        r.lng = KITCHEN_LNG;
        r.fixMs = NOW - 5_000;
        r.seenMs = NOW - 3_000;
        r.hasShift = true;
        r.shiftEndsMs = NOW + 3_600_000;
        r.active = true;
        r.testAllowed = true;
        return r;
    }

    static Wire.DispatchRequest order(int mode, Wire.Policy policy, List<UUID> exclude) {
        return new Wire.DispatchRequest(uid(200), mode, null, NOW, 0, KITCHEN_LAT, KITCHEN_LNG, 17.46, 78.36, 4200, policy, exclude,
            List.of(), 1);
    }

    static Wire.DispatchRequest order(int mode, Wire.Policy policy) {
        return order(mode, policy, List.of());
    }

    static Wire.Policy with(Wire.Policy p, int offersAtOnce, int fairBandM, boolean choices) {
        return new Wire.Policy(p.radiusM(), p.detourPercent(), offersAtOnce, fairBandM, p.offerSeconds(), choices, p.joint());
    }

    static int[] ids(List<Rules.Ranked> ranked) {
        return ranked.stream().mapToInt(r -> (int) r.rider.id.getLeastSignificantBits()).toArray();
    }

    static Rider standing(Rider r, long earnedPaise, long onlineSeconds, long waitedMinutes) {
        r.hasStanding = true;
        r.standAtMs = NOW;
        r.istDay = Rules.istDay(NOW);
        r.accruing = true;
        r.earnedPaise = earnedPaise;
        r.onlineSeconds = onlineSeconds;
        r.freeSinceMs = NOW - waitedMinutes * 60_000;
        return r;
    }

    /** DISPATCH.md §3's example: fair band 1.5 km, one rider at a time. */
    @Test
    void fairTurnsFollowTheWorkedExample() {
        List<Rider> riders = List.of(
            standing(free(1, 400), 30_000, 7_200, 5),   // Ravi: ₹150 an hour
            standing(free(2, 900), 12_000, 7_200, 20),  // Salma: ₹60
            standing(free(3, 1600), 4_000, 3_600, 35),  // Arjun: ₹40
            standing(free(4, 2300), 0, 3_600, 50));     // Kiran: ₹0, outside the band
        Wire.Policy fair = with(NEAREST, 1, 1500, true);
        List<Rules.Ranked> got = Rules.rank(order(Wire.LIVE, fair), riders, NOW);
        assertArrayEquals(new int[] {3, 2, 1, 4}, ids(got), "round 1: Arjun, Salma, Ravi, then Kiran");
        assertTrue(got.get(0).inBand);
        assertEquals(4_000, got.get(0).perHourPaise);
        assertFalse(got.get(3).inBand);
        assertArrayEquals(new int[] {2, 1, 4}, ids(Rules.rank(order(Wire.LIVE, fair, List.of(uid(3))), riders, NOW)),
            "round 2: Salma, Ravi, then Kiran");
    }

    @Test
    void nearestFirstWithATieBrokenById() {
        List<Rider> riders = List.of(free(9, 1200), free(5, 300), free(7, 300), free(6, 4990));
        assertArrayEquals(new int[] {5, 7, 9, 6}, ids(Rules.rank(order(Wire.LIVE, NEAREST), riders, NOW)));
    }

    /** Ids order as Postgres orders uuids: by unsigned bytes, so 0x80... comes after 0x7f... */
    @Test
    void idsOrderByUnsignedBytes() {
        Rider low = free(1, 300);
        low.id = UUID.fromString("7fffffff-ffff-ffff-ffff-ffffffffffff");
        Rider high = free(2, 300);
        high.id = UUID.fromString("80000000-0000-0000-0000-000000000000");
        List<Rules.Ranked> got = Rules.rank(order(Wire.LIVE, NEAREST), List.of(high, low), NOW);
        assertEquals(low.id, got.get(0).rider.id);
    }

    /**
     * Java's box takes 111,320 m to a degree of latitude, a little more than its own sphere's 111,195 m, so a rider due north
     * between 99.89% and 100% of the radius is left out, by the engine as by FleetDispatcher.
     */
    @Test
    void theBoundingBoxEdgeIsFleetDispatchers() {
        assertTrue(Rules.rank(order(Wire.LIVE, NEAREST), List.of(free(6, 4999)), NOW).isEmpty());
        Rider east = free(6, 0);
        east.lng = KITCHEN_LNG + 4990 / (111_194.93 * 0.95398); // about 4.99 km due east, inside the box
        assertEquals(1, Rules.rank(order(Wire.LIVE, NEAREST), List.of(east), NOW).size());
    }

    record Case(String name, int mode, UnaryOperator<Rider> change, boolean hears) {
    }

    static Rider home(Rider r, double lat, double lng) {
        r.hasHome = true;
        r.homeLat = lat;
        r.homeLng = lng;
        r.headingHomeUntilMs = NOW + 600_000;
        return r;
    }

    @Test
    void whoMayHearOfAnOrder() {
        UUID other = uid(201);
        List<Case> cases = List.of(
            new Case("free", Wire.LIVE, r -> r, true),
            new Case("not active", Wire.LIVE, r -> { r.active = false; return r; }, false),
            new Case("no shift", Wire.LIVE, r -> { r.hasShift = false; return r; }, false),
            new Case("shift credential ended", Wire.LIVE, r -> { r.shiftEndsMs = NOW; return r; }, false),
            new Case("on a break", Wire.LIVE, r -> { r.breakUntilMs = NOW + 1; return r; }, false),
            new Case("a break that ended", Wire.LIVE, r -> { r.breakUntilMs = NOW; return r; }, true),
            new Case("on a trip", Wire.LIVE, r -> { r.onTrip = true; return r; }, false),
            new Case("an open offer", Wire.LIVE, r -> { r.offeredUntilMs = NOW + 1; r.offeredFromMs = NOW + 1; return r; }, false),
            new Case("an offer that ran out", Wire.LIVE, r -> { r.offeredUntilMs = NOW; return r; }, true),
            new Case("shadow: an offer made after the request", Wire.SHADOW,
                r -> { r.offeredUntilMs = NOW + 40_000; r.offeredFromMs = NOW; return r; }, true),
            new Case("shadow: an offer made before it", Wire.SHADOW,
                r -> { r.offeredUntilMs = NOW + 40_000; r.offeredFromMs = NOW - 1; return r; }, false),
            new Case("held for another order", Wire.LIVE, r -> { r.holdUntilMs = NOW + 5_000; r.holdBy = other; return r; }, false),
            new Case("held for this order", Wire.LIVE, r -> { r.holdUntilMs = NOW + 5_000; r.holdBy = uid(200); return r; }, true),
            new Case("shadow ignores holds", Wire.SHADOW, r -> { r.holdUntilMs = NOW + 5_000; r.holdBy = other; return r; }, true),
            new Case("not allowed by test mode", Wire.LIVE, r -> { r.testAllowed = false; return r; }, false),
            new Case("a phone that can't ring", Wire.LIVE, r -> { r.cannotRing = true; return r; }, false),
            new Case("silent 45 s", Wire.LIVE, r -> { r.seenMs = NOW - 45_000; return r; }, false),
            new Case("silent 44.9 s", Wire.LIVE, r -> { r.seenMs = NOW - 44_900; return r; }, true),
            new Case("a mock fix", Wire.LIVE, r -> { r.fixMock = true; return r; }, false),
            new Case("a fix 3 minutes old", Wire.LIVE, r -> { r.fixMs = NOW - 180_000; return r; }, false),
            new Case("a farthest drop shorter than this one", Wire.LIVE, r -> { r.maxDropM = 4199; return r; }, false),
            new Case("a farthest drop as long", Wire.LIVE, r -> { r.maxDropM = 4200; return r; }, true),
            // 1,000 m straight is 1,400 m as offers show it at a 140% detour.
            new Case("a farthest pickup shorter than the offer shows", Wire.LIVE, r -> { r.maxPickupM = 1399; return r; }, false),
            new Case("a farthest pickup as long", Wire.LIVE, r -> { r.maxPickupM = 1400; return r; }, true),
            new Case("heading home, the drop on the way", Wire.LIVE, r -> home(r, 17.47, 78.35), true),
            new Case("heading home, the drop the other way", Wire.LIVE, r -> home(r, 17.43, 78.42), false),
            new Case("heading home ran out", Wire.LIVE, r -> { home(r, 17.43, 78.42).headingHomeUntilMs = NOW; return r; }, true));
        for (Case c : cases) {
            List<Rules.Ranked> got = Rules.rank(order(c.mode(), NEAREST), List.of(c.change().apply(free(1, 1000))), NOW);
            assertEquals(c.hears(), got.size() == 1, c.name());
        }
        assertTrue(Rules.rank(order(Wire.LIVE, NEAREST, List.of(uid(1))), List.of(free(1, 1000)), NOW).isEmpty(),
            "a rider already offered this order heard of it again");
        assertTrue(Rules.rank(order(Wire.LIVE, NEAREST), List.of(free(1, 5001)), NOW).isEmpty(), "past the radius");
        Rider limited = free(1, 1000);
        limited.maxPickupM = 500;
        limited.maxDropM = 1000;
        assertEquals(1, Rules.rank(order(Wire.LIVE, with(NEAREST, 3, 0, false)), List.of(limited), NOW).size(),
            "with rider choices off a rider's limits still counted");
        List<Rules.Ranked> homeward = Rules.rank(order(Wire.LIVE, NEAREST), List.of(home(free(1, 1000), 17.47, 78.35)), NOW);
        assertTrue(homeward.size() == 1 && homeward.get(0).homeNearerM >= 500);
    }

    @Test
    void standingGrowsWhileOnlineAndStartsAgainEachDay() {
        int day = Rules.istDay(NOW);
        Rider r = free(1, 100);
        assertArrayEquals(new long[] {0, 0}, Rules.standing(r, NOW), "no snapshot");
        r.hasStanding = true;
        r.istDay = day;
        r.standAtMs = NOW - 3_600_000;
        r.accruing = true;
        r.earnedPaise = 36_000;
        r.onlineSeconds = 3_600;
        r.freeSinceMs = NOW - 7_200_000;
        r.seenMs = NOW;
        assertEquals(18_000, Rules.standing(r, NOW)[0], "₹360 over 2 hours");
        r.seenMs = NOW - 3_600_000 + 60_000; // the phone went quiet a minute after the snapshot: 4 minutes more count
        assertEquals(36_000L * 3600 / (3_600 + 240), Rules.standing(r, NOW)[0]);
        r.seenMs = NOW;
        r.accruing = false;
        r.breakUntilMs = NOW - 1_800_000; // on a break at the snapshot, back half an hour ago
        assertArrayEquals(new long[] {36_000L * 3600 / (3_600 + 1_800), NOW - 1_800_000}, Rules.standing(r, NOW));
        r.breakUntilMs = NOW + 60_000; // still on it
        assertEquals(36_000L * 3600 / 3_600, Rules.standing(r, NOW)[0]);
        r.breakUntilMs = 0;
        r.accruing = true;
        r.istDay = Rules.istDay(NOW - 86_400_000); // yesterday's snapshot: today starts at ₹0
        assertEquals(0, Rules.standing(r, NOW)[0]);
        r.istDay = day;
        r.onlineSeconds = 0;
        r.earnedPaise = 10_000;
        r.standAtMs = NOW;
        assertEquals(10_000L * 3600 / Rules.MIN_ONLINE_SECONDS, Rules.standing(r, NOW)[0], "at least 30 minutes count");
    }

    @Test
    void istDays() {
        long midnight = 1793125800000L; // 28 Oct 2026 00:00 IST
        assertEquals(20261028, Rules.istDay(midnight));
        assertEquals(20261027, Rules.istDay(midnight - 1));
        assertEquals(midnight, Rules.istMidnight(NOW));
        assertEquals(20240229, Rules.istDay(1709145000000L)); // a leap day
    }
}
