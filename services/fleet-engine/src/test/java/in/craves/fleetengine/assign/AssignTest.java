package in.craves.fleetengine.assign;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.rules.Rider;
import in.craves.fleetengine.rules.Rules;
import in.craves.fleetengine.wire.Wire;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Sharing riders among the orders ranked together (docs/riders/SCALE.md, "Matching"). */
class AssignTest {
    static Rider rider(int n) {
        Rider r = new Rider();
        r.id = new UUID(0, n);
        return r;
    }

    static Rules.Ranked near(Rider r, double metres) {
        return new Rules.Ranked(r, metres, null);
    }

    static Rules.Ranked band(Rider r, double metres, long perHourPaise, long freeSinceMs) {
        Rules.Ranked x = new Rules.Ranked(r, metres, null);
        x.inBand = true;
        x.perHourPaise = perHourPaise;
        x.freeSinceMs = freeSinceMs;
        return x;
    }

    static int[] picked(Assign.Order o, int[] idx) {
        int[] out = new int[idx.length];
        for (int i = 0; i < idx.length; i++) {
            out[i] = (int) o.ranked().get(idx[i]).rider.id.getLeastSignificantBits();
        }
        return out;
    }

    @Test
    void oneOrderGetsItsFirstRiders() {
        Rider a = rider(1);
        Rider b = rider(2);
        Rider c = rider(3);
        List<Assign.Order> o = List.of(new Assign.Order(2, List.of(near(a, 100), near(b, 200), near(c, 300))));
        for (Assign.Result res : List.of(Assign.firstCome(o), Assign.joint(o, 1_000_000_000L))) {
            assertArrayEquals(new int[] {1, 2}, picked(o.get(0), res.chosen()[0]));
            assertEquals(Wire.SOLVER_SINGLE, res.solver());
        }
    }

    /** Two orders at once and one rider near both: first come leaves the second with nobody; shared out, each gets a rider. */
    @Test
    void sharedOutEveryOrderGetsARiderBeforeAnyGetsTwo() {
        Rider r1 = rider(1);
        Rider r2 = rider(2);
        List<Assign.Order> orders = List.of(
            new Assign.Order(1, List.of(near(r1, 100), near(r2, 300))), // order A
            new Assign.Order(1, List.of(near(r1, 200))));               // order B: only r1 can reach it
        Assign.Result first = Assign.firstCome(orders);
        assertEquals(1, first.chosen()[0].length);
        assertEquals(0, first.chosen()[1].length);
        Assign.Result joint = Assign.joint(orders, 1_000_000_000L);
        assertArrayEquals(new int[] {2}, picked(orders.get(0), joint.chosen()[0]));
        assertArrayEquals(new int[] {1}, picked(orders.get(1), joint.chosen()[1]));

        Rider r3 = rider(3); // three at once each, three riders near both: each order gets at least one
        List<Assign.Order> both = List.of(
            new Assign.Order(3, List.of(near(r1, 100), near(r2, 110), near(r3, 120))),
            new Assign.Order(3, List.of(near(r1, 400), near(r2, 410), near(r3, 420))));
        Assign.Result res = Assign.joint(both, 1_000_000_000L);
        assertTrue(res.chosen()[0].length > 0 && res.chosen()[1].length > 0);
        assertEquals(3, res.chosen()[0].length + res.chosen()[1].length);
    }

    /** Fair turns shared out: the riders who have earned least go first, and the orders between them still get one each. */
    @Test
    void fairTurnsSharedOutKeepTheLowestEarnersFirst() {
        Rider low = rider(1);
        Rider mid = rider(2);
        Rider high = rider(3);
        List<Assign.Order> orders = List.of(
            new Assign.Order(1, List.of(band(low, 900, 0, 10), band(mid, 300, 6_000, 20), band(high, 100, 15_000, 30))),
            new Assign.Order(1, List.of(band(low, 500, 0, 10), band(high, 400, 15_000, 30))));
        Assign.Result res = Assign.joint(orders, 1_000_000_000L);
        // low (₹0) and mid (₹60) are the two lowest earners; mid can only take A, so low takes B.
        assertArrayEquals(new int[] {2}, picked(orders.get(0), res.chosen()[0]));
        assertArrayEquals(new int[] {1}, picked(orders.get(1), res.chosen()[1]));
    }

    /** Among the band riders chosen, who goes where is the shortest total ride to the kitchens. */
    @Test
    void chosenRidersAreSeatedForTheShortestRides() {
        Rider r1 = rider(1);
        Rider r2 = rider(2);
        List<Assign.Order> orders = List.of(
            new Assign.Order(1, List.of(band(r1, 3000, 0, 0), band(r2, 200, 0, 5))),
            new Assign.Order(1, List.of(band(r1, 150, 0, 0), band(r2, 2500, 0, 5))));
        Assign.Result res = Assign.joint(orders, 1_000_000_000L);
        assertArrayEquals(new int[] {2}, picked(orders.get(0), res.chosen()[0]));
        assertArrayEquals(new int[] {1}, picked(orders.get(1), res.chosen()[1]));
    }

