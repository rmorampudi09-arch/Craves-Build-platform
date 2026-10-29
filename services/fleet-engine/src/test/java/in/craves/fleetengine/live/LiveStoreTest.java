package in.craves.fleetengine.live;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.RedisTestSupport;
import in.craves.fleetengine.rules.Rider;
import in.craves.fleetengine.rules.Rules;
import in.craves.fleetengine.wire.Wire;
import io.lettuce.core.GeoCoordinates;
import io.lettuce.core.RedisFuture;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The live state on a three-node Redis cluster, as Craves's Azure Managed Redis runs (OSS clustering). */
class LiveStoreTest {
    static final long AT = 1793160000000L; // 28 Oct 2026, 09:30 IST
    static RedisSetup redis;
    static RedisSetup.Conn conn;
    LiveStore store;

    @BeforeAll
    static void cluster() {
        redis = RedisSetup.connect(RedisTestSupport.cluster());
        conn = redis.open();
    }

    @AfterAll
    static void close() {
        if (conn != null) {
            conn.close();
            redis.close();
        }
    }

    @BeforeEach
    void store() {
        store = new LiveStore(RedisTestSupport.prefix(), 1_800_000);
    }

    static UUID uid(int n) {
        return new UUID(0xab00000000000000L, n);
    }

    static Wire.RiderEvent ping(UUID id, long ms, double lat, double lng, boolean active) {
        return new Wire.RiderEvent(id, Wire.PING, ms,
            List.of(new Wire.Fix(lat - 0.001, lng, ms - 6_000, false, 0), new Wire.Fix(lat, lng, ms - 1_000, false, 6)),
            new Wire.State(uid(99), ms + 3_600_000, active, false, 0, 0, false, 2000, 0, null, null, 0, true, ms, null, 0), null);
    }

    static Wire.RiderEvent ping(UUID id, long ms, double lat, double lng) {
        return ping(id, ms, lat, lng, true);
    }

    Map<UUID, Rider> near(double lat, double lng) {
        Map<UUID, Rider> out = new HashMap<>();
        for (Rider r : store.near(conn.async, List.of(new LiveStore.Centre(lat, lng, 5000)))) {
            out.put(r.id, r);
        }
        return out;
    }

    void apply(Wire.RiderEvent... events) {
        LiveStore.Applied res = store.apply(conn.async, List.of(events));
        assertEquals(0, res.errors(), () -> String.valueOf(res.firstError()));
    }

    byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    @Test
    void aPingPutsTheRiderOnTheMapAndTheNewestWins() {
        apply(ping(uid(1), AT, 17.4486, 78.3908));
        Rider got = near(17.4483, 78.3915).get(uid(1));
        assertNotNull(got, "the rider is on the map");
        assertEquals(17.4486, got.lat);
        assertEquals(78.3908, got.lng);
        assertEquals(AT - 1_000, got.fixMs);
        assertEquals(AT, got.seenMs);
        assertTrue(got.hasShift && got.active && got.testAllowed);
        assertEquals(AT + 3_600_000, got.shiftEndsMs);
        assertEquals(2000, got.maxPickupM);
        assertFalse(got.hasStanding);

        // An older ping (a resent batch) moves nothing back; its state is older too.
        apply(ping(uid(1), AT - 10_000, 17.40, 78.30, false));
        got = near(17.4483, 78.3915).get(uid(1));
        assertEquals(17.4486, got.lat);
        assertTrue(got.active);
        assertEquals(AT, got.seenMs);

        // A refresh carries the day's standing and an open offer.
        apply(new Wire.RiderEvent(uid(1), Wire.REFRESH, AT + 500, List.of(),
            new Wire.State(uid(99), AT + 3_600_000, true, false, AT + 40_000, 0, false, 0, 0, null, null, 0, true, AT, null, AT + 400),
            new Wire.Standing(Rules.istDay(AT), 45_000, 7_200, true, AT - 600_000)));
        got = near(17.4483, 78.3915).get(uid(1));
        assertTrue(got.hasStanding);
        assertEquals(45_000, got.earnedPaise);
        assertEquals(AT + 500, got.standAtMs);
        assertEquals(AT + 40_000, got.offeredUntilMs);
        assertEquals(AT + 400, got.offeredFromMs);
        assertEquals(0, got.maxPickupM);
        assertEquals(17.4486, got.lat);
    }

