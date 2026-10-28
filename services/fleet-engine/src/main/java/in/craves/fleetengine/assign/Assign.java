package in.craves.fleetengine.assign;

import in.craves.fleetengine.rules.Rules;
import in.craves.fleetengine.wire.Wire;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Shares riders among the orders ranked together in one block. Each rider hears of at most one order at a time (Postgres
 * keeps one ACTIVE offer per rider; this keeps the engine from proposing one rider twice) and each order gets at most its
 * offers-at-once. Shared out jointly (the min-cost matching delivery platforms run over a batch of orders), every order
 * first gets one rider before any gets a second, then fair turns pick riders by pay per hour within each order's band and
 * the rest go by fewest metres (or fewest minutes, with the travel-time model); first come, each order in arrival order
 * takes its first riders still free, as the Java dispatcher does today.
 */
public final class Assign {
    static final long INF_COST = 1L << 60;
    /** An order's first rider counts above anything else. */
    static final long FIRST_BONUS = 1L << 50;
    /** Then each rider more, above any distance. */
    static final long SLOT_BONUS = 1L << 40;
    /** A rider outside an order's band sits there only when nothing else fits. */
    static final long OUTSIDE_BAND_CM = 1L << 32;
    /** Riders past those the travel-time model ranked (rankM +Infinity) cost this plus their straight centimetres. */
    static final long UNRANKED_CM = 1L << 31;

    private Assign() {
    }

    /** One request's ranked riders and how many hear of it at once. */
    public record Order(int capacity, List<Rules.Ranked> ranked) {
    }

    /** For each order, the indexes into its ranked of the riders chosen for it alone, ascending; and the solver used. */
    public record Result(int[][] chosen, int solver) {
    }

    /** Each order, in the order given, takes its first riders not taken by an earlier one. */
    public static Result firstCome(List<Order> orders) {
        Set<UUID> taken = new HashSet<>();
        int[][] chosen = new int[orders.size()][];
        for (int o = 0; o < orders.size(); o++) {
            Order ord = orders.get(o);
            int[] picked = new int[Math.min(ord.capacity(), ord.ranked().size())];
            int n = 0;
            for (int i = 0; i < ord.ranked().size() && n < ord.capacity(); i++) {
                if (taken.add(ord.ranked().get(i).rider.id)) {
                    picked[n++] = i;
                }
            }
            chosen[o] = Arrays.copyOf(picked, n);
        }
        return new Result(chosen, orders.size() > 1 ? Wire.SOLVER_GREEDY : Wire.SOLVER_SINGLE);
    }

    /**
     * Shares the riders out together. Problems bigger than exactLimit (the matching's cost: slots² × (riders + slots), plus
     * orders × riders² for the augmenting paths when there are fair bands) are shared out greedily instead: the engine's
     * answer to load, never slower than the orders arrive.
     */
    public static Result joint(List<Order> orders, long exactLimit) {
        if (orders.size() == 1) {
            return firstCome(orders);
        }
        Problem p = new Problem(orders);
        long slots = 0;
        for (Order o : orders) {
            slots += o.capacity();
        }
        if (slots == 0 || p.riders.isEmpty()) {
            return new Result(new int[orders.size()][0], Wire.SOLVER_EXACT);
        }
        double work = (double) slots * slots * (p.riders.size() + slots);
        if (p.anyBand()) {
            work += (double) orders.size() * p.riders.size() * p.riders.size();
        }
        return work > exactLimit ? p.greedy() : p.exact();
    }

    /** centimetres a rider's rank is worth: rankM, or past the model's ranked riders, UNRANKED_CM plus the straight line. */
    static long cm(Rules.Ranked r) {
        return Double.isInfinite(r.rankM) ? UNRANKED_CM + Math.round(r.straightM * 100) : Math.round(r.rankM * 100);
    }

    private record Edge(int order, int index, long cm, boolean band) {
    }

    private static final class Problem {
        final List<Order> orders;
        final List<UUID> riders = new ArrayList<>();
        final List<List<Edge>> edges = new ArrayList<>();
        /** Each rider's turn: fair standing inside a band, then nearest to any order (lower first). */
        final int[] priority;

