package in.craves.auth.email;

import in.craves.auth.exception.AuthException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class EmailVerificationCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private EmailVerificationCrypto() { }
    public static String newCode() { return String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000)); }
    public static String normalizeEmail(String raw) {
        if (raw == null || !raw.equals(raw.strip()) || raw.length() > 254 || raw.length() < 5 ||
            !raw.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,63}"))
            throw AuthException.badRequest("EMAIL_INVALID", "Enter a valid email address");
        int at = raw.indexOf('@');
        if (at > 64 || raw.startsWith(".") || raw.charAt(at - 1) == '.' || raw.contains(".."))
            throw AuthException.badRequest("EMAIL_INVALID", "Enter a valid email address");
        for (String label : raw.substring(at + 1).split("\\."))
            if (label.length() > 63 || label.startsWith("-") || label.endsWith("-"))
                throw AuthException.badRequest("EMAIL_INVALID", "Enter a valid email address");
        return raw.substring(0, at) + "@" + raw.substring(at + 1).toLowerCase(Locale.ROOT);
    }
    public static String codeMac(String key, UUID owner, String email, UUID challenge, String code) {
        return hmac(key, "CRAVES_EMAIL_OTP_V1\n" + owner + "\n" + email + "\n" + challenge + "\n" + code);
    }
    public static String recipientKey(String key, String email) { return hmac(key, "CRAVES_EMAIL_RATE_V1\n" + email.toLowerCase(Locale.ROOT)); }
    public static String hmac(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) { throw new IllegalStateException("Email authentication is unavailable"); }
    }
    public static boolean matches(String expected, String actual) {
        return expected != null && actual != null && MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.US_ASCII), actual.getBytes(StandardCharsets.US_ASCII));
    }
    static String mask(String email) { int at=email.indexOf('@'); return email.substring(0,1) + "***" + email.substring(at); }
}
