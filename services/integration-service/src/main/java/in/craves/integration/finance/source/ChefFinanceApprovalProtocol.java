package in.craves.integration.finance.source;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Read-only approval authority; the existing bank identity credential cannot post money. */
public final class ChefFinanceApprovalProtocol {
    public static final String PATH = "/internal/v1/chef-finance/approvals";
    public static final String TIME = "X-Craves-Bank-Time";
    public static final String SIGNATURE = "X-Craves-Bank-Signature";
    public static final int MAX_CHEFS = 1000;
    public static final int MAX_BYTES = 256 * 1024;
    private ChefFinanceApprovalProtocol() {}
    public static String sign(String key, String direction, String time, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update((direction + "\n" + PATH + "\n" + time + "\n").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(body));
        } catch (Exception ex) { throw new IllegalStateException("Approval signature unavailable"); }
    }
    public static boolean matches(String expected, String actual) {
        return actual != null && actual.matches("[0-9a-f]{64}") && MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.US_ASCII), actual.getBytes(StandardCharsets.US_ASCII));
    }
}
