package in.craves.fleetengine;

import io.lettuce.core.AbstractRedisClient;
import io.lettuce.core.ClientOptions;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.RedisException;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.RedisURI;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.SslOptions;
import io.lettuce.core.TimeoutOptions;
import io.lettuce.core.api.StatefulConnection;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.cluster.ClusterClientOptions;
import io.lettuce.core.cluster.ClusterTopologyRefreshOptions;
import io.lettuce.core.cluster.RedisClusterClient;
import io.lettuce.core.cluster.api.StatefulRedisClusterConnection;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import io.lettuce.core.cluster.models.partitions.RedisClusterNode;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.metrics.CommandLatencyRecorder;
import io.lettuce.core.resource.ClientResources;
import io.lettuce.core.resource.DefaultClientResources;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;

/**
 * The engine's Redis connections (Lettuce, byte arrays both ways). A server in cluster mode (Azure Managed Redis with the
 * OSS clustering policy, Craves's) gets a cluster client, which follows the slot map, MOVED and ASK and refreshes the map
 * after a failover; a server without cluster support gets a plain client. Over TLS (a rediss:// URL) every node's
 * certificate is checked against the cache's own name, also for nodes the cluster announces by IP. Commands fail fast
 * while a connection is down (they are never queued for later), and time out after the URL's timeout (5 s by default).
 */
public final class RedisSetup implements AutoCloseable {
    static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final ClientResources resources;
    private final AbstractRedisClient client;
    private final RedisURI uri;
    private final boolean cluster;
    private final int shards;

    private RedisSetup(ClientResources resources, AbstractRedisClient client, RedisURI uri, boolean cluster, int shards) {
        this.resources = resources;
        this.client = client;
        this.uri = uri;
        this.cluster = cluster;
        this.shards = shards;
    }

