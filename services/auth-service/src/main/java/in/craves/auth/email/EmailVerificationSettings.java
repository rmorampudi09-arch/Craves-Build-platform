package in.craves.auth.email;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record EmailVerificationSettings(
    @Value("${CRAVES_EMAIL_VERIFICATION_ENABLED:false}") boolean enabled,
    @Value("${CRAVES_EMAIL_VERIFICATION_HMAC_KEY:}") String codeKey,
    @Value("${CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY:}") String notificationKey,
    @Value("${CRAVES_EMAIL_NOTIFICATION_BASE_URL:}") String notificationBaseUrl,
    @Value("${CRAVES_EMAIL_PROJECTION_WORKER_ENABLED:false}") boolean projectionEnabled,
    @Value("${CRAVES_EMAIL_PROJECTION_INTERNAL_KEY:}") String projectionKey,
    @Value("${CRAVES_EMAIL_USER_CHEF_BASE_URL:}") String userChefBaseUrl,
    @Value("${CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP:false}") boolean allowLocalHttp
) {
    @Override public String toString() { return "EmailVerificationSettings[REDACTED]"; }
    public EmailVerificationSettings {
        if (enabled) {
            requireKey(codeKey); requireKey(notificationKey); origin(notificationBaseUrl, allowLocalHttp);
            if (codeKey.equals(notificationKey)) throw new IllegalStateException("Email verification keys must be independently scoped");
        }
        if (projectionEnabled) { requireKey(projectionKey); origin(userChefBaseUrl, allowLocalHttp); }
        if (projectionEnabled && enabled && (projectionKey.equals(codeKey) || projectionKey.equals(notificationKey)))
            throw new IllegalStateException("Email projection key must be independently scoped");
    }
    static void requireKey(String key) {
        if (key == null || key.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32)
            throw new IllegalStateException("A securely referenced email key of at least 32 bytes is required");
    }
    static URI origin(String value, boolean allowLocal) {
        try {
            URI uri = URI.create(value);
            boolean local = allowLocal && "http".equals(uri.getScheme()) &&
                ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()) || "[::1]".equals(uri.getHost()));
            if ((!"https".equals(uri.getScheme()) && !local) || uri.getHost() == null || uri.getRawUserInfo() != null ||
                uri.getRawQuery() != null || uri.getRawFragment() != null ||
                !(uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/")))
                throw new IllegalArgumentException();
            return URI.create(value.replaceAll("/$", ""));
        } catch (Exception error) { throw new IllegalStateException("An existing HTTPS service origin is required"); }
    }
}