    @Test
    void movingAcrossBlocksAndGoingOffline() {
        apply(ping(uid(2), AT, 17.4486, 78.3908));
        LiveStore.Applied moved = store.apply(conn.async, List.of(ping(uid(2), AT + 10_000, 17.62, 78.52))); // about 22 km NE
        assertEquals(1, moved.moves());
        assertFalse(near(17.4483, 78.3915).containsKey(uid(2)), "still on the map where they were");
        assertTrue(near(17.62, 78.52).containsKey(uid(2)), "on the map where they are");
        byte[] oldBlock = store.blockKey(Wire.block(17.4486, 78.3908));
        assertNull(RedisSetup.await(conn.async.zscore(oldBlock, bytes(Wire.hex(uid(2))))), "the old block still lists the rider");

        // OFFLINE older than the state is ignored; newer removes the rider and their index entry.
        apply(new Wire.RiderEvent(uid(2), Wire.OFFLINE, AT, List.of(), null, null));
        assertTrue(near(17.62, 78.52).containsKey(uid(2)), "an old OFFLINE removed a newer state");
        apply(new Wire.RiderEvent(uid(2), Wire.OFFLINE, AT + 20_000, List.of(), null, null));
        assertFalse(near(17.62, 78.52).containsKey(uid(2)), "offline but still on the map");
        Map<byte[], byte[]> left = RedisSetup.await(conn.async.hgetall(store.riderKey(uid(2))));
        assertEquals(1, left.size());
        assertArrayEquals(bytes("off"), left.keySet().iterator().next());
        assertEquals(0, RedisSetup.await(conn.async.zcard(store.blockKey(Wire.block(17.62, 78.52)))), "the index lists an offline rider");

        // A ping from before going offline that arrives after it is ignored; a newer one brings the rider back.
        apply(ping(uid(2), AT + 15_000, 17.62, 78.52));
        assertFalse(near(17.62, 78.52).containsKey(uid(2)), "an older ping brought an offline rider back");
        assertFalse(store.hold(conn.async, uid(9), List.of(uid(2)), AT, AT + 5_000)[0], "an offline rider was held");
        apply(ping(uid(2), AT + 30_000, 17.62, 78.52));
        assertTrue(near(17.62, 78.52).containsKey(uid(2)), "back online but not on the map");
    }

    @Test
    void aBreakThatEndsIsRememberedForFairTurns() {
        Wire.RiderEvent p = ping(uid(3), AT, 17.4486, 78.3908);
        Wire.State s = p.state();
        Wire.RiderEvent onBreak = new Wire.RiderEvent(uid(3), Wire.PING, AT, p.fixes(), new Wire.State(s.shiftId(), s.shiftEndsMs(),
            true, false, 0, AT + 600_000, false, 2000, 0, null, null, 0, true, AT, null, 0), null);
        apply(onBreak, ping(uid(3), AT + 700_000, 17.4486, 78.3908));
        Rider got = near(17.4483, 78.3915).get(uid(3));
        assertEquals(0, got.breakUntilMs);
        assertEquals(AT + 600_000, got.lastBreakEndMs);
    }