    @Test
    void overTheLimitTheyAreSharedOutGreedily() {
        Rider r1 = rider(1);
        Rider r2 = rider(2);
        List<Assign.Order> orders = List.of(new Assign.Order(1, List.of(near(r1, 100), near(r2, 300))),
            new Assign.Order(1, List.of(near(r1, 200))));
        Assign.Result res = Assign.joint(orders, 1);
        assertEquals(Wire.SOLVER_GREEDY, res.solver());
        assertEquals(2, res.chosen()[0].length + res.chosen()[1].length);
        // With fair bands the augmenting paths count too: 2 slots² × (2 riders + 2 slots) = 16 fits a limit of 20, but with
        // 2 orders × 2 riders² = 8 more (24) it does not.
        List<Assign.Order> banded = List.of(new Assign.Order(1, List.of(band(r1, 100, 0, 0), band(r2, 300, 0, 0))),
            new Assign.Order(1, List.of(band(r1, 200, 0, 0))));
        assertEquals(Wire.SOLVER_GREEDY, Assign.joint(banded, 20).solver());
        assertEquals(Wire.SOLVER_EXACT, Assign.joint(banded, 24).solver());
    }

    /** Riders past those the travel-time model ranked (rankM +Infinity) come last and never overflow the costs. */
    @Test
    void ridersPastTheModelsRankedComeLast() {
        Rider ranked = rider(1);
        Rider unranked = rider(2);
        Rules.Ranked far = near(unranked, 100);
        far.rankM = Double.POSITIVE_INFINITY;
        Rules.Ranked minutes = near(ranked, 900);
        minutes.rankM = 3 * 1000.0 / 3;
        List<Assign.Order> orders = List.of(new Assign.Order(1, List.of(minutes, far)), new Assign.Order(1, List.of(near(ranked, 50))));
        Assign.Result res = Assign.joint(orders, 1_000_000_000L);
        assertArrayEquals(new int[] {2}, picked(orders.get(0), res.chosen()[0]));
        assertArrayEquals(new int[] {1}, picked(orders.get(1), res.chosen()[1]));
        assertTrue(Assign.cm(far) > Assign.cm(minutes) && Assign.cm(far) < Assign.OUTSIDE_BAND_CM);
    }

    /**
     * Random blocks: nobody is chosen twice, no order goes over its capacity, shared out serves at least as many orders as first
     * come, and the exact answer seats at least as many riders as the greedy one for nearest-first.
     */
    @Test
    void randomBlocksKeepTheInvariants() {
        Random rnd = new Random(28);
        for (int trial = 0; trial < 400; trial++) {
            Rider[] riders = new Rider[2 + rnd.nextInt(25)];
            for (int i = 0; i < riders.length; i++) {
                riders[i] = rider(trial * 256 + i);
            }
            boolean fair = trial % 2 == 0;
            List<Assign.Order> orders = new ArrayList<>();
            for (int o = 0, n = 1 + rnd.nextInt(8); o < n; o++) {
                List<Integer> perm = new ArrayList<>();
                for (int i = 0; i < riders.length; i++) {
                    perm.add(i);
                }
                Collections.shuffle(perm, rnd);
                List<Rules.Ranked> ranked = new ArrayList<>();
                for (int i : perm.subList(0, rnd.nextInt(riders.length))) {
                    double m = rnd.nextInt(5000);
                    ranked.add(fair && rnd.nextInt(3) > 0 ? band(riders[i], m, (i % 5) * 1000L, i) : near(riders[i], m));
                }
                orders.add(new Assign.Order(1 + rnd.nextInt(3), ranked));
            }
            int servedFirst = check(trial, orders, Assign.firstCome(orders))[1];
            int[] exact = check(trial, orders, Assign.joint(orders, 1_000_000_000_000L));
            int seatedGreedy = check(trial, orders, Assign.joint(orders, 0))[0];
            assertTrue(exact[1] >= servedFirst, "trial " + trial + ": shared out served fewer orders than first come");
            if (!fair && orders.size() > 1) {
                assertTrue(exact[0] >= seatedGreedy, "trial " + trial + ": exact seated fewer riders than greedy");
            }
        }
    }

    /** {riders seated, orders served}; fails on a rider chosen twice or an order over capacity. */
    static int[] check(int trial, List<Assign.Order> orders, Assign.Result res) {
        Set<UUID> seen = new HashSet<>();
        int seated = 0;
        int served = 0;
        for (int o = 0; o < orders.size(); o++) {
            int[] idx = res.chosen()[o];
            assertTrue(idx.length <= orders.get(o).capacity(), "trial " + trial + ": order " + o + " over capacity");
            served += idx.length > 0 ? 1 : 0;
            for (int i : idx) {
                assertTrue(seen.add(orders.get(o).ranked().get(i).rider.id), "trial " + trial + ": a rider chosen twice");
                seated++;
            }
        }
        return new int[] {seated, served};
    }
}
