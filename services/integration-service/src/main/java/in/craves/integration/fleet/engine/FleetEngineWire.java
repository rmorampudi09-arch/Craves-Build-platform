package in.craves.integration.fleet.engine;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * The fleet engine's events (contracts/proto/craves/fleet/v1/fleet.proto), encoded and decoded by hand: protobuf
 * proto3, fields in number order and zero values left out, as protoc writes them, so these bytes equal the fleet
 * engine's (services/fleet-engine Wire; both are tested against contracts/proto/craves/fleet/v1/testdata). No protobuf
 * library is needed.
 */
public final class FleetEngineWire {
    public static final int PING = 1;
    public static final int REFRESH = 2;
    public static final int OFFLINE = 3;
    public static final int SHADOW = 1;
    public static final int LIVE = 2;
    /** A map block is 0.05 degrees a side (about 5.5 km in Hyderabad); one engine instance owns each. */
    public static final double BLOCK_DEGREES = 0.05;
    private static final long BLOCK_COLS = 7200;

    private FleetEngineWire() {
    }

    public record Fix(double lat, double lng, long atMs, boolean mock, float accuracyM) {
    }

    /** What dispatch needs about a rider, as FleetDispatcher.nearbyRiders reads it; homeLat null: no home spot. */
    public record State(UUID shiftId, long shiftEndsMs, boolean active, boolean onTrip, long offeredUntilMs, long breakUntilMs,
                        boolean cannotRing, int maxPickupM, int maxDropM, Double homeLat, Double homeLng, long headingHomeUntilMs,
                        boolean testAllowed, long seenMs, Fix lastFix, long offeredFromMs) {
        public State allowed(boolean allowed) {
            return new State(shiftId, shiftEndsMs, active, onTrip, offeredUntilMs, breakUntilMs, cannotRing, maxPickupM, maxDropM, homeLat,
                homeLng, headingHomeUntilMs, allowed, seenMs, lastFix, offeredFromMs);
        }
    }

    public record Standing(int istDay, long earnedPaise, long onlineSeconds, boolean accruing, long freeSinceMs) {
    }

    public record RiderEvent(UUID riderId, int kind, long atMs, List<Fix> fixes, State state, Standing standing) {
    }

    /** eta: rank by predicted minutes to the kitchen with the travel-time model etaModel (a version), not straight metres. */
    public record Policy(int radiusM, int detourPercent, int offersAtOnce, int fairBandM, int offerSeconds, boolean riderChoices,
                         boolean joint, boolean eta, String etaModel) {
    }

    public record Candidate(UUID riderId, double straightLineM, double lat, double lng, boolean inBand, long perHourPaise,
                            long freeSinceMs, int homeNearerM, boolean held) {
    }

    public record DispatchRequest(UUID requestId, int mode, UUID orderId, long atMs, long deadlineMs, double kitchenLat,
                                  double kitchenLng, double dropLat, double dropLng, int dropM, Policy policy, List<UUID> exclude,
                                  List<Candidate> javaRanked, int round) {
    }

    public record DispatchReply(UUID requestId, List<Candidate> riders, int batchOrders, int solver, long solvedAtMs) {
    }

