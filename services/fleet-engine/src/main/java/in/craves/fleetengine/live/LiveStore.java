package in.craves.fleetengine.live;

import in.craves.fleetengine.RedisSetup;
import in.craves.fleetengine.geo.Geo;
import in.craves.fleetengine.rules.Rider;
import in.craves.fleetengine.wire.Wire;
import io.lettuce.core.GeoArgs;
import io.lettuce.core.GeoSearch;
import io.lettuce.core.KeyValue;
import io.lettuce.core.RedisException;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.RedisNoScriptException;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.SetArgs;
import io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Every online rider's dispatch state in Redis (docs/riders/SCALE.md, "Live state"):
 * <pre>
 *   &lt;prefix&gt;r:{&lt;rider hex&gt;}  hash: the newest fix, the state and the day's standing; it expires when a rider goes quiet
 *   &lt;prefix&gt;g:{&lt;block&gt;}      GEO set of the riders whose newest fix lies in that 0.05° block
 *   &lt;prefix&gt;reply:{&lt;hex&gt;}    a live request's reply, for 30 s
 * </pre>
 * Every write to a rider is one Lua script on that rider's key, atomic and newest-wins, so no lock is taken and no write
 * can go back in time. The block index is kept in step after it and read with a check against the hash, so a stale index
 * entry is harmless and is removed when found. A hold (a rider kept for one order for a few seconds) is a compare-and-set
 * on the same key.
 * <p>Rider hash fields: la ln fm fk fa (newest fix: lat, lng, time, mock, accuracy), bk (its block), ib ix iy gx (where
 * the block index has the rider, written only once the index write has landed, and when), st (state time), sh se ac ot ou
 * of bu cr mp md hh hla hln hu ta (RiderState), sm (heartbeat), be (a break seen running that has ended), sd dy ep os ar fs
 * (standing), hx hb (hold until, held by), off (an OFFLINE's time, alone in the hash after it).
 */
public final class LiveStore {
    /**
     * Writes one event to a rider's hash. The fix wins by fix time, the state and the standing by the event's time; the
     * heartbeat only moves forward. Returns {the block the index has the rider in, the rider's block now, 1 when the index
     * needs the rider's position, lat, lng, the fix time}. The index needs it when it has the rider in another block or not
     * at all, when the rider is 50 m or more from where the index has them, and once a minute: near() searches 100 m past
     * the radius, so the index may lag that far, and a waiting rider's ping costs one Redis command instead of three. Where
     * the index has the rider (ib ix iy gx) is written by STAMP only once the index write has landed, so a write that fails
     * or is never sent is simply made again by the rider's next event. An OFFLINE event newer than the state removes the
     * rider and leaves only its time ('off'), so an older event that arrives after it (two after-commit hooks racing, or two
     * readers overlapping at a takeover) can't bring the rider back.
     */
    static final Script APPLY = new Script("""
        local key = KEYS[1]
        local at = tonumber(ARGV[3])
        if at <= tonumber(redis.call('HGET', key, 'off') or '-1') then
          return {'', '', 0, '', '', ''}
        end
        local was = redis.call('HMGET', key, 'bk', 'ib', 'ix', 'iy')
        local old = was[1] or ''
        local indexed = was[2] or old
        if ARGV[2] == '3' then
          local st = tonumber(redis.call('HGET', key, 'st') or '-1')
          if at >= st then
            redis.call('DEL', key)
            redis.call('HSET', key, 'off', ARGV[3])
            redis.call('PEXPIRE', key, ARGV[1])
            return {indexed, '', 0, '', '', ''}
          end
          return {indexed, indexed, 0, '', '', ''}
        end
        local new = old
        local geo = 0
        if ARGV[4] == '1' then
          local fm = tonumber(redis.call('HGET', key, 'fm') or '-1')
          if tonumber(ARGV[5]) > fm then
            redis.call('HSET', key, 'fm', ARGV[5], 'la', ARGV[6], 'ln', ARGV[7], 'fk', ARGV[8], 'fa', ARGV[9], 'bk', ARGV[10])
            new = ARGV[10]
            if new == indexed and was[3] then
              local dy = (tonumber(ARGV[6]) - tonumber(was[3])) * 111195
              local dx = (tonumber(ARGV[7]) - tonumber(was[4])) * 111195 * math.cos(math.rad(tonumber(ARGV[6])))
              if dy * dy + dx * dx >= 2500 then
                geo = 1
              end
            else
              geo = 1
            end
          end
        end
        if ARGV[11] == '1' then
          local st = tonumber(redis.call('HGET', key, 'st') or '-1')
          if at >= st then
            local ob = redis.call('HGET', key, 'bu')
            if ob and tonumber(ob) > 0 and tonumber(ARGV[18]) == 0 and tonumber(ob) <= at then
              redis.call('HSET', key, 'be', ob)
            end
            redis.call('HSET', key, 'st', ARGV[3], 'sh', ARGV[12], 'se', ARGV[13], 'ac', ARGV[14], 'ot', ARGV[15], 'ou', ARGV[16],
              'of', ARGV[17], 'bu', ARGV[18], 'cr', ARGV[19], 'mp', ARGV[20], 'md', ARGV[21], 'hh', ARGV[22], 'hla', ARGV[23],
              'hln', ARGV[24], 'hu', ARGV[25], 'ta', ARGV[26])
          end
          local sm = tonumber(redis.call('HGET', key, 'sm') or '0')
          if tonumber(ARGV[27]) > sm then
            redis.call('HSET', key, 'sm', ARGV[27])
          end
        end
        if ARGV[28] == '1' then
          local sd = tonumber(redis.call('HGET', key, 'sd') or '-1')
          if at >= sd then
            redis.call('HSET', key, 'sd', ARGV[3], 'dy', ARGV[29], 'ep', ARGV[30], 'os', ARGV[31], 'ar', ARGV[32], 'fs', ARGV[33])
          end
        end
        if geo == 0 and new ~= '' then
          if new ~= indexed or at - tonumber(redis.call('HGET', key, 'gx') or '0') > 60000 then
            geo = 1
          end
        end
        redis.call('PEXPIRE', key, ARGV[1])
        if geo == 1 then
          local p = redis.call('HMGET', key, 'la', 'ln', 'fm')
          return {indexed, new, 1, p[1], p[2], p[3]}
        end
        return {indexed, new, 0, '', '', ''}
        """);

    /**
     * Records where the block index now has the rider (ib ix iy) and when (gx), once that index write has landed, unless a
     * newer fix (or an OFFLINE) has replaced the one indexed meanwhile: then the newer event decides again.
     */
    static final Script STAMP = new Script("""
        if redis.call('HGET', KEYS[1], 'fm') ~= ARGV[1] then return 0 end
        redis.call('HSET', KEYS[1], 'ib', ARGV[2], 'ix', ARGV[3], 'iy', ARGV[4], 'gx', ARGV[5])
        return 1
        """);

    /**
     * Keeps a rider for one request until a time, unless another request holds them; 1 when held. A rider without state
     * (gone, or only an OFFLINE's time) is never held.
     */
    static final Script HOLD = new Script("""
        if redis.call('HEXISTS', KEYS[1], 'st') == 0 then return 0 end
        local h = redis.call('HMGET', KEYS[1], 'hx', 'hb')
        if h[1] and tonumber(h[1]) > tonumber(ARGV[1]) and h[2] ~= ARGV[3] then return 0 end
        redis.call('HSET', KEYS[1], 'hx', ARGV[2], 'hb', ARGV[3])
        return 1
        """);

    private static final byte[][] RIDER_FIELDS = bytes("la", "ln", "fm", "fk", "sm", "sh", "se", "ac", "ot", "ou", "of", "bu", "be",
        "cr", "mp", "md", "hh", "hla", "hln", "hu", "ta", "hx", "hb", "sd", "dy", "ep", "os", "ar", "fs", "bk");
    private static final int BK = 29;
    private static final byte[][] BACK = bytes("bk", "la", "ln");
    private static final byte[] ONE = {'1'};
    private static final byte[] ZERO = {'0'};
    private static final byte[] EMPTY = {};
    private static final HexFormat HEX = HexFormat.of();

    private final String prefix;
    private final byte[] ttl;

    /** ttlMs: how long a quiet rider's state is kept (every event starts it again). */
    public LiveStore(String prefix, long ttlMs) {
        this.prefix = prefix;
        this.ttl = ascii(Long.toString(ttlMs));
    }

    public byte[] riderKey(UUID id) {
        return ascii(prefix + "r:{" + Wire.hex(id) + "}");
    }

    public byte[] blockKey(long block) {
        return ascii(prefix + "g:{" + block + "}");
    }

    public byte[] replyKey(UUID requestId) {
        return ascii(prefix + "reply:{" + Wire.hex(requestId) + "}");
    }

    /** What apply did; firstError: the first failure, or null. */
    public record Applied(int events, int moves, int errors, RuntimeException firstError) {
    }

    /** One order's kitchen and the policy radius. */
    public record Centre(double lat, double lng, int radiusM) {
    }

    /** Writes a batch of rider events (one stream partition's, in order) and keeps the block index in step. */
    public Applied apply(RedisClusterAsyncCommands<byte[], byte[]> redis, List<Wire.RiderEvent> events) {
        return apply(redis, events, null);
    }

    /**
     * As apply(redis, events), on a connection whose writes are held (RedisSetup.Conn.holdWrites): flush sends what is held,
     * so the batch goes out in a few writes rather than one a command (a rider event reader's own connection).
     */
    public Applied apply(RedisClusterAsyncCommands<byte[], byte[]> redis, List<Wire.RiderEvent> events, Runnable flush) {
        List<byte[]> keys = new ArrayList<>(events.size());
        List<byte[][]> args = new ArrayList<>(events.size());
        for (Wire.RiderEvent e : events) {
            keys.add(riderKey(e.riderId()));
            args.add(applyArgs(e));
        }
        List<Object> replies = APPLY.run(redis, keys, args, ScriptOutputType.MULTI, flush);
        int errors = 0;
        int moves = 0;
        RuntimeException first = null;
        List<RedisFuture<?>> index = new ArrayList<>();
        List<Stamp> stamps = new ArrayList<>();
        for (int i = 0; i < events.size(); i++) {
            Object reply = replies.get(i);
            if (reply instanceof RuntimeException failure) {
                errors++;
                first = first == null ? failure : first;
                continue;
            }
            if (!(reply instanceof List<?> r) || r.size() != 6) {
                errors++;
                continue;
            }
            byte[] member = ascii(Wire.hex(events.get(i).riderId()));
            String indexed = text(r.get(0));
            String newBlock = text(r.get(1));
            boolean geo = Long.valueOf(1).equals(r.get(2));
            if (!indexed.isEmpty() && (newBlock.isEmpty() || geo && !indexed.equals(newBlock))) {
                index.add(redis.zrem(ascii(prefix + "g:{" + indexed + "}"), member)); // gone offline, or moved to another block
                moves++;
            }
            if (geo && !newBlock.isEmpty()) {
                byte[] key = ascii(prefix + "g:{" + newBlock + "}");
                RedisFuture<Long> added = redis.geoadd(key, number(r.get(4)), number(r.get(3)), member);
                index.add(added);
                index.add(redis.pexpire(key, 3_600_000));
                stamps.add(new Stamp(keys.get(i), added, new byte[][] {ascii(text(r.get(5))), ascii(newBlock), ascii(text(r.get(3))),
                    ascii(text(r.get(4))), num(events.get(i).atMs())}));
            }
        }
        send(flush);
        Set<RedisFuture<?>> landed = Collections.newSetFromMap(new IdentityHashMap<>());
        for (RedisFuture<?> f : index) {
            try {
                await(f, flush);
                landed.add(f);
            } catch (RedisException e) {
                errors++;
                first = first == null ? e : first;
            }
        }
        // Only the index writes that landed are recorded: one that failed is made again by the rider's next event.
        List<byte[]> stampKeys = new ArrayList<>(stamps.size());
        List<byte[][]> stampArgs = new ArrayList<>(stamps.size());
        for (Stamp st : stamps) {
            if (landed.contains(st.added())) {
                stampKeys.add(st.key());
                stampArgs.add(st.args());
            }
        }
        for (Object stamped : STAMP.run(redis, stampKeys, stampArgs, ScriptOutputType.INTEGER, flush)) {
            if (stamped instanceof RuntimeException failure) {
                errors++;
                first = first == null ? failure : first;
            }
        }
        return new Applied(events.size(), moves, errors, first);
    }

    /** An index write and what to record once it lands: STAMP's ARGV (fix time, block, lat, lng, event time). */
    private record Stamp(byte[] key, RedisFuture<Long> added, byte[][] args) {
    }

    private byte[][] applyArgs(Wire.RiderEvent e) {
        byte[][] a = new byte[33][];
        Wire.Fix fix = newestFix(e);
        a[0] = ttl;
        a[1] = num(e.kind());
        a[2] = num(e.atMs());
        a[3] = flag(fix != null);
        if (fix != null) {
            a[4] = num(fix.atMs());
            a[5] = num(fix.lat());
            a[6] = num(fix.lng());
            a[7] = flag(fix.mock());
            a[8] = num((double) fix.accuracyM());
            a[9] = num(Wire.block(fix.lat(), fix.lng()));
        } else {
            for (int i = 4; i <= 9; i++) {
                a[i] = ZERO;
            }
        }
        Wire.State s = e.state();
        a[10] = flag(s != null && e.kind() != Wire.OFFLINE);
        if (s != null) {
            a[11] = s.shiftId() == null ? EMPTY : ascii(Wire.hex(s.shiftId()));
            a[12] = num(s.shiftEndsMs());
            a[13] = flag(s.active());
            a[14] = flag(s.onTrip());
            a[15] = num(s.offeredUntilMs());
            a[16] = num(s.offeredFromMs());
            a[17] = num(s.breakUntilMs());
            a[18] = flag(s.cannotRing());
            a[19] = num(s.maxPickupM());
            a[20] = num(s.maxDropM());
            a[21] = flag(s.homeLat() != null);
            a[22] = num(s.homeLat() == null ? 0.0 : s.homeLat());
            a[23] = num(s.homeLng() == null ? 0.0 : s.homeLng());
            a[24] = num(s.headingHomeUntilMs());
            a[25] = flag(s.testAllowed());
            a[26] = num(e.kind() == Wire.PING && e.atMs() > s.seenMs() ? e.atMs() : s.seenMs()); // a ping is itself a call
        } else {
            for (int i = 11; i <= 26; i++) {
                a[i] = i == 11 ? EMPTY : ZERO;
            }
        }
        Wire.Standing d = e.standing();
        a[27] = flag(d != null);
        a[28] = num(d == null ? 0 : d.istDay());
        a[29] = num(d == null ? 0 : d.earnedPaise());
        a[30] = num(d == null ? 0 : d.onlineSeconds());
        a[31] = flag(d != null && d.accruing());
        a[32] = num(d == null ? 0 : d.freeSinceMs());
        return a;
    }

    /** A ping's newest fix (integration-service sends them oldest first), or a refresh's stored one; null for none. */
    static Wire.Fix newestFix(Wire.RiderEvent e) {
        if (e.kind() == Wire.OFFLINE) {
            return null;
        }
        Wire.Fix newest = null;
        for (Wire.Fix f : e.fixes()) {
            if (newest == null || f.atMs() > newest.atMs()) {
                newest = f;
            }
        }
        if (newest == null && e.state() != null) {
            newest = e.state().lastFix();
        }
        return newest;
    }

    /**
     * The riders whose newest fix lies within each centre's radius (with a margin; Rules.rank makes the exact cut), read
     * from the block index and checked against each rider's hash. Index entries for riders who have left a block, or whose
     * state has gone, are removed on the way.
     */
    public List<Rider> near(RedisClusterAsyncCommands<byte[], byte[]> redis, List<Centre> centres) {
        List<RedisFuture<Set<byte[]>>> searches = new ArrayList<>();
        List<Long> searchBlock = new ArrayList<>();
        for (Centre c : centres) {
            double[] box = Geo.box(c.lat(), c.lng(), c.radiusM());
            GeoSearch.GeoPredicate radius = GeoSearch.byRadius(c.radiusM() * 1.01 + 100, GeoArgs.Unit.m);
            for (long block : Wire.blocksIn(box[0], box[1], box[2], box[3])) {
                searches.add(redis.geosearch(blockKey(block), GeoSearch.fromCoordinates(c.lng(), c.lat()), radius));
                searchBlock.add(block);
            }
        }
        Map<String, List<Long>> found = new LinkedHashMap<>();
        for (int i = 0; i < searches.size(); i++) {
            for (byte[] m : RedisSetup.await(searches.get(i))) {
                List<Long> blocks = found.computeIfAbsent(new String(m, StandardCharsets.US_ASCII), id -> new ArrayList<>(1));
                if (blocks.isEmpty() || !blocks.get(blocks.size() - 1).equals(searchBlock.get(i))) {
                    blocks.add(searchBlock.get(i));
                }
            }
        }
        List<RedisFuture<List<KeyValue<byte[], byte[]>>>> reads = new ArrayList<>(found.size());
        for (String id : found.keySet()) {
            reads.add(redis.hmget(ascii(prefix + "r:{" + id + "}"), RIDER_FIELDS));
        }
        List<Rider> riders = new ArrayList<>(found.size());
        List<RedisFuture<Long>> stale = new ArrayList<>();
        List<String> staleIds = new ArrayList<>();
        List<Long> staleBlocks = new ArrayList<>();
        int i = 0;
        for (Map.Entry<String, List<Long>> entry : found.entrySet()) {
            List<KeyValue<byte[], byte[]>> v = RedisSetup.await(reads.get(i++));
            String id = entry.getKey();
            String current = v.size() == RIDER_FIELDS.length && v.get(BK).hasValue() ? text(v.get(BK).getValue()) : "";
            Rider r = parseRider(id, v);
            boolean kept = false;
            for (long block : entry.getValue()) {
                if (r != null && Long.toString(block).equals(current)) {
                    kept = true;
                    continue;
                }
                stale.add(redis.zrem(blockKey(block), ascii(id)));
                staleIds.add(id);
                staleBlocks.add(block);
            }
            if (kept) {
                riders.add(r);
            }
        }
        List<Integer> removed = new ArrayList<>();
        for (int k = 0; k < stale.size(); k++) {
            try {
                if (Long.valueOf(1).equals(RedisSetup.await(stale.get(k)))) {
                    removed.add(k);
                }
            } catch (RedisException ignored) {
                // best effort: a later read removes what this one couldn't
            }
        }
        restore(redis, staleIds, staleBlocks, removed);
        return riders;
    }

    /**
     * A rider who moved back into a block between near()'s read and its removal of their entry there would be missing from
     * that block until their next re-index: an entry removed for a rider whose hash now says that block is put back.
     * Best effort, like the removal.
     */
    private void restore(RedisClusterAsyncCommands<byte[], byte[]> redis, List<String> ids, List<Long> blocks, List<Integer> removed) {
        List<RedisFuture<List<KeyValue<byte[], byte[]>>>> now = new ArrayList<>(removed.size());
        for (int k : removed) {
            now.add(redis.hmget(ascii(prefix + "r:{" + ids.get(k) + "}"), BACK));
        }
        List<RedisFuture<Long>> back = new ArrayList<>();
        for (int j = 0; j < removed.size(); j++) {
            int k = removed.get(j);
            try {
                List<KeyValue<byte[], byte[]>> v = RedisSetup.await(now.get(j));
                if (v.size() == BACK.length && v.get(0).hasValue() && v.get(1).hasValue() && v.get(2).hasValue()
                    && Long.toString(blocks.get(k)).equals(text(v.get(0).getValue()))) {
                    back.add(redis.geoadd(blockKey(blocks.get(k)), number(v.get(2).getValue()), number(v.get(1).getValue()),
                        ascii(ids.get(k))));
                }
            } catch (RedisException ignored) {
                // the rider's next index write puts them back
            }
        }
        for (RedisFuture<Long> f : back) {
            try {
                RedisSetup.await(f);
            } catch (RedisException ignored) {
                // the rider's next index write puts them back
            }
        }
    }

    /** A rider from HMGET's fields, or null for a member that isn't a rider id (never written by this store). */
    static Rider parseRider(String id, List<KeyValue<byte[], byte[]>> v) {
        if (id.length() != 32 || v.size() != RIDER_FIELDS.length) {
            return null;
        }
        Rider r = new Rider();
        try {
            r.id = Wire.uuid(HEX.parseHex(id));
        } catch (IllegalArgumentException e) {
            return null;
        }
        r.lat = dbl(v, 0);
        r.lng = dbl(v, 1);
        r.fixMs = lng(v, 2);
        r.fixMock = yes(v, 3);
        r.seenMs = lng(v, 4);
        r.hasShift = v.get(5).hasValue() && v.get(5).getValue().length > 0;
        r.shiftEndsMs = lng(v, 6);
        r.active = yes(v, 7);
        r.onTrip = yes(v, 8);
        r.offeredUntilMs = lng(v, 9);
        r.offeredFromMs = lng(v, 10);
        r.breakUntilMs = lng(v, 11);
        r.lastBreakEndMs = lng(v, 12);
        r.cannotRing = yes(v, 13);
        r.maxPickupM = (int) lng(v, 14);
        r.maxDropM = (int) lng(v, 15);
        r.hasHome = yes(v, 16);
        r.homeLat = dbl(v, 17);
        r.homeLng = dbl(v, 18);
        r.headingHomeUntilMs = lng(v, 19);
        r.testAllowed = yes(v, 20);
        r.holdUntilMs = lng(v, 21);
        if (v.get(22).hasValue() && v.get(22).getValue().length == 32) {
            try {
                r.holdBy = Wire.uuid(HEX.parseHex(text(v.get(22).getValue())));
            } catch (IllegalArgumentException ignored) {
                r.holdBy = null;
            }
        }
        if (v.get(23).hasValue()) {
            r.hasStanding = true;
            r.standAtMs = lng(v, 23);
            r.istDay = (int) lng(v, 24);
            r.earnedPaise = lng(v, 25);
            r.onlineSeconds = lng(v, 26);
            r.accruing = yes(v, 27);
            r.freeSinceMs = lng(v, 28);
        }
        return r;
    }

    /** Keeps each rider for the request until untilMs; held[i]: riders[i] was kept (else another request holds them, or they're gone). */
    public boolean[] hold(RedisClusterAsyncCommands<byte[], byte[]> redis, UUID request, List<UUID> riders, long nowMs, long untilMs) {
        byte[][] argv = {num(nowMs), num(untilMs), ascii(Wire.hex(request))};
        List<byte[]> keys = new ArrayList<>(riders.size());
        List<byte[][]> args = new ArrayList<>(riders.size());
        for (UUID id : riders) {
            keys.add(riderKey(id));
            args.add(argv);
        }
        List<Object> replies = HOLD.run(redis, keys, args, ScriptOutputType.INTEGER, null);
        boolean[] held = new boolean[riders.size()];
        for (int i = 0; i < held.length; i++) {
            if (replies.get(i) instanceof RuntimeException failure) {
                throw failure;
            }
            held[i] = Long.valueOf(1).equals(replies.get(i));
        }
        return held;
    }

    /** Stores a live request's reply for integration-service to read, for 30 seconds. */
    public void reply(RedisClusterAsyncCommands<byte[], byte[]> redis, UUID request, byte[] payload) {
        RedisSetup.await(redis.set(replyKey(request), payload, SetArgs.Builder.px(30_000)));
    }

    /** A Lua script, sent as EVALSHA and again as EVAL to a node that doesn't know it yet (which also loads it there). */
    static final class Script {
        final String source;
        final String sha;

        Script(String source) {
            this.source = source;
            try {
                this.sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(source.getBytes(StandardCharsets.UTF_8)));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }

        /** Each call's reply, or the RuntimeException it failed with, in call order. flush: as in apply; null for none. */
        List<Object> run(RedisClusterAsyncCommands<byte[], byte[]> redis, List<byte[]> keys, List<byte[][]> args, ScriptOutputType type,
                         Runnable flush) {
            List<RedisFuture<Object>> sent = new ArrayList<>(keys.size());
            for (int i = 0; i < keys.size(); i++) {
                sent.add(redis.evalsha(sha, type, new byte[][] {keys.get(i)}, args.get(i)));
            }
            send(flush);
            List<Object> out = new ArrayList<>(keys.size());
            List<Integer> again = new ArrayList<>();
            for (int i = 0; i < sent.size(); i++) {
                out.add(outcome(sent.get(i), flush));
                if (out.get(i) instanceof RedisNoScriptException) {
                    again.add(i);
                }
            }
            List<RedisFuture<Object>> retried = new ArrayList<>(again.size());
            for (int i : again) {
                retried.add(redis.eval(source, type, new byte[][] {keys.get(i)}, args.get(i)));
            }
            if (!again.isEmpty()) {
                send(flush);
            }
            for (int k = 0; k < again.size(); k++) {
                out.set(again.get(k), outcome(retried.get(k), flush));
            }
            return out;
        }

        private static Object outcome(RedisFuture<Object> f, Runnable flush) {
            try {
                return await(f, flush);
            } catch (RedisException e) {
                return e;
            }
        }
    }

    /** A command's result; with writes held, flush runs again while it waits (RedisSetup.await(future, flush)). */
    private static <T> T await(RedisFuture<T> f, Runnable flush) {
        return flush == null ? RedisSetup.await(f) : RedisSetup.await(f, flush);
    }

    /**
     * Sends the held commands. A connection closed under the batch (a lease handed over) can't: its commands are then
     * cancelled, and each wait reports that as the command's failure.
     */
    private static void send(Runnable flush) {
        if (flush == null) {
            return;
        }
        try {
            flush.run();
        } catch (RuntimeException closed) {
            // reported by the waits
        }
    }

    static byte[][] bytes(String... values) {
        byte[][] out = new byte[values.length][];
        for (int i = 0; i < values.length; i++) {
            out[i] = ascii(values[i]);
        }
        return out;
    }

    static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] num(long v) {
        return ascii(Long.toString(v));
    }

    private static byte[] num(double v) {
        return ascii(Double.toString(v));
    }

    private static byte[] flag(boolean v) {
        return v ? ONE : ZERO;
    }

    private static String text(Object v) {
        return v instanceof byte[] b ? new String(b, StandardCharsets.US_ASCII) : "";
    }

    private static double number(Object v) {
        try {
            return Double.parseDouble(text(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static long lng(List<KeyValue<byte[], byte[]>> v, int i) {
        if (!v.get(i).hasValue()) {
            return 0;
        }
        try {
            return Long.parseLong(text(v.get(i).getValue()));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static double dbl(List<KeyValue<byte[], byte[]>> v, int i) {
        return v.get(i).hasValue() ? number(v.get(i).getValue()) : 0;
    }

    private static boolean yes(List<KeyValue<byte[], byte[]>> v, int i) {
        return v.get(i).hasValue() && "1".equals(text(v.get(i).getValue()));
    }
}
