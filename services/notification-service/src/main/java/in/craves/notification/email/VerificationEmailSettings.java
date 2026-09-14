package in.craves.notification.email;

import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class VerificationEmailSettings {
    public final String internalKey;
    public final boolean enabled;
    public VerificationEmailSettings(@Value("${CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY:}") String key,
        @Value("${CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED:false}") boolean enabled) {
        if (enabled && key.getBytes(StandardCharsets.UTF_8).length < 32) throw new IllegalStateException("Email verification internal key is required");
        this.internalKey = key; this.enabled = enabled;
    }
}