        Problem(List<Order> orders) {
            this.orders = orders;
            Map<UUID, Integer> at = new HashMap<>();
            List<long[]> stand = new ArrayList<>(); // {step, since, cm}
            for (int o = 0; o < orders.size(); o++) {
                List<Rules.Ranked> ranked = orders.get(o).ranked();
                for (int i = 0; i < ranked.size(); i++) {
                    Rules.Ranked r = ranked.get(i);
                    Integer j = at.get(r.rider.id);
                    if (j == null) {
                        j = riders.size();
                        at.put(r.rider.id, j);
                        riders.add(r.rider.id);
                        edges.add(new ArrayList<>());
                        stand.add(new long[] {Long.MAX_VALUE, Long.MAX_VALUE, Long.MAX_VALUE});
                    }
                    long cm = cm(r);
                    long[] s = stand.get(j);
                    if (r.inBand) {
                        s[0] = r.perHourPaise / Rules.FAIR_STEP_PAISE;
                        s[1] = r.freeSinceMs;
                    }
                    s[2] = Math.min(s[2], cm);
                    edges.get(j).add(new Edge(o, i, cm, r.inBand));
                }
            }
            Integer[] byStanding = new Integer[riders.size()];
            for (int j = 0; j < byStanding.length; j++) {
                byStanding[j] = j;
            }
            Arrays.sort(byStanding, Comparator.<Integer>comparingLong(j -> stand.get(j)[0]).thenComparingLong(j -> stand.get(j)[1])
                .thenComparingLong(j -> stand.get(j)[2]).thenComparing(j -> riders.get(j), Rules.ID_ORDER));
            priority = new int[riders.size()];
            for (int rank = 0; rank < byStanding.length; rank++) {
                priority[byStanding[rank]] = rank;
            }
        }

        boolean anyBand() {
            for (List<Edge> es : edges) {
                for (Edge e : es) {
                    if (e.band()) {
                        return true;
                    }
                }
            }
            return false;
        }

        /**
         * With no fair band, one min-cost matching serves the most orders, then seats the most riders, then rides the fewest
         * metres. With fair turns, riders join in fair-turn order (Kuhn's augmenting paths, a matroid greedy): first one
         * rider an order over every edge, which serves the most orders possible and, among those ways, the fairest set of
         * riders; then more riders inside the bands, then the places left by fewest metres. Each step keeps everyone
         * already chosen, and the riders chosen are re-seated for the shortest rides, each order keeping its count.
         */
        Result exact() {
            int[] match = new int[riders.size()];
            Arrays.fill(match, -1);
            int[] count = new int[orders.size()];
            if (anyBand()) {
                for (List<Edge> es : edges) {
                    es.sort(Comparator.comparing((Edge e) -> !e.band()).thenComparingLong(Edge::cm));
                }
                int[] byPriority = new int[riders.size()];
                for (int j = 0; j < priority.length; j++) {
                    byPriority[priority[j]] = j;
                }
                for (int j : byPriority) {
                    augment(j, 1, false, match, count, new boolean[orders.size()]);
                }
                for (int j : byPriority) {
                    if (match[j] < 0) {
                        augment(j, Integer.MAX_VALUE, true, match, count, new boolean[orders.size()]);
                    }
                }
                List<Integer> chosen = new ArrayList<>();
                for (int j = 0; j < match.length; j++) {
                    if (match[j] >= 0) {
                        chosen.add(j);
                    }
                }
                if (chosen.size() > 1) {
                    reseat(chosen, match, count);
                }
            }
            fill(match, count);
            return result(match, Wire.SOLVER_EXACT);
        }

