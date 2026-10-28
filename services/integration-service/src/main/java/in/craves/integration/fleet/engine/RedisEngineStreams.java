package in.craves.integration.fleet.engine;

import io.lettuce.core.RedisFuture;
import io.lettuce.core.XAddArgs;
import io.lettuce.core.api.async.RedisAsyncCommands;
import io.lettuce.core.cluster.api.async.RedisAdvancedClusterAsyncCommands;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * EngineStreams on the service's own Redis (SPRING_DATA_REDIS_URL: Azure Managed Redis in production), through Lettuce's
 * asynchronous commands on the connection Spring already shares. A batch of appends is written back to back without
 * waiting for each answer, so it costs about one round trip and no connection of its own (Spring's pipelines open a
 * dedicated connection each time). With spring.data.redis.cluster.nodes set, the same code routes each stream by its
 * {partition} hash tag. Nothing here runs until craves.fleet.engine.mode leaves off.
 * <p>
 * The connection also carries auth's checks, so the engine never queues behind it: while it is disconnected nothing is
 * sent (Lettuce would buffer every command and replay them all at once on reconnecting), a command not answered in time
 * is cancelled, and after a failure Redis is asked again only by one caller at a time, once BACKOFF has passed.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
class RedisEngineStreams implements EngineStreams {
    private static final byte[] FIELD = {'e'};
    private static final long BACKOFF_NANOS = TimeUnit.SECONDS.toNanos(5);
    /** Streams expire this long after their last write, so none outlives the feed being switched off. */
    private static final long EXPIRE_AFTER_KEEP_MS = 60_000;

    private final ObjectProvider<StringRedisTemplate> redis;
    private volatile long retryAtNanos; // 0: healthy
    private final AtomicBoolean probing = new AtomicBoolean();
    /** Redis's clock less this one, from the last entry ids: trimming by age uses Redis's clock, as the ids do. */
    private volatile long serverAheadMs;

    RedisEngineStreams(ObjectProvider<StringRedisTemplate> redis) {
        this.redis = redis;
    }

    @Override
    public void append(List<Entry> entries, Duration keep, Duration wait) {
        if (entries.isEmpty()) {
            return;
        }
        long deadline = System.nanoTime() + wait.toNanos();
        long sentAtMs = System.currentTimeMillis();
        // MINID ~: entries older than keep go, a whole node at a time; ids are the server's milliseconds.
        String oldest = String.valueOf(sentAtMs + serverAheadMs - keep.toMillis());
        run(commands -> {
            List<RedisFuture<String>> added = new ArrayList<>(entries.size());
            Set<String> streams = new LinkedHashSet<>();
            for (Entry entry : entries) {
                // XAddArgs is single use (Lettuce's rule), so one each.
                added.add(commands.xadd(entry.stream().getBytes(StandardCharsets.UTF_8), XAddArgs.Builder.minId(oldest).approximateTrimming(),
                    Map.of(FIELD, entry.payload())));
                streams.add(entry.stream());
            }
            List<RedisFuture<Boolean>> expiring = new ArrayList<>(streams.size());
            for (String stream : streams) {
                expiring.add(commands.pexpire(stream.getBytes(StandardCharsets.UTF_8), keep.toMillis() + EXPIRE_AFTER_KEEP_MS));
            }
            List<RedisFuture<?>> all = new ArrayList<>(added);
            all.addAll(expiring);
            try {
                for (RedisFuture<?> future : all) {
                    await(future, deadline);
                }
            } catch (RuntimeException failure) {
                all.forEach(future -> future.cancel(false)); // nothing left queued behind auth's checks
                throw failure;
            }
            serverAheadMs = entryMs(await(added.get(0), deadline)) - sentAtMs;
            return null;
        });
    }

    @Override
    public byte[] get(String key, Duration wait) {
        long deadline = System.nanoTime() + wait.toNanos();
        return run(commands -> {
            RedisFuture<byte[]> value = commands.get(key.getBytes(StandardCharsets.UTF_8));
            try {
                return await(value, deadline);
            } catch (RuntimeException failure) {
                value.cancel(false);
                throw failure;
            }
        });
    }

    /** Whether the connection under these commands is up (Lettuce's StatefulConnection.isOpen; Spring hands only the commands). */
    static boolean open(RedisClusterAsyncCommands<?, ?> commands) {
        if (commands instanceof RedisAsyncCommands<?, ?> standalone) {
            return standalone.getStatefulConnection().isOpen();
        }
        if (commands instanceof RedisAdvancedClusterAsyncCommands<?, ?> cluster) {
            return cluster.getStatefulConnection().isOpen();
        }
        return true; // another kind: each command's own wait still bounds it
    }

    private <T> T run(Function<RedisClusterAsyncCommands<byte[], byte[]>, T> work) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            throw new IllegalStateException("No Redis is configured (SPRING_DATA_REDIS_URL)");
        }
        boolean probe = retryAtNanos != 0;
        if (probe && (System.nanoTime() < retryAtNanos || !probing.compareAndSet(false, true))) {
            throw new IllegalStateException("Redis failed a moment ago; not asked again yet");
        }
        try {
            T result = template.execute((RedisCallback<T>) connection -> {
                @SuppressWarnings("unchecked")
                RedisClusterAsyncCommands<byte[], byte[]> commands = (RedisClusterAsyncCommands<byte[], byte[]>) connection.getNativeConnection();
                if (!open(commands)) {
                    throw new IllegalStateException("Redis is not connected");
                }
                return work.apply(commands);
            });
            retryAtNanos = 0;
            return result;
        } catch (RuntimeException failure) {
            retryAtNanos = System.nanoTime() + BACKOFF_NANOS;
            throw failure;
        } finally {
            if (probe) {
                probing.set(false);
            }
        }
    }

    /** The milliseconds of a stream entry id (ms-seq). */
    static long entryMs(String id) {
        int dash = id.indexOf('-');
        return Long.parseLong(dash < 0 ? id : id.substring(0, dash));
    }

    private static <T> T await(RedisFuture<T> future, long deadlineNanos) {
        try {
            return future.get(Math.max(0, deadlineNanos - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for Redis", exception);
        } catch (ExecutionException exception) {
            throw new IllegalStateException("Redis refused the command: " + exception.getCause().getMessage(), exception.getCause());
        } catch (TimeoutException exception) {
            throw new IllegalStateException("Redis did not answer in time", exception);
        }
    }
}
