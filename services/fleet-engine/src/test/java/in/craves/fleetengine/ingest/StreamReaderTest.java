package in.craves.fleetengine.ingest;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.RedisTestSupport;
import in.craves.fleetengine.lease.LeaseManager;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

class StreamReaderTest {
    @Test
    void positionsAndEntryTimes() {
        assertEquals("1793160000000-0", StreamReader.from(1793160060000L, 60_000));
        assertEquals(1793160000005L, StreamReader.entryMs("1793160000005-3"));
        assertEquals(0, StreamReader.entryMs("junk"));
    }

    static void xadd(RedisSetup.Conn conn, String stream, String field, byte[] payload) {
        RedisSetup.await(conn.async.xadd(stream.getBytes(StandardCharsets.US_ASCII),
            Map.of(field.getBytes(StandardCharsets.US_ASCII), payload)));
    }

    /**
     * Entries come in order, in batches, after the start position; a batch whose handling fails is passed over, not handed
     * over again, and the reader carries on; a stopped reader ends at once.
     */
    @Test
    void readsInOrderPassesOverAFailedBatchAndStops() throws InterruptedException {
        RedisSetup redis = RedisSetup.connect(RedisTestSupport.cluster());
        try (RedisSetup.Conn conn = redis.open()) {
            String stream = RedisTestSupport.prefix() + "rq:{rq1}";
            xadd(conn, stream, "e", new byte[] {1});
            List<byte[]> seen = new CopyOnWriteArrayList<>();
            LeaseManager.Stop stop = new LeaseManager.Stop();
            Thread reader = Thread.ofVirtual().start(() -> StreamReader.read(redis, stream, "0-0", 2, (c, entries) -> {
                for (StreamReader.Entry e : entries) {
                    if (e.payload() != null && e.payload()[0] == 99) {
                        throw new IllegalStateException("a bad batch");
                    }
                    seen.add(e.payload() == null ? new byte[0] : e.payload());
                }
            }, stop));
            waitFor(() -> seen.size() == 1);
            xadd(conn, stream, "e", new byte[] {99});
            xadd(conn, stream, "x", new byte[] {7}); // no "e": a null payload, handed over all the same
            xadd(conn, stream, "e", new byte[] {3});
            waitFor(() -> seen.size() == 3);
            assertArrayEquals(new byte[] {1}, seen.get(0));
            assertArrayEquals(new byte[0], seen.get(1));
            assertArrayEquals(new byte[] {3}, seen.get(2));
            long stopping = System.currentTimeMillis();
            stop.stop();
            reader.join(3_000);
            assertTrue(!reader.isAlive() && System.currentTimeMillis() - stopping < 1_500, "the reader didn't stop at once");
        } finally {
            redis.close();
        }
    }

    /** After Redis restarts (high availability is off: a patch drops everything), the reader reconnects and reads on. */
    @Test
    void aReaderReconnectsAfterARestart() throws InterruptedException {
        RedisTestSupport.Restartable server = RedisTestSupport.restartable();
        RedisSetup redis = RedisSetup.connect(server.url());
        try {
            String stream = "craves:fleet:rq:{rq2}";
            List<byte[]> seen = new CopyOnWriteArrayList<>();
            LeaseManager.Stop stop = new LeaseManager.Stop();
            Thread reader = Thread.ofVirtual().start(() -> StreamReader.read(redis, stream, "0-0", 16, (c, entries) ->
                entries.forEach(e -> seen.add(e.payload())), stop));
            try (RedisSetup.Conn conn = redis.open()) {
                xadd(conn, stream, "e", new byte[] {1});
            }
            waitFor(() -> seen.size() == 1);
            server.restart();
            long deadline = System.currentTimeMillis() + 10_000;
            while (seen.size() < 2) {
                assertTrue(System.currentTimeMillis() < deadline, "the reader never read again after the restart");
                try (RedisSetup.Conn conn = redis.open()) {
                    xadd(conn, stream, "e", new byte[] {2});
                } catch (RuntimeException e) {
                    // Redis still starting
                }
                Thread.sleep(200);
            }
            assertArrayEquals(new byte[] {2}, seen.get(1));
            stop.stop();
            reader.join(3_000);
        } finally {
            redis.close();
        }
    }

    static void waitFor(BooleanSupplier ok) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (!ok.getAsBoolean()) {
            assertTrue(System.currentTimeMillis() < deadline, "timed out");
            Thread.sleep(10);
        }
    }
}