    @Test
    void aStaleIndexEntryIsDroppedWhenRead() throws InterruptedException {
        apply(ping(uid(4), AT, 17.4486, 78.3908));
        RedisSetup.await(conn.async.del(store.riderKey(uid(4)))); // as if the state expired
        assertFalse(near(17.4483, 78.3915).containsKey(uid(4)), "a rider without state was returned");
        byte[] block = store.blockKey(Wire.block(17.4486, 78.3908));
        long deadline = System.currentTimeMillis() + 1_000;
        while (RedisSetup.await(conn.async.zcard(block)) != 0) {
            assertTrue(System.currentTimeMillis() < deadline, "the stale entry stayed in the block index");
            Thread.sleep(10);
        }
    }

    @Test
    void holdsAreACompareAndSet() {
        apply(ping(uid(5), AT, 17.4486, 78.3908));
        UUID a = uid(200);
        UUID b = uid(201);
        boolean[] first = store.hold(conn.async, a, List.of(uid(5), uid(6)), AT, AT + 5_000);
        assertTrue(first[0]);
        assertFalse(first[1], "a rider with no state can't be held");
        assertFalse(store.hold(conn.async, b, List.of(uid(5)), AT + 1_000, AT + 6_000)[0], "another request took a held rider");
        assertTrue(store.hold(conn.async, a, List.of(uid(5)), AT + 1_000, AT + 6_000)[0], "the same request can hold again");
        assertTrue(store.hold(conn.async, b, List.of(uid(5)), AT + 6_001, AT + 11_000)[0], "a hold that ran out still kept the rider");
        Rider got = near(17.4483, 78.3915).get(uid(5));
        assertEquals(AT + 11_000, got.holdUntilMs);
        assertEquals(b, got.holdBy);
    }

    @Test
    void repliesWaitThirtySeconds() {
        store.reply(conn.async, uid(7), new byte[] {1, 2, 3});
        long ttl = RedisSetup.await(conn.async.pttl(store.replyKey(uid(7))));
        assertTrue(ttl > 29_000 && ttl <= 30_000, "ttl " + ttl);
        assertArrayEquals(new byte[] {1, 2, 3}, RedisSetup.await(conn.async.get(store.replyKey(uid(7)))));
    }

    /** Where the block index has the rider, to a metre or so (GEO keeps 52 bits). */
    double[] indexed(UUID id, double lat, double lng) {
        List<GeoCoordinates> at = RedisSetup.await(conn.async.geopos(store.blockKey(Wire.block(lat, lng)), bytes(Wire.hex(id))));
        assertNotNull(at.get(0), "not in the block index");
        return new double[] {at.get(0).getY().doubleValue(), at.get(0).getX().doubleValue()};
    }

    /**
     * A waiting rider's ping costs one command: the index keeps them where it has them until they are 50 m away (near()
     * searches 100 m past the radius), and refreshes them once a minute anyway.
     */
    @Test
    void theIndexMovesARiderOnlyOnceTheyHaveMovedFiftyMetres() {
        double lat = 17.4486;
        double lng = 78.3908;
        apply(ping(uid(11), AT, lat, lng));
        assertEquals(lat, indexed(uid(11), lat, lng)[0], 1e-5);

        double north30 = lat + 30 / 111_195.0;
        apply(ping(uid(11), AT + 10_000, north30, lng));
        assertEquals(lat, indexed(uid(11), lat, lng)[0], 1e-5, "re-indexed for 30 m");
        assertEquals(north30, near(17.4483, 78.3915).get(uid(11)).lat, "the rider's own position is always the newest");

        double north60 = lat + 60 / 111_195.0;
        apply(ping(uid(11), AT + 20_000, north60, lng));
        assertEquals(north60, indexed(uid(11), lat, lng)[0], 1e-5, "not re-indexed at 60 m");

        double north70 = lat + 70 / 111_195.0;
        apply(ping(uid(11), AT + 70_000, north70, lng));
        assertEquals(north60, indexed(uid(11), lat, lng)[0], 1e-5, "re-indexed for 10 m within the minute");
        apply(ping(uid(11), AT + 81_000, north70, lng));
        assertEquals(north70, indexed(uid(11), lat, lng)[0], 1e-5, "not refreshed after a minute");
    }

