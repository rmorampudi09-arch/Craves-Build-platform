package in.craves.advanced.platform;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Service-wide settings. Module switches are read per module by {@code ModuleRuntime}. */
@ConfigurationProperties(prefix = "advanced")
public record AdvancedSettings(
        String jwtIssuer,
        String jwtAudience,
        String verificationPemBase64,
        boolean adminSessionCheckEnabled,
        String adminSessionAuthUrl,
        String apiOrigin,
        String publicWebOrigin,
        int moduleConcurrency) {

    public AdvancedSettings {
        if (moduleConcurrency <= 0) moduleConcurrency = 64;
        apiOrigin = httpsOrigin(apiOrigin, "https://api.craves.in");
        publicWebOrigin = httpsOrigin(publicWebOrigin, "https://craves.in");
    }

    private static String httpsOrigin(String value, String fallback) {
        String origin = value == null || value.isBlank() ? fallback : value.strip().replaceAll("/+$", "");
        URI uri = URI.create(origin);
        boolean local = "http".equals(uri.getScheme()) && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
        if (!("https".equals(uri.getScheme()) || local) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath() == null || uri.getPath().isEmpty())) {
            throw new IllegalArgumentException("Origins must be credential-free HTTPS origins without a path: " + origin);
        }
        return origin;
    }
}
