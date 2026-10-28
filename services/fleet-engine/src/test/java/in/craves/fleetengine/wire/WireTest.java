package in.craves.fleetengine.wire;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The engine's codec against the shared contract (contracts/proto/craves/fleet/v1/testdata, decoded by protoc and read by
 * integration-service's FleetEngineWireTest too): both sides must write and read the same bytes, and pick the same stream.
 */
class WireTest {
    static final Path TESTDATA = Path.of("../../contracts/proto/craves/fleet/v1/testdata");
    static final UUID RIDER = UUID.fromString("1f0e2d3c-4b5a-6978-8796-a5b4c3d2e1f0");
    static final UUID RIDER2 = UUID.fromString("7c9e6679-7425-40de-944b-e07fc1f90ae7");
    static final UUID SHIFT = UUID.fromString("0b2c4d6e-8f10-4a2b-9c3d-4e5f60718293");
    static final UUID ORDER = UUID.fromString("5d3e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b");
    static final UUID REQUEST = UUID.fromString("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d");

    static Map<String, Object> goldens() {
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("rider_event_ping", new Wire.RiderEvent(RIDER, Wire.PING, 1761640000123L,
            List.of(new Wire.Fix(17.4486, 78.3908, 1761640000000L, false, 8.5f), new Wire.Fix(17.449, 78.3911, 1761640005000L, true, 12.25f)),
            new Wire.State(SHIFT, 1761683200000L, true, false, 0, 0, false, 2000, 0, 17.47, 78.35, 1761643600000L, true, 1761640000123L,
                null, 0),
            null));
        g.put("rider_event_refresh", new Wire.RiderEvent(RIDER, Wire.REFRESH, 1761640001500L, List.of(),
            new Wire.State(SHIFT, 1761683200000L, true, false, 1761640040000L, 1761640900000L, true, 0, 8000, null, null, 0, true,
                1761640000123L, new Wire.Fix(17.4486, 78.3908, 1761640000000L, false, 8.5f), 1761640000000L),
            new Wire.Standing(20261028, 45000, 7200, true, 1761639000000L)));
        g.put("rider_event_offline", new Wire.RiderEvent(RIDER2, Wire.OFFLINE, 1761640002000L, List.of(), null, null));
        g.put("dispatch_request_live", new Wire.DispatchRequest(REQUEST, Wire.LIVE, ORDER, 1761640003000L, 1761640003300L, 17.4483,
            78.3915, 17.46, 78.36, 4200, new Wire.Policy(5000, 140, 1, 1500, 40, true, true), List.of(RIDER2), List.of(), 2));
        g.put("dispatch_request_shadow", new Wire.DispatchRequest(REQUEST, Wire.SHADOW, ORDER, 1761640003000L, 0, 17.4483, 78.3915, 17.46,
            78.36, 4200, new Wire.Policy(5000, 140, 3, 0, 40, false, false), List.of(),
            List.of(new Wire.Candidate(RIDER, 412.75, 17.4486, 78.3908, true, 15000, 1761639000000L, 3240, false),
                new Wire.Candidate(RIDER2, 1630.5, 17.4601, 78.3999, false, 0, 0, 0, false)), 1));
        g.put("dispatch_reply", new Wire.DispatchReply(REQUEST,
            List.of(new Wire.Candidate(RIDER, 412.75, 17.4486, 78.3908, true, 15000, 1761639000000L, 3240, true),
                new Wire.Candidate(RIDER2, 1630.5, 17.4601, 78.3999, false, 0, 0, 0, false)), 3, Wire.SOLVER_EXACT, 1761640003042L));
        return g;
    }

    static byte[] encode(Object message) {
        return switch (message) {
            case Wire.RiderEvent e -> Wire.encode(e);
            case Wire.DispatchRequest q -> Wire.encode(q);
            case Wire.DispatchReply p -> Wire.encode(p);
            default -> throw new IllegalArgumentException(message.toString());
        };
    }

    static byte[] golden(String name) throws Exception {
        return HexFormat.of().parseHex(Files.readString(TESTDATA.resolve(name + ".hex")).strip());
    }

    @Test
    void goldenBytesMatchTheContract() throws Exception {
        for (Map.Entry<String, Object> g : goldens().entrySet()) {
            assertEquals(HexFormat.of().formatHex(golden(g.getKey())), HexFormat.of().formatHex(encode(g.getValue())), g.getKey());
        }
    }

    @Test
    void goldenBytesDecodeToTheSameMessages() throws Exception {
        for (Map.Entry<String, Object> g : goldens().entrySet()) {
            byte[] b = golden(g.getKey());
            Object decoded = switch (g.getValue()) {
                case Wire.RiderEvent e -> Wire.decodeRiderEvent(b);
                case Wire.DispatchRequest q -> Wire.decodeRequest(b);
                default -> Wire.decodeReply(b);
            };
            assertEquals(g.getValue(), decoded, g.getKey());
        }
    }