    public static byte[] encode(RiderEvent e) {
        Out o = new Out();
        o.uuid(1, e.riderId());
        o.uint(2, e.kind());
        o.uint(3, e.atMs());
        for (Fix f : e.fixes() == null ? List.<Fix>of() : e.fixes()) {
            o.message(4, fix(f));
        }
        if (e.state() != null) {
            State s = e.state();
            Out m = new Out();
            m.uuid(1, s.shiftId());
            m.uint(2, s.shiftEndsMs());
            m.bool(3, s.active());
            m.bool(4, s.onTrip());
            m.uint(5, s.offeredUntilMs());
            m.uint(6, s.breakUntilMs());
            m.bool(7, s.cannotRing());
            m.uint(8, s.maxPickupM());
            m.uint(9, s.maxDropM());
            m.bool(10, s.homeLat() != null);
            m.dbl(11, s.homeLat() == null ? 0 : s.homeLat());
            m.dbl(12, s.homeLng() == null ? 0 : s.homeLng());
            m.uint(13, s.headingHomeUntilMs());
            m.bool(14, s.testAllowed());
            m.uint(15, s.seenMs());
            if (s.lastFix() != null) {
                m.message(16, fix(s.lastFix()));
            }
            m.uint(17, s.offeredFromMs());
            o.message(5, m);
        }
        if (e.standing() != null) {
            Standing s = e.standing();
            Out m = new Out();
            m.uint(1, s.istDay());
            m.uint(2, s.earnedPaise());
            m.uint(3, s.onlineSeconds());
            m.bool(4, s.accruing());
            m.uint(5, s.freeSinceMs());
            o.message(6, m);
        }
        return o.bytes();
    }

    private static Out fix(Fix f) {
        Out m = new Out();
        m.dbl(1, f.lat());
        m.dbl(2, f.lng());
        m.uint(3, f.atMs());
        m.bool(4, f.mock());
        m.flt(5, f.accuracyM());
        return m;
    }

    private static Out candidate(Candidate c) {
        Out m = new Out();
        m.uuid(1, c.riderId());
        m.dbl(2, c.straightLineM());
        m.dbl(3, c.lat());
        m.dbl(4, c.lng());
        m.bool(5, c.inBand());
        m.uint(6, c.perHourPaise());
        m.uint(7, c.freeSinceMs());
        m.uint(8, c.homeNearerM());
        m.bool(9, c.held());
        return m;
    }

    public static byte[] encode(DispatchRequest q) {
        Out o = new Out();
        o.uuid(1, q.requestId());
        o.uint(2, q.mode());
        o.uuid(3, q.orderId());
        o.uint(4, q.atMs());
        o.uint(5, q.deadlineMs());
        o.dbl(6, q.kitchenLat());
        o.dbl(7, q.kitchenLng());
        o.dbl(8, q.dropLat());
        o.dbl(9, q.dropLng());
        o.uint(10, q.dropM());
        Policy p = q.policy();
        Out m = new Out();
        m.uint(1, p.radiusM());
        m.uint(2, p.detourPercent());
        m.uint(3, p.offersAtOnce());
        m.uint(4, p.fairBandM());
        m.uint(5, p.offerSeconds());
        m.bool(6, p.riderChoices());
        m.bool(7, p.joint());
        m.bool(8, p.eta());
        if (p.etaModel() != null && !p.etaModel().isEmpty()) {
            byte[] model = p.etaModel().getBytes(StandardCharsets.UTF_8);
            m.bytes(9, model, model.length);
        }
        o.message(11, m);
        for (UUID id : q.exclude() == null ? List.<UUID>of() : q.exclude()) {
            o.uuid(12, id);
        }
        for (Candidate c : q.javaRanked() == null ? List.<Candidate>of() : q.javaRanked()) {
            o.message(13, candidate(c));
        }
        o.uint(14, q.round());
        return o.bytes();
    }

    public static byte[] encode(DispatchReply p) {
        Out o = new Out();
        o.uuid(1, p.requestId());
        for (Candidate c : p.riders()) {
            o.message(2, candidate(c));
        }
        o.uint(3, p.batchOrders());
        o.uint(4, p.solver());
        o.uint(5, p.solvedAtMs());
        return o.bytes();
    }

