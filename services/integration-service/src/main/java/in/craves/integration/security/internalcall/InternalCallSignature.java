package in.craves.integration.security.internalcall;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * CH-03: per-service identity for /internal calls. Each calling service signs with its own key, so one leaked
 * key no longer lets anyone call every internal route. HMAC-SHA256 over caller, timestamp, nonce, method,
 * path with query, and the body hash; a nonce is accepted once inside the timestamp window.
 * Dependency-free on purpose: this file is copied unchanged (apart from the package) into every service.
 */
public final class InternalCallSignature {
    public static final String CALLER_HEADER = "X-Craves-Call-Service";
    public static final String TIMESTAMP_HEADER = "X-Craves-Call-Timestamp";
    public static final String NONCE_HEADER = "X-Craves-Call-Nonce";
    public static final String SIGNATURE_HEADER = "X-Craves-Call-Signature";

    static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);
    static final int MIN_KEY_BYTES = 32;
    private static final Pattern CALLER = Pattern.compile("[a-z][a-z0-9-]{1,40}");
    private static final Pattern NONCE = Pattern.compile("[A-Za-z0-9-]{16,64}");
    private static final Pattern SIGNATURE = Pattern.compile("[0-9a-f]{64}");
    private static final HexFormat HEX = HexFormat.of();

    private InternalCallSignature() {
    }

    /** Headers to add to an outbound internal call. */
    public static Map<String, String> sign(
        String caller, byte[] key, String method, String pathAndQuery, byte[] body, Instant now, String nonce
    ) {
        long timestamp = now.getEpochSecond();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(CALLER_HEADER, caller);
        headers.put(TIMESTAMP_HEADER, Long.toString(timestamp));
        headers.put(NONCE_HEADER, nonce);
        headers.put(SIGNATURE_HEADER, HEX.formatHex(hmac(key, canonical(caller, timestamp, nonce, method, pathAndQuery, body))));
        return headers;
    }

    static String canonical(String caller, long timestamp, String nonce, String method, String pathAndQuery, byte[] body) {
        return "craves-internal-v1\n" + caller + "\n" + timestamp + "\n" + nonce + "\n"
            + method.toUpperCase(Locale.ROOT) + "\n" + pathAndQuery + "\n" + HEX.formatHex(sha256(body == null ? new byte[0] : body));
    }

    /** Base64 key of at least 32 bytes. */
    public static byte[] decodeKey(String base64) {
        byte[] key = Base64.getDecoder().decode(base64.trim());
        if (key.length < MIN_KEY_BYTES) {
            throw new IllegalArgumentException("Internal call keys must be at least " + MIN_KEY_BYTES + " bytes");
        }
        return key;
    }

    /** {@code order=BASE64,integration=BASE64}; blank means no callers. */
    public static Map<String, byte[]> parseCallerKeys(String spec) {
        Map<String, byte[]> keys = new LinkedHashMap<>();
        if (spec == null || spec.isBlank()) {
            return keys;
        }
        for (String entry : spec.split(",")) {
            int separator = entry.indexOf('=');
            if (separator <= 0) {
                throw new IllegalArgumentException("Caller key entries must look like caller=base64key");
            }
            String caller = entry.substring(0, separator).trim();
            if (!CALLER.matcher(caller).matches()) {
                throw new IllegalArgumentException("Invalid internal caller name: " + caller);
            }
            keys.put(caller, decodeKey(entry.substring(separator + 1)));
        }
        return keys;
    }

    public record Result(boolean valid, String caller, String reason) {
        static Result ok(String caller) {
            return new Result(true, caller, "OK");
        }

        static Result rejected(String caller, String reason) {
            return new Result(false, caller, reason);
        }
    }

    /** Verifies inbound calls. Nonces are remembered per replica for twice the clock-skew window. */
    public static final class Verifier {
        // shortcut: the replay cache is per replica; move it to Redis/Postgres before running several replicas with enforcement on.
        private static final int PURGE_THRESHOLD = 50_000;
        private final Map<String, byte[]> callerKeys;
        private final Clock clock;
        private final Map<String, Long> seenNonces = new ConcurrentHashMap<>();
        private volatile long lastPurgeSecond = Long.MIN_VALUE;

        public Verifier(Map<String, byte[]> callerKeys, Clock clock) {
            this.callerKeys = Map.copyOf(callerKeys);
            this.clock = clock;
        }

        public boolean hasCallers() {
            return !callerKeys.isEmpty();
        }

        public Result verify(
            String caller, String timestamp, String nonce, String signature, String method, String pathAndQuery, byte[] body
        ) {
            if (caller == null || !callerKeys.containsKey(caller)) {
                return Result.rejected(caller, "UNKNOWN_CALLER");
            }
            long sentAt;
            try {
                sentAt = Long.parseLong(timestamp);
            } catch (NumberFormatException | NullPointerException exception) {
                return Result.rejected(caller, "MALFORMED_TIMESTAMP");
            }
            long now = clock.instant().getEpochSecond();
            if (Math.abs(now - sentAt) > MAX_CLOCK_SKEW.toSeconds()) {
                return Result.rejected(caller, "STALE_TIMESTAMP");
            }
            if (nonce == null || !NONCE.matcher(nonce).matches()) {
                return Result.rejected(caller, "MALFORMED_NONCE");
            }
            if (signature == null || !SIGNATURE.matcher(signature).matches()) {
                return Result.rejected(caller, "MALFORMED_SIGNATURE");
            }
            byte[] expected = hmac(callerKeys.get(caller), canonical(caller, sentAt, nonce, method, pathAndQuery, body));
            if (!MessageDigest.isEqual(expected, HEX.parseHex(signature))) {
                return Result.rejected(caller, "BAD_SIGNATURE");
            }
            // Remember the nonce only after the signature checks out, so forged calls cannot fill the cache.
            purgeExpired(now);
            if (seenNonces.putIfAbsent(caller + ":" + nonce, now + 2 * MAX_CLOCK_SKEW.toSeconds()) != null) {
                return Result.rejected(caller, "REPLAYED_NONCE");
            }
            return Result.ok(caller);
        }

        private void purgeExpired(long now) {
            // At most once a second, so a busy caller cannot turn every call into a full scan.
            if (seenNonces.size() >= PURGE_THRESHOLD && now != lastPurgeSecond) {
                lastPurgeSecond = now;
                seenNonces.values().removeIf(expiresAt -> expiresAt < now);
            }
        }
    }

    private static byte[] hmac(byte[] key, String canonical) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA256 is unavailable", exception);
        }
    }

    private static byte[] sha256(byte[] body) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(body);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
