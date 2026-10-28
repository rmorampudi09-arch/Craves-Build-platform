package in.craves.integration.fleet.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.integration.fleet.engine.FleetEngineWire.Candidate;
import in.craves.integration.fleet.engine.FleetEngineWire.DispatchReply;
import in.craves.integration.fleet.engine.FleetEngineWire.Policy;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.async.RedisAsyncCommands;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/** Live dispatch through the engine: an answer within the timeout is used; anything else leaves dispatch to rank riders itself. */
class FleetEngineClientTest {
    static final UUID ORDER = UUID.fromString("5d3e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b");
    static final UUID NEAR = UUID.randomUUID();
    static final UUID FAR = UUID.randomUUID();
    static final UUID OFFERED = UUID.randomUUID();
    static final Policy POLICY = new Policy(5_000, 130, 3, 1_500, 40, true, false, false, "");
    final Engine engine = new Engine();

    @Test
    void theEnginesAnswerComesBackInItsOrder() {
        List<Candidate> riders = List.of(new Candidate(NEAR, 300, 17.45, 78.39, true, 12_000, 1_000, 0, true),
            new Candidate(FAR, 1_200, 17.46, 78.39, false, 0, 0, 2_500, false));
        engine.answer = request -> new DispatchReply(request, riders, 1, 1, System.currentTimeMillis());
        assertThat(client("live").rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(OFFERED), 2)).contains(riders);

