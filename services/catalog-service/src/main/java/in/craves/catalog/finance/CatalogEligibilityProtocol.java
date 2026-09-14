package in.craves.catalog.finance;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class CatalogEligibilityProtocol {
    public static final String PATH = "/internal/v1/finance/catalog-eligibility";
    public static final String TIMESTAMP = "X-Craves-Catalog-Timestamp";
    public static final String SIGNATURE = "X-Craves-Catalog-Signature";
    public static final int MAX_CHEFS = 1000;
    public static final int MAX_RESPONSE_BYTES = 64 * 1024;
    private CatalogEligibilityProtocol() {}
    public static String sign(String key, String direction, String timestamp, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update((direction + "\n" + PATH + "\n" + timestamp + "\n").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(body));
        } catch (Exception ex) { throw new IllegalStateException("Catalog eligibility signature unavailable"); }
    }
    public static boolean matches(String expected, String supplied) {
        if (supplied == null || !supplied.matches("[0-9a-f]{64}")) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), supplied.getBytes(StandardCharsets.US_ASCII));
    }
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("Catalog eligibility hash unavailable"); }
    }
}