    /** The engine's reply; unknown fields (from a newer engine) are skipped. */
    public static DispatchReply decodeReply(byte[] b) {
        In in = new In(b, 0, b.length);
        UUID requestId = null;
        List<Candidate> riders = new ArrayList<>();
        int batch = 0;
        int solver = 0;
        long solvedAt = 0;
        while (in.more()) {
            long tag = in.varint();
            int num = (int) (tag >>> 3);
            int type = (int) (tag & 7);
            switch (num) {
                case 1 -> requestId = uuid(in.bytes(type));
                case 2 -> riders.add(decodeCandidate(in.sub(type)));
                case 3 -> batch = (int) in.number(type);
                case 4 -> solver = (int) in.number(type);
                case 5 -> solvedAt = in.number(type);
                default -> in.skip(type);
            }
        }
        return new DispatchReply(requestId, List.copyOf(riders), batch, solver, solvedAt);
    }

    private static Candidate decodeCandidate(In in) {
        UUID id = null;
        double metres = 0;
        double lat = 0;
        double lng = 0;
        boolean inBand = false;
        long perHour = 0;
        long freeSince = 0;
        int nearer = 0;
        boolean held = false;
        while (in.more()) {
            long tag = in.varint();
            int num = (int) (tag >>> 3);
            int type = (int) (tag & 7);
            switch (num) {
                case 1 -> id = uuid(in.bytes(type));
                case 2 -> metres = in.dbl(type);
                case 3 -> lat = in.dbl(type);
                case 4 -> lng = in.dbl(type);
                case 5 -> inBand = in.number(type) != 0;
                case 6 -> perHour = in.number(type);
                case 7 -> freeSince = in.number(type);
                case 8 -> nearer = (int) in.number(type);
                case 9 -> held = in.number(type) != 0;
                default -> in.skip(type);
            }
        }
        return new Candidate(id, metres, lat, lng, inBand, perHour, freeSince, nearer, held);
    }

    /** FNV-1a 32-bit finished with MurmurHash3's fmix32: the engine's wire.Hash32. */
    public static int hash32(byte[] b) {
        int h = 0x811C9DC5;
        for (byte x : b) {
            h ^= x & 0xFF;
            h *= 16777619;
        }
        h ^= h >>> 16;
        h *= 0x85EBCA6B;
        h ^= h >>> 13;
        h *= 0xC2B2AE35;
        h ^= h >>> 16;
        return h;
    }

    /** The stream partition of a rider's events. */
    public static int partition(UUID id, int partitions) {
        return Integer.remainderUnsigned(hash32(bytes(id)), partitions);
    }

    /** The block holding a point: row × 7200 + column of the 0.05° grid from (-90, -180). */
    public static long block(double lat, double lng) {
        long row = (long) Math.floor((lat + 90) / BLOCK_DEGREES);
        long col = (long) Math.floor((lng + 180) / BLOCK_DEGREES);
        return row * BLOCK_COLS + col;
    }

    /** The stream partition of a block's dispatch requests. */
    public static int blockPartition(long block, int partitions) {
        return Integer.remainderUnsigned(hash32(ByteBuffer.allocate(8).putLong(block).array()), partitions);
    }

    public static String riderStream(String prefix, int partition) {
        return prefix + "rq:{rq" + partition + "}";
    }

    public static String dispatchStream(String prefix, int partition) {
        return prefix + "dq:{dq" + partition + "}";
    }

    public static String replyKey(String prefix, UUID requestId) {
        return prefix + "reply:{" + HexFormat.of().formatHex(bytes(requestId)) + "}";
    }

    public static byte[] bytes(UUID id) {
        return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
    }

    static UUID uuid(byte[] b) {
        if (b == null || b.length == 0) {
            return null;
        }
        if (b.length != 16) {
            throw new IllegalArgumentException("an id is 16 bytes, not " + b.length);
        }
        ByteBuffer buffer = ByteBuffer.wrap(b);
        return new UUID(buffer.getLong(), buffer.getLong());
    }

    /** Appends fields; proto3 leaves zero values out. */
    static final class Out {
        private byte[] buf = new byte[128];
        private int n;

        private void raw(int b) {
            if (n == buf.length) {
                buf = Arrays.copyOf(buf, n * 2);
            }
            buf[n++] = (byte) b;
        }