        /**
         * Tries to seat rider j (through band edges only, when bandOnly), moving riders already seated along an alternating
         * path; no order goes over min(round, its capacity), and nobody seated is unseated, so no order that has a rider
         * loses it.
         */
        boolean augment(int j, int round, boolean bandOnly, int[] match, int[] count, boolean[] visited) {
            for (Edge e : edges.get(j)) {
                if ((bandOnly && !e.band()) || visited[e.order()]) {
                    continue;
                }
                visited[e.order()] = true;
                if (count[e.order()] < Math.min(round, orders.get(e.order()).capacity())) {
                    match[j] = e.order();
                    count[e.order()]++;
                    return true;
                }
                for (int k = 0; k < match.length; k++) {
                    if (match[k] != e.order() || k == j) {
                        continue;
                    }
                    match[k] = -1; // k gives its place to j if k can sit elsewhere
                    if (augment(k, round, bandOnly, match, count, visited)) {
                        match[j] = e.order();
                        return true;
                    }
                    match[k] = e.order();
                }
            }
            return false;
        }

        /**
         * Re-matches the chosen riders to the orders they hold, keeping each order's count: inside each order's band where it
         * can be, then at least distance.
         */
        void reseat(List<Integer> chosen, int[] match, int[] count) {
            List<Integer> slotOrder = new ArrayList<>();
            for (int o = 0; o < count.length; o++) {
                for (int s = 0; s < count[o]; s++) {
                    slotOrder.add(o);
                }
            }
            long[][] cost = new long[chosen.size()][slotOrder.size()];
            for (int r = 0; r < chosen.size(); r++) {
                for (int s = 0; s < slotOrder.size(); s++) {
                    cost[r][s] = INF_COST;
                    for (Edge e : edges.get(chosen.get(r))) {
                        if (e.order() == slotOrder.get(s)) {
                            cost[r][s] = e.cm() + (e.band() ? 0 : OUTSIDE_BAND_CM);
                        }
                    }
                }
            }
            int[] rowCol = hungarian(cost);
            for (int r = 0; r < rowCol.length; r++) {
                int s = rowCol[r];
                if (s >= 0 && cost[r][s] < INF_COST) {
                    match[chosen.get(r)] = slotOrder.get(s);
                }
            }
        }

        /**
         * Gives each order with places left the riders not yet chosen, by a min-cost matching that serves every order once
         * before any twice, keeps inside the bands where it can, and then counts metres.
         */
        void fill(int[] match, int[] count) {
            List<int[]> slotsLeft = new ArrayList<>(); // {order, nth}
            for (int o = 0; o < orders.size(); o++) {
                for (int n = count[o]; n < orders.get(o).capacity(); n++) {
                    slotsLeft.add(new int[] {o, n});
                }
            }
            List<Integer> free = new ArrayList<>();
            for (int j = 0; j < match.length; j++) {
                if (match[j] < 0) {
                    free.add(j);
                }
            }
            if (slotsLeft.isEmpty() || free.isEmpty()) {
                return;
            }
            int cols = free.size() + slotsLeft.size(); // a dummy column per slot: a place left empty, at no cost
            long[][] cost = new long[slotsLeft.size()][cols];
            for (int s = 0; s < slotsLeft.size(); s++) {
                int[] slot = slotsLeft.get(s);
                long bonus = slot[1] == 0 ? FIRST_BONUS : SLOT_BONUS;
                for (int f = 0; f < free.size(); f++) {
                    cost[s][f] = INF_COST;
                    for (Edge e : edges.get(free.get(f))) {
                        if (e.order() == slot[0]) {
                            cost[s][f] = e.cm() - bonus + (e.band() ? 0 : OUTSIDE_BAND_CM);
                        }
                    }
                }
            }
            int[] rowCol = hungarian(cost);
            for (int s = 0; s < rowCol.length; s++) {
                int col = rowCol[s];
                if (col >= 0 && col < free.size() && cost[s][col] < INF_COST) {
                    match[free.get(col)] = slotsLeft.get(s)[0];
                    count[slotsLeft.get(s)[0]]++;
                }
            }
        }

