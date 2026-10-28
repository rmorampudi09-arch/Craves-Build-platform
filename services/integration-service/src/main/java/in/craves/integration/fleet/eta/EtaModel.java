package in.craves.integration.fleet.eta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Craves's travel-time model (ml/fleet-eta/README.md): the minutes one leg of a trip takes, the rider to the kitchen
 * (PICKUP) or the kitchen to the drop (DROP), from where, to where, and the IST hour and weekday. It predicts roads, never
 * people: no rider is a feature. It is a gradient-boosted tree ensemble that ml/fleet-eta trains in Python (scikit-learn)
 * on Craves's own finished trips and exports as JSON; this class evaluates it exactly as scikit-learn does (each feature
 * as a float32 against the split, the leaves added tree by tree), and EtaModelTest checks it against Python's own
 * predictions. parse refuses a model it cannot evaluate safely.
 * <p>Copied in integration-service and services/fleet-engine, identical but for the package
 * (scripts/release/verify-platform-copies.py).
 */
public final class EtaModel {
    public static final int PICKUP = 0;
    public static final int DROP = 1;
    /** The features, in the order the model reads them (ml/fleet-eta/fleet_eta/features.py). */
    public static final List<String> FEATURES = List.of("metres", "from_lat", "from_lng", "to_lat", "to_lng", "bearing_sin",
        "bearing_cos", "ist_hour", "ist_weekday", "leg");
    /** Minutes are ranked as metres at 20 km/h, the speed straight-line ranking and the offer's minutes assume. */
    public static final double METRES_PER_MINUTE = 1000.0 / 3;
    /** Only the nearest this many riders by straight line are ranked by the model; the rest follow them, nearest first. */
    public static final int RANKED = 50;
    /** No leg is predicted longer than this, whatever the trees say. */
    public static final double MAX_MINUTES = 240;
    /**
     * The minutes shown and ranked by stay within what the legs it learnt from took (ml/fleet-eta model.serve): no faster
     * than 60 km/h on the straight line, and at most 120 minutes, so a place or hour it never saw can't produce a wild number.
     */
    public static final double MAX_METRES_PER_MINUTE = 1000;
    public static final double SERVED_MAX_MINUTES = 120;
    private static final Pattern VERSION = Pattern.compile("[A-Za-z0-9._-]{1,64}");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long IST_OFFSET_MS = 19_800_000;
    private static final long DAY_MS = 86_400_000;
    private static final long HOUR_MS = 3_600_000;
    private static final int MAX_TREES = 5_000;
    private static final int MAX_NODES = 2_000_000;

    private final String version;
    private final double init;
    private final double learningRate;
    private final int[] roots;
    private final int[] feature;
    private final double[] threshold;
    private final int[] left;
    private final int[] right;
    private final double[] value;

    private EtaModel(String version, double init, double learningRate, int[] roots, int[] feature, double[] threshold, int[] left,
                     int[] right, double[] value) {
        this.version = version;
        this.init = init;
        this.learningRate = learningRate;
        this.roots = roots;
        this.feature = feature;
        this.threshold = threshold;
        this.left = left;
        this.right = right;
        this.value = value;
    }

    public String version() {
        return version;
    }

    /**
     * The minutes for one leg, from (fromLat, fromLng) to (toLat, toLng), starting at atMs (epoch ms), as riders and chefs
     * are shown them and riders are ranked by: the prediction, within MAX_METRES_PER_MINUTE and SERVED_MAX_MINUTES.
     */
    public double minutes(int leg, double fromLat, double fromLng, double toLat, double toLng, long atMs) {
        double[] x = features(leg, fromLat, fromLng, toLat, toLng, atMs);
        return Math.min(SERVED_MAX_MINUTES, Math.max(x[0] / MAX_METRES_PER_MINUTE, predict(x)));
    }

    /** The model's output for one row of FEATURES, kept within 0 to MAX_MINUTES. */
    public double predict(double[] x) {
        double[] f = new double[x.length];
        for (int i = 0; i < x.length; i++) {
            f[i] = (float) x[i]; // scikit-learn compares float32 features with float64 thresholds
        }
        double out = init;
        for (int root : roots) {
            int node = root;
            while (left[node] >= 0) {
                node = f[feature[node]] <= threshold[node] ? left[node] : right[node];
            }
            out += learningRate * value[node];
        }
        return Math.max(0, Math.min(MAX_MINUTES, out));
    }