        assertThat(engine.streams).as("vectors.json: this kitchen's block is in partition 13").containsExactly("craves:fleet:dq:{dq13}");
        Map<Integer, List<Object>> request = fields(engine.payloads.get(0));
        assertThat(request.get(2)).as("LIVE").containsExactly(2L);
        assertThat((byte[]) request.get(3).get(0)).isEqualTo(FleetEngineWire.bytes(ORDER));
        assertThat((long) request.get(5).get(0) - (long) request.get(4).get(0)).as("it may answer for 50 ms").isEqualTo(50);
        assertThat((byte[]) request.get(12).get(0)).as("riders already offered").isEqualTo(FleetEngineWire.bytes(OFFERED));
        assertThat(request.get(14)).as("the round").containsExactly(2L);
        assertThat(request).as("no ranking of Java's to compare").doesNotContainKey(13);
    }

    @Test
    void withoutAnAnswerInTimeDispatchRanksItself() {
        long started = System.nanoTime();
        assertThat(client("live").rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(), 1)).isEmpty();
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
    }

    @Test
    void fiveFailuresInARowPauseTheEngineSoDispatchStopsWaitingOnIt() {
        FleetEngineClient client = client("live");
        engine.answer = request -> new DispatchReply(UUID.randomUUID(), List.of(), 1, 1, 1);
        for (int i = 0; i < 4; i++) {
            assertThat(client.rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(), 1)).as("a reply for another request").isEmpty();
        }
        engine.answer = null;
        engine.failure = new IllegalStateException("Redis did not answer in time");
        assertThat(client.rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(), 1)).isEmpty();
        engine.failure = null;
        engine.answer = request -> new DispatchReply(request, List.of(), 1, 1, 1);
        int asked = engine.payloads.size();
        assertThat(client.rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(), 1)).as("paused").isEmpty();
        assertThat(engine.payloads).as("for 30 s the engine isn't asked").hasSize(asked);
    }

    @Test
    void onlyLiveAsksTheEngine() {
        for (String mode : List.of("off", "shadow")) {
            assertThat(client(mode).rank(ORDER, 17.4483, 78.3915, 17.46, 78.36, 3_500, POLICY, Set.of(), 1)).isEqualTo(Optional.empty());
        }
        assertThat(engine.payloads).isEmpty();
    }

    @Test
    void aSettingThatCantBeUsedIsReplacedSoTheServiceStillStarts() {
        FleetEngineProperties typo = new FleetEngineProperties(" Shadwo ", false, 0, 2_000, 1, 10, 1, " ");
        assertThat(typo.mode()).isEqualTo("off");
        assertThat(typo.riderPartitions()).isEqualTo(16);
        assertThat(typo.dispatchPartitions()).isEqualTo(16);
        assertThat(typo.streamKeepSeconds()).isEqualTo(60);
        assertThat(typo.replyTimeoutMs()).isEqualTo(50);
        assertThat(typo.queueCapacity()).isEqualTo(100);
        assertThat(typo.keyPrefix()).isEqualTo("craves:fleet:");
        assertThat(new FleetEngineProperties("false", false, 16, 16, 120, 300, 10_000, null).mode()).as("YAML's bare off").isEqualTo("off");
        FleetEngineProperties live = new FleetEngineProperties(" LIVE", true, 32, 8, 99_999, 9_000, 10_000, "x:");
        assertThat(live.live()).isTrue();
        assertThat(live.streamKeepSeconds()).isEqualTo(3_600);
        assertThat(live.replyTimeoutMs()).isEqualTo(2_000);

        // The settings bind as text, so words that aren't numbers or flags can't stop the service; each gets its default.
        FleetEngineProperties typed = new FleetEngineProperties.Settings("live", "enabled", "16", " 8 ", "120", "300ms", "10k", null).parsed();
        assertThat(typed.live()).isTrue();
        assertThat(typed.joint()).as("enabled is not true").isFalse();
        assertThat(typed.dispatchPartitions()).isEqualTo(8);
        assertThat(typed.replyTimeoutMs()).as("300ms").isEqualTo(300);
        assertThat(typed.queueCapacity()).as("10k").isEqualTo(10_000);
        FleetEngineProperties unset = new FleetEngineProperties.Settings(null, " TRUE ", null, null, null, null, null, null).parsed();
        assertThat(unset.mode()).isEqualTo("off");
        assertThat(unset.joint()).isTrue();
        assertThat(unset.riderPartitions()).isEqualTo(16);
        assertThat(unset.streamKeepSeconds()).isEqualTo(120);
        assertThat(RedisEngineStreams.entryMs("1793180000123-7")).as("a stream id's milliseconds, Redis's clock").isEqualTo(1_793_180_000_123L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void nothingIsSentOnAConnectionThatIsDown() {
        RedisAsyncCommands<byte[], byte[]> commands = mock(RedisAsyncCommands.class);
        StatefulRedisConnection<byte[], byte[]> connection = mock(StatefulRedisConnection.class);
        when(commands.getStatefulConnection()).thenReturn(connection);
        when(connection.isOpen()).thenReturn(false);
        assertThat(RedisEngineStreams.open(commands)).as("down: Lettuce would queue everything and replay it at once").isFalse();
        when(connection.isOpen()).thenReturn(true);
        assertThat(RedisEngineStreams.open(commands)).isTrue();
    }

    FleetEngineClient client(String mode) {
        return new FleetEngineClient(new FleetEngineProperties(mode, false, 16, 16, 120, 50, 10_000, null), engine);
    }

    /** The fields of a protobuf message, by number: varints as Long, bytes as byte[]. */
    static Map<Integer, List<Object>> fields(byte[] message) {
        FleetEngineWire.In in = new FleetEngineWire.In(message, 0, message.length);
        Map<Integer, List<Object>> fields = new TreeMap<>();
        while (in.more()) {
            long tag = in.varint();
            int type = (int) (tag & 7);
            Object value = switch (type) {
                case 0 -> in.number(0);
                case 1 -> in.dbl(1);
                case 2 -> in.bytes(2);
                default -> throw new IllegalArgumentException("wire type " + type);
            };
            fields.computeIfAbsent((int) (tag >>> 3), number -> new ArrayList<>()).add(value);
        }
        return fields;
    }

    /** Redis with the engine behind it: a request's reply appears as soon as it is appended, if the engine answers. */
    static final class Engine implements EngineStreams {
        @Override
        public void set(String key, byte[] value, Duration keep, Duration wait) {
            replies.put(key, value);
        }

        final List<String> streams = new ArrayList<>();
        final List<byte[]> payloads = new ArrayList<>();
        final Map<String, byte[]> replies = new ConcurrentHashMap<>();
        volatile Function<UUID, DispatchReply> answer;
        volatile RuntimeException failure;

        @Override
        public synchronized void append(List<Entry> entries, Duration keep, Duration wait) {
            if (failure != null) {
                throw failure;
            }
            for (Entry entry : entries) {
                streams.add(entry.stream());
                payloads.add(entry.payload());
                // Field 1, the request id: 0a 10, then its 16 bytes.
                UUID requestId = FleetEngineWire.uuid(Arrays.copyOfRange(entry.payload(), 2, 18));
                Function<UUID, DispatchReply> engine = answer;
                if (engine != null) {
                    replies.put(FleetEngineWire.replyKey("craves:fleet:", requestId), FleetEngineWire.encode(engine.apply(requestId)));
                }
            }
        }

        @Override
        public byte[] get(String key, Duration wait) {
            if (failure != null) {
                throw failure;
            }
            return replies.get(key);
        }
    }
}
