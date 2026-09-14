package in.craves.userchef.email;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Dedicated email key; raw request bytes are bound to method, path and short-lived timestamp. */
public final class EmailInternalSignature {
    private EmailInternalSignature() {}
    public static boolean valid(String key, String path, String timestamp, String signature, byte[] body, Instant now) {
        if (key == null || key.getBytes(StandardCharsets.UTF_8).length < 32 || timestamp == null ||
            !timestamp.matches("[0-9]{1,12}") || signature == null || !signature.matches("[0-9a-fA-F]{64}") || body.length > 4096) return false;
        try {
            long seconds = Long.parseLong(timestamp);
            if (seconds < now.getEpochSecond() - 300 || seconds > now.getEpochSecond() + 300) return false;
            byte[] prefix = ("POST\n" + path + "\n" + timestamp + "\n").getBytes(StandardCharsets.UTF_8);
            Mac mac = mac(key); mac.update(prefix);
            return MessageDigest.isEqual(mac.doFinal(body), HexFormat.of().parseHex(signature));
        } catch (RuntimeException ex) { return false; }
    }
    public static String fingerprint(String key, byte[] body) {
        Mac mac = mac(key); mac.update("craves-email-projection-receipt-v1\n".getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(mac.doFinal(body));
    }
    private static Mac mac(String key) {
        try { Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256")); return mac; }
        catch (Exception ex) { throw new IllegalStateException("EMAIL_SIGNATURE_UNAVAILABLE"); }
    }
}
