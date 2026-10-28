package in.craves.fleetengine.support;

import java.util.concurrent.atomic.AtomicLongArray;
import java.util.concurrent.atomic.LongAdder;

/**
 * A latency histogram in fixed millisecond buckets, lock-free to update, read one period at a time (window), so the stats
 * line a minute shows that minute's p50 and p99 rather than everything since the engine started. A quantile is the
 * upper bound of the bucket it falls in, or the last bound past them all, as Prometheus estimates it.
 */
public final class Latency {
    /** Bucket upper bounds in milliseconds. */
    public static final double[] MILLIS = {1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000};

    private final double[] bounds;
    private final AtomicLongArray buckets;
    private final LongAdder count = new LongAdder();

    public Latency() {
        this(MILLIS);
    }

    public Latency(double[] bounds) {
        this.bounds = bounds.clone();
        this.buckets = new AtomicLongArray(bounds.length);
    }

    /** Records one value; one past the last bound counts only in the total. */
    public void observe(double ms) {
        int lo = 0;
        int hi = bounds.length;
        while (lo < hi) { // the first bound >= ms
            int mid = (lo + hi) >>> 1;
            if (bounds[mid] < ms) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo < bounds.length) {
            buckets.incrementAndGet(lo);
        }
        count.increment();
    }

    /** A reader that returns each period's count and quantiles. */
    public Window window() {
        return new Window();
    }

    /** The total first, so the buckets read after it hold at least what it counts. */
    private long[] snapshot() {
        long[] s = new long[bounds.length + 1];
        s[bounds.length] = count.sum();
        for (int i = 0; i < bounds.length; i++) {
            s[i] = buckets.get(i);
        }
        return s;
    }

    private double quantile(long[] counts, long total, double q) {
        if (total <= 0) {
            return 0;
        }
        long want = (long) Math.ceil(q * total);
        long seen = 0;
        for (int i = 0; i < bounds.length; i++) {
            seen += counts[i];
            if (seen >= want) {
                return bounds[i];
            }
        }
        return bounds[bounds.length - 1];
    }

    /** Reads the histogram one period at a time. */
    public final class Window {
        private long[] last = snapshot();

        /** {count since the previous call (or the window's start), then each q's quantile over those values}. */
        public double[] next(double... qs) {
            long[] now = snapshot();
            long[] delta = new long[bounds.length];
            for (int i = 0; i < bounds.length; i++) {
                delta[i] = now[i] - last[i];
            }
            long n = now[bounds.length] - last[bounds.length];
            last = now;
            double[] out = new double[qs.length + 1];
            out[0] = n;
            for (int i = 0; i < qs.length; i++) {
                out[i + 1] = quantile(delta, n, qs[i]);
            }
            return out;
        }
    }
}
