package in.craves.fleetengine.ingest;

import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.lease.LeaseManager;
import io.lettuce.core.RedisException;
import io.lettuce.core.StreamMessage;
import io.lettuce.core.XReadArgs;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Reads one of the engine's Redis Streams partitions (docs/riders/SCALE.md, "Streams"): rider events from
 * integration-service's /locations calls and state changes, or dispatch requests. A partition is read by one thread on one
 * connection of its own (XREAD BLOCK), in order, in batches; a slow Redis slows the reader, and the stream (trimmed by
 * integration-service by age) holds what waits, so memory stays bounded.
 */
public final class StreamReader {
    private static final Logger LOG = LoggerFactory.getLogger(StreamReader.class);
    private static final byte[] FIELD = {'e'};

    private StreamReader() {
    }

    /** One stream entry: its id and its payload (field "e"; null when missing). */
    public record Entry(String id, byte[] payload) {
    }

    /** Handles one batch, on the reader's own connection. */
    public interface Handler {
        void handle(RedisSetup.Conn conn, List<Entry> entries);
    }

    /**
     * The stream position replayMs before now: a reader that takes over a partition starts there, so the last minute's
     * events rebuild the state (rider writes are newest-wins, so seeing one twice changes nothing).
     */
    public static String from(long nowMs, long replayMs) {
        return (nowMs - replayMs) + "-0";
    }

    /** The time Redis gave an entry (the first part of its id). */
    public static long entryMs(String id) {
        int dash = id.indexOf('-');
        try {
            return Long.parseLong(dash > 0 ? id.substring(0, dash) : id);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Hands the stream's entries after from to handler, in batches of up to count, until stop. It reconnects after an error
     * (the cluster client follows MOVED and reloads the slot map) and never hands a batch over twice: a batch whose handling
     * fails is logged and passed over, so one bad entry can't stop the partition.
     */
    @SuppressWarnings("unchecked") // XREAD of one stream: a generic varargs array of one offset
    public static void read(RedisSetup redis, String stream, String from, int count, Handler handler, LeaseManager.Stop stop) {
        byte[] key = stream.getBytes(StandardCharsets.US_ASCII);
        String last = from;
        RedisSetup.Conn conn = null;
        long loggedAt = 0;
        try {
            while (!stop.stopped() && !Thread.currentThread().isInterrupted()) {
                if (conn == null) {
                    try {
                        conn = redis.open();
                        stop.closeOnStop(conn); // a stopped reader ends at once, not after its BLOCK
                    } catch (RuntimeException e) {
                        loggedAt = failed(stream, e, loggedAt);
                        pause(500);
                        continue;
                    }
                }
                List<StreamMessage<byte[], byte[]>> messages;
                try {
                    messages = RedisSetup.await(conn.async.xread(XReadArgs.Builder.count(count).block(1_000),
                        XReadArgs.StreamOffset.from(key, last)));
                } catch (RedisException e) {
                    conn.close();
                    conn = null;
                    if (stop.stopped()) {
                        return;
                    }
                    loggedAt = failed(stream, e, loggedAt);
                    pause(200);
                    continue;
                }
                if (messages == null || messages.isEmpty()) {
                    continue;
                }
                List<Entry> entries = new ArrayList<>(messages.size());
                for (StreamMessage<byte[], byte[]> m : messages) {
                    entries.add(new Entry(m.getId(), payload(m.getBody())));
                }
                try {
                    handler.handle(conn, entries);
                } catch (RuntimeException e) {
                    LOG.error("FLEET_ENGINE_BATCH_FAILED stream={} entries={} first={} error={}", stream, entries.size(),
                        entries.get(0).id(), e.toString());
                }
                last = entries.get(entries.size() - 1).id();
            }
        } finally {
            if (conn != null) {
                conn.close();
            }
        }
    }

    private static byte[] payload(Map<byte[], byte[]> body) {
        if (body == null) {
            return null;
        }
        for (Map.Entry<byte[], byte[]> field : body.entrySet()) {
            if (Arrays.equals(field.getKey(), FIELD)) {
                return field.getValue();
            }
        }
        return null;
    }

    private static long failed(String stream, RuntimeException e, long loggedAt) {
        long now = System.currentTimeMillis();
        if (now - loggedAt < 60_000) {
            return loggedAt;
        }
        LOG.warn("FLEET_ENGINE_READ_FAILED stream={} error={}", stream, e.toString());
        return now;
    }

    private static void pause(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
