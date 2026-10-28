package in.craves.fleetengine.wire;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * The fleet engine's events (contracts/proto/craves/fleet/v1/fleet.proto), encoded and decoded by hand: protobuf
 * proto3, fields in number order and zero values left out, as protoc writes them. integration-service has the other
 * side (FleetEngineWire); both are tested against contracts/proto/craves/fleet/v1/testdata. No protobuf library.
 * Decoding refuses a wrong wire type, an id that isn't 16 bytes and a cut-off message (IllegalArgumentException), and
 * skips fields it doesn't know, so a newer integration-service can add fields.
 */
public final class Wire {
    public static final int PING = 1;
    public static final int REFRESH = 2;
    public static final int OFFLINE = 3;
    public static final int SHADOW = 1;
    public static final int LIVE = 2;
    public static final int SOLVER_SINGLE = 1;
    public static final int SOLVER_EXACT = 2;
    public static final int SOLVER_GREEDY = 3;
    /** A map block is 0.05 degrees a side (about 5.5 km in Hyderabad); one engine instance owns each. */
    public static final double BLOCK_DEGREES = 0.05;
    private static final long BLOCK_COLS = 7200; // 360 / BLOCK_DEGREES

    private Wire() {
    }

    public record Fix(double lat, double lng, long atMs, boolean mock, float accuracyM) {
    }

    /** What dispatch needs about a rider; shiftId null: no open shift; homeLat null: no home spot; lastFix null: none. */
    public record State(UUID shiftId, long shiftEndsMs, boolean active, boolean onTrip, long offeredUntilMs, long breakUntilMs,
                        boolean cannotRing, int maxPickupM, int maxDropM, Double homeLat, Double homeLng, long headingHomeUntilMs,
                        boolean testAllowed, long seenMs, Fix lastFix, long offeredFromMs) {
    }

    public record Standing(int istDay, long earnedPaise, long onlineSeconds, boolean accruing, long freeSinceMs) {
    }

    /** state and standing are null when the event leaves them out. */
    public record RiderEvent(UUID riderId, int kind, long atMs, List<Fix> fixes, State state, Standing standing) {
    }