    /**
     * One row of FEATURES: the straight line in metres (RoadDistanceClient's haversine), both ends, the initial bearing's
     * sine and cosine, the IST hour (0-23) and weekday (0 Monday to 6 Sunday) at atMs, and the leg.
     */
    public static double[] features(int leg, double fromLat, double fromLng, double toLat, double toLng, long atMs) {
        double dLat = Math.toRadians(toLat - fromLat);
        double dLng = Math.toRadians(toLng - fromLng);
        double a = Math.pow(Math.sin(dLat / 2), 2)
            + Math.cos(Math.toRadians(fromLat)) * Math.cos(Math.toRadians(toLat)) * Math.pow(Math.sin(dLng / 2), 2);
        double metres = 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
        double phi1 = Math.toRadians(fromLat);
        double phi2 = Math.toRadians(toLat);
        double bearing = Math.atan2(Math.sin(dLng) * Math.cos(phi2),
            Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng));
        long ist = atMs + IST_OFFSET_MS;
        long hour = Math.floorMod(ist, DAY_MS) / HOUR_MS;
        long weekday = Math.floorMod(Math.floorDiv(ist, DAY_MS) + 3, 7); // 1 January 1970 was a Thursday
        return new double[] {metres, fromLat, fromLng, toLat, toLng, Math.sin(bearing), Math.cos(bearing), hour, weekday, leg};
    }

    /**
     * Reads a model ml/fleet-eta exported: {"format": 1, "version", "features", "init", "learning_rate", "trees": [{"feature",
     * "threshold", "left", "right", "value"}]}, each tree's nodes as parallel arrays, a leaf's children -1. Refuses
     * (IllegalArgumentException) anything else: other features, a child that doesn't come after its parent (so no walk
     * can loop or leave the tree), a value that isn't finite, too many nodes.
     */
    public static EtaModel parse(String json) {
        JsonNode m;
        try {
            m = JSON.readTree(json);
        } catch (IOException e) {
            throw new IllegalArgumentException("ETA model: not JSON");
        }
        if (m == null || !m.isObject() || m.path("format").asInt() != 1) {
            throw new IllegalArgumentException("ETA model: format 1 expected");
        }
        String version = m.path("version").asText("");
        if (!VERSION.matcher(version).matches()) {
            throw new IllegalArgumentException("ETA model: a version is 1 to 64 letters, digits, '.', '_' or '-'");
        }
        List<String> features = new ArrayList<>();
        m.path("features").forEach(f -> features.add(f.asText()));
        if (!FEATURES.equals(features)) {
            throw new IllegalArgumentException("ETA model " + version + ": features " + features + ", expected " + FEATURES);
        }
        double init = finite(m.path("init"), version);
        double rate = finite(m.path("learning_rate"), version);
        if (rate <= 0 || rate > 1) {
            throw new IllegalArgumentException("ETA model " + version + ": learning_rate must be in (0, 1]");
        }
        JsonNode trees = m.path("trees");
        if (!trees.isArray() || trees.isEmpty() || trees.size() > MAX_TREES) {
            throw new IllegalArgumentException("ETA model " + version + ": 1 to " + MAX_TREES + " trees expected");
        }
        int total = 0;
        for (JsonNode t : trees) {
            total += t.path("value").size();
        }
        if (total > MAX_NODES) {
            throw new IllegalArgumentException("ETA model " + version + ": over " + MAX_NODES + " nodes");
        }
        int[] roots = new int[trees.size()];
        int[] feature = new int[total];
        double[] threshold = new double[total];
        int[] left = new int[total];
        int[] right = new int[total];
        double[] value = new double[total];
        int at = 0;
        for (int k = 0; k < trees.size(); k++) {
            JsonNode t = trees.get(k);
            int n = t.path("value").size();
            for (String field : List.of("feature", "threshold", "left", "right", "value")) {
                if (!t.path(field).isArray() || t.path(field).size() != n || n == 0) {
                    throw new IllegalArgumentException("ETA model " + version + ": tree " + k + " needs " + field + " for each node");
                }
            }
            roots[k] = at;
            for (int i = 0; i < n; i++) {
                int l = t.get("left").get(i).asInt();
                int r = t.get("right").get(i).asInt();
                value[at + i] = finite(t.get("value").get(i), version);
                if (l == -1 && r == -1) {
                    left[at + i] = -1;
                    right[at + i] = -1;
                    continue;
                }
                int f = t.get("feature").get(i).asInt();
                if (l <= i || r <= i || l >= n || r >= n || f < 0 || f >= FEATURES.size()) {
                    throw new IllegalArgumentException("ETA model " + version + ": tree " + k + " node " + i + " is malformed");
                }
                feature[at + i] = f;
                threshold[at + i] = finite(t.get("threshold").get(i), version);
                left[at + i] = at + l;
                right[at + i] = at + r;
            }
            at += n;
        }
        return new EtaModel(version, init, rate, roots, feature, threshold, left, right, value);
    }

    private static double finite(JsonNode n, String version) {
        if (n == null || !n.isNumber() || !Double.isFinite(n.asDouble())) {
            throw new IllegalArgumentException("ETA model " + version + ": a number is missing or not finite");
        }
        return n.asDouble();
    }
}