        private void varint(long v) {
            while ((v & ~0x7FL) != 0) {
                raw((int) ((v & 0x7F) | 0x80));
                v >>>= 7;
            }
            raw((int) v);
        }

        private void tag(int num, int type) {
            varint(((long) num << 3) | type);
        }

        void uint(int num, long v) {
            if (v != 0) {
                tag(num, 0);
                varint(v);
            }
        }

        void bool(int num, boolean v) {
            if (v) {
                tag(num, 0);
                raw(1);
            }
        }

        void dbl(int num, double v) {
            long bits = Double.doubleToRawLongBits(v);
            if (bits != 0) {
                tag(num, 1);
                for (int i = 0; i < 8; i++) {
                    raw((int) (bits >>> (8 * i)));
                }
            }
        }

        void flt(int num, float v) {
            int bits = Float.floatToRawIntBits(v);
            if (bits != 0) {
                tag(num, 5);
                for (int i = 0; i < 4; i++) {
                    raw(bits >>> (8 * i));
                }
            }
        }

        void bytes(int num, byte[] b, int len) {
            tag(num, 2);
            varint(len);
            for (int i = 0; i < len; i++) {
                raw(b[i]);
            }
        }

        void uuid(int num, UUID id) {
            if (id != null) {
                bytes(num, FleetEngineWire.bytes(id), 16);
            }
        }

        void message(int num, Out m) {
            bytes(num, m.buf, m.n);
        }

        byte[] bytes() {
            return Arrays.copyOf(buf, n);
        }
    }

    /** Reads fields; a wrong wire type or a cut-off message is refused. */
    static final class In {
        private final byte[] b;
        private int pos;
        private final int end;

        In(byte[] b, int pos, int end) {
            this.b = b;
            this.pos = pos;
            this.end = end;
        }

        boolean more() {
            return pos < end;
        }

        long varint() {
            long v = 0;
            for (int shift = 0; shift < 64; shift += 7) {
                if (pos >= end) {
                    throw new IllegalArgumentException("a cut-off varint");
                }
                byte x = b[pos++];
                v |= (long) (x & 0x7F) << shift;
                if ((x & 0x80) == 0) {
                    return v;
                }
            }
            throw new IllegalArgumentException("a varint over 10 bytes");
        }

        long number(int type) {
            want(type, 0);
            return varint();
        }

        double dbl(int type) {
            want(type, 1);
            if (end - pos < 8) {
                throw new IllegalArgumentException("a cut-off double");
            }
            long bits = 0;
            for (int i = 0; i < 8; i++) {
                bits |= (long) (b[pos++] & 0xFF) << (8 * i);
            }
            return Double.longBitsToDouble(bits);
        }

        byte[] bytes(int type) {
            want(type, 2);
            long len = varint();
            if (len < 0 || len > end - pos) {
                throw new IllegalArgumentException("a cut-off field");
            }
            byte[] out = Arrays.copyOfRange(b, pos, pos + (int) len);
            pos += (int) len;
            return out;
        }

        In sub(int type) {
            want(type, 2);
            long len = varint();
            if (len < 0 || len > end - pos) {
                throw new IllegalArgumentException("a cut-off message");
            }
            In in = new In(b, pos, pos + (int) len);
            pos += (int) len;
            return in;
        }

        void skip(int type) {
            long len = switch (type) {
                case 0 -> {
                    varint();
                    yield 0;
                }
                case 1 -> 8;
                case 2 -> varint();
                case 5 -> 4;
                default -> throw new IllegalArgumentException("an unknown wire type " + type);
            };
            if (len < 0 || len > end - pos) {
                throw new IllegalArgumentException("a cut-off field");
            }
            pos += (int) len;
        }

        private static void want(int type, int expected) {
            if (type != expected) {
                throw new IllegalArgumentException("wire type " + type + " where " + expected + " belongs");
            }
        }
    }
}