        /**
         * Each order once before any twice; band edges by rider priority, then the rest by metres, the orders with the
         * fewest riders to choose from first.
         */
        Result greedy() {
            List<int[]> all = new ArrayList<>(); // {rider, edge index}
            for (int j = 0; j < edges.size(); j++) {
                for (int k = 0; k < edges.get(j).size(); k++) {
                    all.add(new int[] {j, k});
                }
            }
            all.sort((x, y) -> {
                Edge ex = edges.get(x[0]).get(x[1]);
                Edge ey = edges.get(y[0]).get(y[1]);
                if (ex.band() != ey.band()) {
                    return ex.band() ? -1 : 1;
                }
                if (ex.band() && priority[x[0]] != priority[y[0]]) {
                    return Integer.compare(priority[x[0]], priority[y[0]]);
                }
                int sx = orders.get(ex.order()).ranked().size();
                int sy = orders.get(ey.order()).ranked().size();
                if (sx != sy) {
                    return Integer.compare(sx, sy);
                }
                return Long.compare(ex.cm(), ey.cm());
            });
            int[] match = new int[riders.size()];
            Arrays.fill(match, -1);
            int[] count = new int[orders.size()];
            for (int round : new int[] {1, Integer.MAX_VALUE}) {
                for (boolean band : new boolean[] {true, false}) {
                    for (int[] x : all) {
                        Edge e = edges.get(x[0]).get(x[1]);
                        if (e.band() != band || match[x[0]] >= 0 || count[e.order()] >= Math.min(round, orders.get(e.order()).capacity())) {
                            continue;
                        }
                        match[x[0]] = e.order();
                        count[e.order()]++;
                    }
                }
            }
            return result(match, Wire.SOLVER_GREEDY);
        }

        Result result(int[] match, int solver) {
            List<List<Integer>> chosen = new ArrayList<>();
            for (int o = 0; o < orders.size(); o++) {
                chosen.add(new ArrayList<>());
            }
            for (int j = 0; j < match.length; j++) {
                if (match[j] < 0) {
                    continue;
                }
                for (Edge e : edges.get(j)) {
                    if (e.order() == match[j]) {
                        chosen.get(match[j]).add(e.index());
                        break;
                    }
                }
            }
            int[][] out = new int[orders.size()][];
            for (int o = 0; o < out.length; o++) {
                out[o] = chosen.get(o).stream().mapToInt(Integer::intValue).sorted().toArray();
            }
            return new Result(out, solver);
        }
    }

    /**
     * Solves a min-cost assignment of every row to a distinct column (rows <= columns) in O(rows² × columns), and returns
     * each row's column. A row left only INF_COST choices still gets one, which callers ignore.
     */
    static int[] hungarian(long[][] cost) {
        int n = cost.length;
        if (n == 0) {
            return new int[0];
        }
        int m = cost[0].length;
        long[] u = new long[n + 1];
        long[] v = new long[m + 1];
        int[] p = new int[m + 1];
        int[] way = new int[m + 1];
        long[] minv = new long[m + 1];
        boolean[] used = new boolean[m + 1];
        for (int i = 1; i <= n; i++) {
            p[0] = i;
            int j0 = 0;
            Arrays.fill(minv, Long.MAX_VALUE);
            Arrays.fill(used, false);
            do {
                used[j0] = true;
                int i0 = p[j0];
                long delta = Long.MAX_VALUE;
                int j1 = 0;
                for (int j = 1; j <= m; j++) {
                    if (used[j]) {
                        continue;
                    }
                    long cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                    if (cur < minv[j]) {
                        minv[j] = cur;
                        way[j] = j0;
                    }
                    if (minv[j] < delta) {
                        delta = minv[j];
                        j1 = j;
                    }
                }
                for (int j = 0; j <= m; j++) {
                    if (used[j]) {
                        u[p[j]] += delta;
                        v[j] -= delta;
                    } else {
                        minv[j] -= delta;
                    }
                }
                j0 = j1;
            } while (p[j0] != 0);
            while (j0 != 0) {
                int j1 = way[j0];
                p[j0] = p[j1];
                j0 = j1;
            }
        }
        int[] rowCol = new int[n];
        Arrays.fill(rowCol, -1);
        for (int j = 1; j <= m; j++) {
            if (p[j] > 0) {
                rowCol[p[j] - 1] = j - 1;
            }
        }
        return rowCol;
    }
}