    /** Connects to the URL's server and finds out whether it is a cluster. The exception never repeats the URL: it holds a key. */
    public static RedisSetup connect(String url) {
        RedisURI uri;
        try {
            uri = RedisURI.create(url);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("FLEET_ENGINE_REDIS_URL must be redis://[user:password@]host:port or rediss://...");
        }
        uri.setTimeout(TIMEOUT);
        ClientResources resources = DefaultClientResources.builder().commandLatencyRecorder(CommandLatencyRecorder.disabled()).build();
        String host = uri.getHost();
        SslOptions ssl = SslOptions.builder().jdkSslProvider().sslParameters(() -> {
            SSLParameters parameters = new SSLParameters();
            parameters.setServerNames(List.of(new SNIHostName(host))); // the certificate is checked against this name
            return parameters;
        }).build();
        SocketOptions socket = SocketOptions.builder().connectTimeout(TIMEOUT).keepAlive(true).build();
        TimeoutOptions timeouts = TimeoutOptions.enabled(TIMEOUT);
        RedisClient plain = RedisClient.create(resources, uri);
        plain.setOptions(ClientOptions.builder().sslOptions(ssl).socketOptions(socket).timeoutOptions(timeouts)
            .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS).build());
        boolean cluster;
        try (StatefulRedisConnection<byte[], byte[]> probe = plain.connect(ByteArrayCodec.INSTANCE)) {
            try {
                probe.sync().clusterInfo();
                cluster = true;
            } catch (RedisCommandExecutionException e) {
                String message = String.valueOf(e.getMessage()).toLowerCase();
                if (!message.contains("cluster support disabled") && !message.contains("unknown command")) {
                    throw e;
                }
                cluster = false;
            }
        } catch (RuntimeException e) {
            plain.shutdown(Duration.ZERO, Duration.ofSeconds(2));
            resources.shutdown(0, 2, TimeUnit.SECONDS);
            throw e;
        }
        if (!cluster) {
            return new RedisSetup(resources, plain, uri, false, 1);
        }
        plain.shutdown(Duration.ZERO, Duration.ofSeconds(2));
        RedisClusterClient clustered = RedisClusterClient.create(resources, uri);
        clustered.setOptions(ClusterClientOptions.builder().sslOptions(ssl).socketOptions(socket).timeoutOptions(timeouts)
            .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
            .topologyRefreshOptions(ClusterTopologyRefreshOptions.builder().enablePeriodicRefresh(Duration.ofSeconds(30))
                .enableAllAdaptiveRefreshTriggers().build())
            .build());
        try {
            int masters = (int) clustered.getPartitions().stream().filter(node -> node.is(RedisClusterNode.NodeFlag.UPSTREAM)).count();
            return new RedisSetup(resources, clustered, uri, true, Math.max(1, masters));
        } catch (RuntimeException e) {
            clustered.shutdown(Duration.ZERO, Duration.ofSeconds(2));
            resources.shutdown(0, 2, TimeUnit.SECONDS);
            throw e;
        }
    }

    /** A new connection: each stream reader has its own (XREAD BLOCK holds it), and one is shared for everything else. */
    public Conn open() {
        if (cluster) {
            StatefulRedisClusterConnection<byte[], byte[]> c = ((RedisClusterClient) client).connect(ByteArrayCodec.INSTANCE);
            return new Conn(c, c.async());
        }
        StatefulRedisConnection<byte[], byte[]> c = ((RedisClient) client).connect(ByteArrayCodec.INSTANCE);
        return new Conn(c, c.async());
    }

    public boolean cluster() {
        return cluster;
    }

    /** The nodes that own hash slots: 1 for a server without cluster support or a one-shard cluster. */
    public int shards() {
        return shards;
    }

    /** host:port, for logs (never the URL: it holds a key). */
    public String address() {
        return uri.getHost() + ":" + uri.getPort();
    }

    @Override
    public void close() {
        client.shutdown(Duration.ZERO, Duration.ofSeconds(2));
        resources.shutdown(0, 2, TimeUnit.SECONDS);
    }

    /** One connection; async works on a plain and a cluster connection alike. */
    public static final class Conn implements AutoCloseable {
        private final StatefulConnection<byte[], byte[]> connection;
        private final AtomicBoolean closed = new AtomicBoolean();
        public final RedisClusterAsyncCommands<byte[], byte[]> async;

        Conn(StatefulConnection<byte[], byte[]> connection, RedisClusterAsyncCommands<byte[], byte[]> async) {
            this.connection = connection;
            this.async = async;
        }

        /**
         * Holds this connection's commands until flush(), so a batch goes out in a few writes instead of one a command (a
         * rider event costs about a third less engine CPU). Only for a connection one thread uses: another thread's commands
         * would wait for this one's flush.
         */
        public void holdWrites(boolean hold) {
            connection.setAutoFlushCommands(!hold);
        }

        /** Sends the commands held since the last flush. */
        public void flush() {
            connection.flushCommands();
        }

        @Override
        public void close() {
            if (closed.compareAndSet(false, true)) { // a stopped reader's connection is closed by the stop and by the reader
                connection.closeAsync();
            }
        }
    }

    /** A command's result; its failure as a RedisException (a timeout is one too). */
    public static <T> T await(RedisFuture<T> future) {
        try {
            return future.get(TIMEOUT.toMillis() + 1_000, TimeUnit.MILLISECONDS);
        } catch (ExecutionException e) {
            throw failure(e);
        } catch (CancellationException e) {
            throw new RedisException("cancelled: the connection closed", e);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new RedisException("Redis did not answer in time");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new RedisException("interrupted");
        }
    }

    /**
     * As await(future), on a connection whose writes are held (Conn.holdWrites): flush runs again every 20 ms while it waits,
     * because a command a cluster node redirects (MOVED, ASK) is written again into the held buffer.
     */
    public static <T> T await(RedisFuture<T> future, Runnable flush) {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT.toMillis() + 1_000);
        while (true) {
            try {
                return future.get(20, TimeUnit.MILLISECONDS);
            } catch (ExecutionException e) {
                throw failure(e);
            } catch (CancellationException e) {
                throw new RedisException("cancelled: the connection closed", e);
            } catch (TimeoutException e) {
                if (System.nanoTime() >= deadline) {
                    future.cancel(true);
                    throw new RedisException("Redis did not answer in time");
                }
                try {
                    flush.run();
                } catch (RuntimeException closed) {
                    // a closed connection cancels its commands: the next wait reports it
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                future.cancel(true);
                throw new RedisException("interrupted");
            }
        }
    }

    private static RedisException failure(ExecutionException e) {
        Throwable cause = e.getCause();
        return cause instanceof RedisException redis ? redis : new RedisException(cause);
    }
}