    public record Policy(int radiusM, int detourPercent, int offersAtOnce, int fairBandM, int offerSeconds, boolean riderChoices,
                         boolean joint) {
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

    public static RiderEvent decodeRiderEvent(byte[] b) {
        In in = new In(b, 0, b.length);
        UUID riderId = null;
        int kind = 0;
        long atMs = 0;
        List<Fix> fixes = new ArrayList<>(4);
        State state = null;
        Standing standing = null;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> riderId = uuid(in.bytes(type));
                case 2 -> kind = (int) in.number(type);
                case 3 -> atMs = in.number(type);
                case 4 -> fixes.add(decodeFix(in.sub(type)));
                case 5 -> state = decodeState(in.sub(type));
                case 6 -> standing = decodeStanding(in.sub(type));
                default -> in.skip(type);
            }
        }
        return new RiderEvent(riderId, kind, atMs, fixes, state, standing);
    }

    private static Fix decodeFix(In in) {
        double lat = 0;
        double lng = 0;
        long at = 0;
        boolean mock = false;
        float accuracy = 0;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> lat = in.dbl(type);
                case 2 -> lng = in.dbl(type);
                case 3 -> at = in.number(type);
                case 4 -> mock = in.number(type) != 0;
                case 5 -> accuracy = in.flt(type);
                default -> in.skip(type);
            }
        }
        return new Fix(lat, lng, at, mock, accuracy);
    }

    private static State decodeState(In in) {
        UUID shift = null;
        long shiftEnds = 0;
        boolean active = false;
        boolean onTrip = false;
        long offeredUntil = 0;
        long breakUntil = 0;
        boolean cannotRing = false;
        int maxPickup = 0;
        int maxDrop = 0;
        boolean hasHome = false;
        double homeLat = 0;
        double homeLng = 0;
        long headingHome = 0;
        boolean testAllowed = false;
        long seen = 0;
        Fix lastFix = null;
        long offeredFrom = 0;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> shift = uuid(in.bytes(type));
                case 2 -> shiftEnds = in.number(type);
                case 3 -> active = in.number(type) != 0;
                case 4 -> onTrip = in.number(type) != 0;
                case 5 -> offeredUntil = in.number(type);
                case 6 -> breakUntil = in.number(type);
                case 7 -> cannotRing = in.number(type) != 0;
                case 8 -> maxPickup = (int) in.number(type);
                case 9 -> maxDrop = (int) in.number(type);
                case 10 -> hasHome = in.number(type) != 0;
                case 11 -> homeLat = in.dbl(type);
                case 12 -> homeLng = in.dbl(type);
                case 13 -> headingHome = in.number(type);
                case 14 -> testAllowed = in.number(type) != 0;
                case 15 -> seen = in.number(type);
                case 16 -> lastFix = decodeFix(in.sub(type));
                case 17 -> offeredFrom = in.number(type);
                default -> in.skip(type);
            }
        }
        return new State(shift, shiftEnds, active, onTrip, offeredUntil, breakUntil, cannotRing, maxPickup, maxDrop,
            hasHome ? homeLat : null, hasHome ? homeLng : null, headingHome, testAllowed, seen, lastFix, offeredFrom);
    }

    private static Standing decodeStanding(In in) {
        int day = 0;
        long earned = 0;
        long online = 0;
        boolean accruing = false;
        long freeSince = 0;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> day = (int) in.number(type);
                case 2 -> earned = in.number(type);
                case 3 -> online = in.number(type);
                case 4 -> accruing = in.number(type) != 0;
                case 5 -> freeSince = in.number(type);
                default -> in.skip(type);
            }
        }
        return new Standing(day, earned, online, accruing, freeSince);
    }

    public static DispatchRequest decodeRequest(byte[] b) {
        In in = new In(b, 0, b.length);
        UUID requestId = null;
        int mode = 0;
        UUID orderId = null;
        long atMs = 0;
        long deadlineMs = 0;
        double kitchenLat = 0;
        double kitchenLng = 0;
        double dropLat = 0;
        double dropLng = 0;
        int dropM = 0;
        Policy policy = new Policy(0, 0, 0, 0, 0, false, false);
        List<UUID> exclude = new ArrayList<>();
        List<Candidate> javaRanked = new ArrayList<>();
        int round = 0;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> requestId = uuid(in.bytes(type));
                case 2 -> mode = (int) in.number(type);
                case 3 -> orderId = uuid(in.bytes(type));
                case 4 -> atMs = in.number(type);
                case 5 -> deadlineMs = in.number(type);
                case 6 -> kitchenLat = in.dbl(type);
                case 7 -> kitchenLng = in.dbl(type);
                case 8 -> dropLat = in.dbl(type);
                case 9 -> dropLng = in.dbl(type);
                case 10 -> dropM = (int) in.number(type);
                case 11 -> policy = decodePolicy(in.sub(type));
                case 12 -> {
                    UUID id = uuid(in.bytes(type));
                    if (id != null) {
                        exclude.add(id);
                    }
                }
                case 13 -> javaRanked.add(decodeCandidate(in.sub(type)));
                case 14 -> round = (int) in.number(type);
                default -> in.skip(type);
            }
        }
        return new DispatchRequest(requestId, mode, orderId, atMs, deadlineMs, kitchenLat, kitchenLng, dropLat, dropLng, dropM,
            policy, exclude, javaRanked, round);
    }

    private static Policy decodePolicy(In in) {
        int radius = 0;
        int detour = 0;
        int atOnce = 0;
        int band = 0;
        int seconds = 0;
        boolean choices = false;
        boolean joint = false;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
                case 1 -> radius = (int) in.number(type);
                case 2 -> detour = (int) in.number(type);
                case 3 -> atOnce = (int) in.number(type);
                case 4 -> band = (int) in.number(type);
                case 5 -> seconds = (int) in.number(type);
                case 6 -> choices = in.number(type) != 0;
                case 7 -> joint = in.number(type) != 0;
                default -> in.skip(type);
            }
        }
        return new Policy(radius, detour, atOnce, band, seconds, choices, joint);
    }

    /** The engine's reply; unknown fields are skipped. */
    public static DispatchReply decodeReply(byte[] b) {
        In in = new In(b, 0, b.length);
        UUID requestId = null;
        List<Candidate> riders = new ArrayList<>();
        int batch = 0;
        int solver = 0;
        long solvedAt = 0;
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
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
            int type = (int) (tag & 7);
            switch ((int) (tag >>> 3)) {
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

    /** FNV-1a 32-bit finished with MurmurHash3's fmix32, so every bit reaches the low bits a partition uses. */
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

    /** The blocks a box touches, south-west to north-east. */
    public static List<Long> blocksIn(double minLat, double minLng, double maxLat, double maxLng) {
        long r0 = (long) Math.floor((minLat + 90) / BLOCK_DEGREES);
        long r1 = (long) Math.floor((maxLat + 90) / BLOCK_DEGREES);
        long c0 = (long) Math.floor((minLng + 180) / BLOCK_DEGREES);
        long c1 = (long) Math.floor((maxLng + 180) / BLOCK_DEGREES);
        List<Long> out = new ArrayList<>((int) ((r1 - r0 + 1) * (c1 - c0 + 1)));
        for (long r = r0; r <= r1; r++) {
            for (long c = c0; c <= c1; c++) {
                out.add(r * BLOCK_COLS + c);
            }
        }
        return out;
    }

    public static String riderStream(String prefix, int partition) {
        return prefix + "rq:{rq" + partition + "}";
    }

    public static String dispatchStream(String prefix, int partition) {
        return prefix + "dq:{dq" + partition + "}";
    }

    public static String hex(UUID id) {
        return HexFormat.of().formatHex(bytes(id));
    }

    public static byte[] bytes(UUID id) {
        return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
    }

    /** The id in 16 bytes; null for none (empty). */
    public static UUID uuid(byte[] b) {
        if (b.length == 0) {
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
                bytes(num, Wire.bytes(id), 16);
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

        float flt(int type) {
            want(type, 5);
            if (end - pos < 4) {
                throw new IllegalArgumentException("a cut-off float");
            }
            int bits = 0;
            for (int i = 0; i < 4; i++) {
                bits |= (b[pos++] & 0xFF) << (8 * i);
            }
            return Float.intBitsToFloat(bits);
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