    @Test
    void unknownFieldsAreSkippedAndBadBytesRefused() {
        byte[] ping = Wire.encode((Wire.RiderEvent) goldens().get("rider_event_ping"));
        // Field 99 (varint 7) and field 98 (fixed32 1.5f) from a newer writer are skipped.
        byte[] newer = Arrays.copyOf(ping, ping.length + 3 + 6);
        int n = ping.length;
        newer[n++] = (byte) 0x98; // field 99, varint: (99 << 3) | 0 = 792 = 0x98 0x06
        newer[n++] = 0x06;
        newer[n++] = 7;
        newer[n++] = (byte) 0x95; // field 98, fixed32: (98 << 3) | 5 = 789 = 0x95 0x06
        newer[n++] = 0x06;
        int bits = Float.floatToRawIntBits(1.5f);
        for (int i = 0; i < 4; i++) {
            newer[n++] = (byte) (bits >>> (8 * i));
        }
        Wire.RiderEvent e = Wire.decodeRiderEvent(newer);
        assertEquals(RIDER, e.riderId());
        assertEquals(2, e.fixes().size());
        assertThrows(IllegalArgumentException.class, () -> Wire.decodeRiderEvent(Arrays.copyOf(ping, ping.length - 3)));
        assertThrows(IllegalArgumentException.class, () -> Wire.decodeRiderEvent(new byte[] {0x0A, 3, 1, 2, 3})); // a 3-byte id
        assertThrows(IllegalArgumentException.class, () -> Wire.decodeRiderEvent(new byte[] {0x19, 1, 2, 3, 4, 5, 6, 7, 8})); // at_ms as fixed64
    }

    @Test
    void negativeAndLongValuesRoundTrip() {
        List<Wire.Fix> fixes = new ArrayList<>();
        for (int i = 0; i < 40; i++) { // a state over 127 bytes and many fixes force multi-byte lengths
            fixes.add(new Wire.Fix(i + 0.5, 78, (long) i << 40, false, 3));
        }
        Wire.RiderEvent in = new Wire.RiderEvent(RIDER, Wire.PING, -5, fixes,
            new Wire.State(null, 0, false, false, 0, 0, false, -1, 0, -33.86, 151.2, 0, false, 0, null, 0), null);
        assertEquals(in, Wire.decodeRiderEvent(Wire.encode(in)));
        List<Wire.Candidate> riders = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            riders.add(new Wire.Candidate(RIDER, i, 17, 78, true, 0, 0, 0, false));
        }
        Wire.DispatchReply back = Wire.decodeReply(Wire.encode(new Wire.DispatchReply(REQUEST, riders, 1, 0, 0)));
        assertEquals(30, back.riders().size());
        assertEquals(29.0, back.riders().get(29).straightLineM());
    }

    @Test
    void partitionsAndBlocksMatchTheSharedVectors() throws Exception {
        JsonNode v = new ObjectMapper().readTree(Files.readString(TESTDATA.resolve("vectors.json")));
        int partitions = v.get("partitions").asInt();
        assertEquals(16, partitions);
        assertTrue(v.get("riders").size() > 0 && v.get("blocks").size() > 0);
        for (JsonNode r : v.get("riders")) {
            assertEquals(r.get("partition").asInt(), Wire.partition(UUID.fromString(r.get("id").asText()), partitions), r.toString());
        }
        for (JsonNode b : v.get("blocks")) {
            long block = Wire.block(b.get("lat").asDouble(), b.get("lng").asDouble());
            assertEquals(b.get("block").asLong(), block, b.toString());
            assertEquals(b.get("partition").asInt(), Wire.blockPartition(block, partitions), b.toString());
        }
    }

    @Test
    void blocksInCoversABoxAcrossBlockEdges() {
        List<Long> got = Wire.blocksIn(17.44, 78.34, 17.51, 78.41);
        assertEquals(9, got.size()); // 3 rows by 3 columns
        assertEquals(Wire.block(17.44, 78.34), got.get(0));
        assertEquals(Wire.block(17.51, 78.41), got.get(8));
    }

    @Test
    void idsAreSixteenBytesOrNone() {
        assertNull(Wire.uuid(new byte[0]));
        assertArrayEquals(Wire.bytes(RIDER), Wire.bytes(Wire.uuid(Wire.bytes(RIDER))));
        assertEquals("1f0e2d3c4b5a69788796a5b4c3d2e1f0", Wire.hex(RIDER));
        assertEquals("craves:fleet:rq:{rq3}", Wire.riderStream("craves:fleet:", 3));
        assertEquals("craves:fleet:dq:{dq15}", Wire.dispatchStream("craves:fleet:", 15));
    }
}
