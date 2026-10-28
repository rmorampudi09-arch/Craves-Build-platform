package in.craves.integration.fleet.engine;

import java.time.Duration;
import java.util.List;

/** The fleet engine's Redis, as integration-service uses it: appends to its streams and reads its replies (RedisEngineStreams). */
public interface EngineStreams {
    /**
     * Appends each payload to its stream as the field "e"; each stream keeps about the last keep of entries (older ones are
     * trimmed by age). Throws unless all were taken within wait.
     */
    void append(List<Entry> entries, Duration keep, Duration wait);

    /** The value at key, or null; throws when Redis didn't answer within wait. */
    byte[] get(String key, Duration wait);

    /** Sets key to value for keep; throws unless Redis took it within wait. */
    void set(String key, byte[] value, Duration keep, Duration wait);

    record Entry(String stream, byte[] payload) {
    }
}