    /**
     * An index write that fails (here the block's key holds the wrong type) is made again by the rider's next event, not a
     * minute later: where the index has a rider is recorded only once the write has landed.
     */
    @Test
    void anIndexWriteThatFailsIsMadeAgainByTheNextEvent() {
        byte[] block = store.blockKey(Wire.block(17.4486, 78.3908));
        RedisSetup.await(conn.async.set(block, bytes("not a geo set")));
        LiveStore.Applied failed = store.apply(conn.async, List.of(ping(uid(12), AT, 17.4486, 78.3908)));
        assertTrue(failed.errors() > 0, "the index write should have failed");
        RedisSetup.await(conn.async.del(block));
        apply(ping(uid(12), AT + 10_000, 17.4486, 78.3908)); // same spot, ten seconds later
        assertTrue(near(17.4483, 78.3915).containsKey(uid(12)), "missing from the index after the next ping");
    }

    /**
     * A reader's connection closed under a held batch (its lease handed over) fails that batch's commands without an
     * exception escaping, and the riders' next events index them.
     */
    @Test
    void aConnectionClosedUnderAHeldBatchFailsQuietlyAndTheNextEventRepairs() {
        RedisSetup.Conn held = redis.open();
        held.holdWrites(true);
        LiveStore.Applied lost = store.apply(held.async, List.of(ping(uid(13), AT, 17.4486, 78.3908)), held::close);
        assertEquals(1, lost.errors());
        apply(ping(uid(13), AT + 10_000, 17.4486, 78.3908));
        assertTrue(near(17.4483, 78.3915).containsKey(uid(13)));
    }

    /** A rider event reader's connection holds its writes and sends a batch together: every event still lands, on every node. */
    @Test
    void aBatchSentTogetherLandsOnEveryNode() {
        RedisSetup.Conn held = redis.open();
        try {
            held.holdWrites(true);
            List<Wire.RiderEvent> batch = new java.util.ArrayList<>();
            for (int i = 0; i < 64; i++) {
                batch.add(ping(uid(1_000 + i), AT, 17.4486 + i * 0.0001, 78.3908));
            }
            LiveStore.Applied res = store.apply(held.async, batch, held::flush);
            assertEquals(0, res.errors(), () -> String.valueOf(res.firstError()));
            Map<UUID, Rider> got = near(17.4483, 78.3915);
            for (int i = 0; i < 64; i++) {
                assertTrue(got.containsKey(uid(1_000 + i)), "rider " + i + " missing");
            }
        } finally {
            held.holdWrites(false);
            held.close();
        }
    }

    /** Waiting on a held connection flushes again until the answer comes: a redirected command waits in the held buffer. */
    @Test
    void waitingOnHeldWritesFlushesAgainUntilTheAnswerComes() {
        final class Later extends CompletableFuture<String> implements RedisFuture<String> {
            @Override
            public String getError() {
                return null;
            }

            @Override
            public boolean await(long timeout, TimeUnit unit) {
                return isDone();
            }
        }
        Later later = new Later();
        AtomicInteger flushes = new AtomicInteger();
        assertEquals("OK", RedisSetup.await(later, () -> {
            if (flushes.incrementAndGet() == 3) {
                later.complete("OK");
            }
        }));
        assertEquals(3, flushes.get());
    }

    /** A node that forgot its scripts (a restart, a failover) gets them again as EVAL, transparently. */
    @Test
    void scriptsAreLoadedAgainWhereANodeForgotThem() {
        apply(ping(uid(8), AT, 17.4486, 78.3908));
        RedisSetup.await(conn.async.scriptFlush()); // every node of the cluster
        apply(ping(uid(8), AT + 1_000, 17.4487, 78.3908));
        assertEquals(17.4487, near(17.4483, 78.3915).get(uid(8)).lat);
    }
}
