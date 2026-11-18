package in.craves.integration.delivery.borzo;

import in.craves.integration.config.BorzoProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class BorzoSignatureVerifier {
    private static final Logger log = LoggerFactory.getLogger(BorzoSignatureVerifier.class);
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private final BorzoProperties properties;

    public BorzoSignatureVerifier(BorzoProperties properties) {
        this.properties = properties;
    }

    public boolean isConfigured() {
        return StringUtils.hasText(properties.getCallbackSecret());
    }

    public boolean isValid(String rawBody, String suppliedSignature) {
        if (!isConfigured() || !StringUtils.hasText(rawBody) || !StringUtils.hasText(suppliedSignature)) {
            return false;
        }
        byte[] supplied = suppliedSignature.trim().toLowerCase(java.util.Locale.ROOT)
            .getBytes(StandardCharsets.US_ASCII);
        if (matches(rawBody, properties.getCallbackSecret(), supplied)) {
            return true;
        }
        String previous = properties.getCallbackSecretPrevious();
        if (StringUtils.hasText(previous) && matches(rawBody, previous, supplied)) {
            // One line per callback, no values: when these stop, the previous secret can be removed.
            log.warn("COURIER_WEBHOOK_PREVIOUS_SECRET_USED provider=borzo");
            return true;
        }
        return false;
    }

    private static boolean matches(String rawBody, String secret, byte[] supplied) {
        return MessageDigest.isEqual(hmacSha256Hex(rawBody, secret).getBytes(StandardCharsets.US_ASCII), supplied);
    }

    public String signatureFingerprint(String suppliedSignature) {
        if (!StringUtils.hasText(suppliedSignature)) {
            return null;
        }
        return sha256Hex(suppliedSignature.trim());
    }

    static String hmacSha256Hex(String rawBody, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not calculate Borzo callback signature", ex);
        }
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not calculate SHA-256 fingerprint", ex);
        }
    }
}
