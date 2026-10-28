package in.craves.integration.fleet.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.engine.FleetEngineWire.Candidate;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchReply;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchRequest;
import in.craves.integration.fleet.engine.FleetEngineWire.Fix;
import in.craves.integration.fleet.engine.FleetEngineWire.Policy;
import in.craves.integration.fleet.engine.FleetEngineWire.RiderEvent;
import in.craves.integration.fleet.engine.FleetEngineWire.Standing;
import in.craves.integration.fleet.engine.FleetEngineWire.State;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * integration-service and the fleet engine write and read the same bytes: both are tested against
 * contracts/proto/craves/fleet/v1/testdata (the engine's side in services/fleet-engine WireTest), which protoc-generated code
 * also reads.
 */
class FleetEngineWireTest {
    static final UUID RIDER = UUID.fromString("1f0e2d3c-4b5a-6978-8796-a5b4c3d2e1f0");
    static final UUID RIDER_2 = UUID.fromString("7c9e6679-7425-40de-944b-e07fc1f90ae7");
    static final UUID SHIFT = UUID.fromString("0b2c4d6e-8f10-4a2b-9c3d-4e5f60718293");
    static final UUID ORDER = UUID.fromString("5d3e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b");
    static final UUID REQUEST = UUID.fromString("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d");
    static final DispatchReply REPLY = new DispatchReply(REQUEST, List.of(
        new Candidate(RIDER, 412.75, 17.4486, 78.3908, true, 15_000, 1_761_639_000_000L, 3_240, true),
        new Candidate(RIDER_2, 1630.5, 17.4601, 78.3999, false, 0, 0, 0, false)), 3, 2, 1_761_640_003_042L);

    /** The same messages as the engine's WireTest.goldens(). */
    static Map<String, byte[]> encoded() {
        Fix first = new Fix(17.4486, 78.3908, 1_761_640_000_000L, false, 8.5f);
        RiderEvent ping = new RiderEvent(RIDER, FleetEngineWire.PING, 1_761_640_000_123L,
            List.of(first, new Fix(17.449, 78.3911, 1_761_640_005_000L, true, 12.25f)),
            new State(SHIFT, 1_761_683_200_000L, true, false, 0, 0, false, 2_000, 0, 17.47, 78.35, 1_761_643_600_000L, true,
                1_761_640_000_123L, null, 0), null);
        RiderEvent refresh = new RiderEvent(RIDER, FleetEngineWire.REFRESH, 1_761_640_001_500L, List.of(),
            new State(SHIFT, 1_761_683_200_000L, true, false, 1_761_640_040_000L, 1_761_640_900_000L, true, 0, 8_000, null, null, 0, true,
                1_761_640_000_123L, first, 1_761_640_000_000L), new Standing(20_261_028, 45_000, 7_200, true, 1_761_639_000_000L));
        RiderEvent offline = new RiderEvent(RIDER_2, FleetEngineWire.OFFLINE, 1_761_640_002_000L, List.of(), null, null);
        DispatchRequest live = new DispatchRequest(REQUEST, FleetEngineWire.LIVE, ORDER, 1_761_640_003_000L, 1_761_640_003_300L, 17.4483, 78.3915,
            17.46, 78.36, 4_200, new Policy(5_000, 140, 1, 1_500, 40, true, true), List.of(RIDER_2), List.of(), 2);
        DispatchRequest shadow = new DispatchRequest(REQUEST, FleetEngineWire.SHADOW, ORDER, 1_761_640_003_000L, 0, 17.4483, 78.3915, 17.46,
            78.36, 4_200, new Policy(5_000, 140, 3, 0, 40, false, false), List.of(), List.of(
                new Candidate(RIDER, 412.75, 17.4486, 78.3908, true, 15_000, 1_761_639_000_000L, 3_240, false),
                new Candidate(RIDER_2, 1630.5, 17.4601, 78.3999, false, 0, 0, 0, false)), 1);
        return Map.of("rider_event_ping", FleetEngineWire.encode(ping), "rider_event_refresh", FleetEngineWire.encode(refresh),
            "rider_event_offline", FleetEngineWire.encode(offline), "dispatch_request_live", FleetEngineWire.encode(live),
            "dispatch_request_shadow", FleetEngineWire.encode(shadow), "dispatch_reply", FleetEngineWire.encode(REPLY));
    }

    @Test
    void eventsAreWrittenByteForByteAsTheEngineWritesThem() throws IOException {
        for (Map.Entry<String, byte[]> golden : encoded().entrySet()) {
            assertThat(HexFormat.of().formatHex(golden.getValue())).as(golden.getKey()).isEqualTo(golden(golden.getKey()));
        }
    }

    @Test
    void theEnginesReplyReadsBackAsItWasWritten() throws IOException {
        DispatchReply read = FleetEngineWire.decodeReply(HexFormat.of().parseHex(golden("dispatch_reply")));
        assertThat(read).isEqualTo(REPLY);
        assertThat(read.riders().get(0).held()).as("held for this order").isTrue();
    }

    @Test
    void partitionsAndBlocksAreTheEngines() throws IOException {
        JsonNode vectors = new ObjectMapper().readTree(Files.readString(testdata().resolve("vectors.json")));
        int partitions = vectors.get("partitions").asInt();
        for (JsonNode rider : vectors.get("riders")) {
            assertThat(FleetEngineWire.partition(UUID.fromString(rider.get("id").asText()), partitions)).as(rider.get("id").asText())
                .isEqualTo(rider.get("partition").asInt());
        }
        for (JsonNode block : vectors.get("blocks")) {
            long id = FleetEngineWire.block(block.get("lat").asDouble(), block.get("lng").asDouble());
            assertThat(id).as(block.toString()).isEqualTo(block.get("block").asLong());
            assertThat(FleetEngineWire.blockPartition(id, partitions)).as(block.toString()).isEqualTo(block.get("partition").asInt());
        }
        assertThat(FleetEngineWire.riderStream("craves:fleet:", 4)).isEqualTo("craves:fleet:rq:{rq4}");
        assertThat(FleetEngineWire.dispatchStream("craves:fleet:", 13)).isEqualTo("craves:fleet:dq:{dq13}");
        assertThat(FleetEngineWire.replyKey("craves:fleet:", REQUEST)).isEqualTo("craves:fleet:reply:{9a8b7c6d5e4f4a3b8c2d1e0f9a8b7c6d}");
    }

    @Test
    void negativeNumbersAndUnknownFieldsReadAsProtobufDefines() {
        // int32 -1 is ten bytes on the wire, as protoc writes it.
        byte[] state = FleetEngineWire.encode(new RiderEvent(RIDER, FleetEngineWire.REFRESH, 1, List.of(),
            new State(null, 0, false, false, 0, 0, false, -1, 0, null, null, 0, false, 0, null, 0), null));
        assertThat(HexFormat.of().formatHex(state)).endsWith("2a0b40ffffffffffffffffff01");
        DispatchReply negative = new DispatchReply(REQUEST, List.of(new Candidate(RIDER, 1, 2, 3, false, -5, -6, -7, false)), 1, 1, 1);
        assertThat(FleetEngineWire.decodeReply(FleetEngineWire.encode(negative))).isEqualTo(negative);
        // A newer engine's field 15 (a string) and field 14 (a varint) are skipped.
        byte[] reply = FleetEngineWire.encode(REPLY);
        byte[] newer = Arrays.copyOf(reply, reply.length + 6);
        System.arraycopy(new byte[] {0x7a, 0x02, 'o', 'k', 0x70, 0x01}, 0, newer, reply.length, 6);
        assertThat(FleetEngineWire.decodeReply(newer)).isEqualTo(REPLY);
    }

    @Test
    void aBrokenReplyIsRefusedRatherThanMisread() {
        byte[] reply = FleetEngineWire.encode(REPLY);
        assertThatThrownBy(() -> FleetEngineWire.decodeReply(Arrays.copyOf(reply, reply.length - 3))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FleetEngineWire.decodeReply(new byte[] {0x0a, 0x03, 1, 2, 3})).as("an id of 3 bytes")
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FleetEngineWire.decodeReply(new byte[] {0x19, 0, 0})).as("field 3 as a double")
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FleetEngineWire.decodeReply(new byte[] {0x7a, (byte) 0xff, (byte) 0xff, (byte) 0xff, (byte) 0xff, 0x0f}))
            .as("a length past the end").isInstanceOf(IllegalArgumentException.class);
    }

    static String golden(String name) throws IOException {
        return Files.readString(testdata().resolve(name + ".hex")).trim();
    }

    /** contracts/proto/craves/fleet/v1/testdata, found from the directory the tests run in (the module's, under Maven). */
    static Path testdata() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve("contracts/proto/craves/fleet/v1/testdata");
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("contracts/proto/craves/fleet/v1/testdata not found above " + Path.of("").toAbsolutePath());
    }
}
