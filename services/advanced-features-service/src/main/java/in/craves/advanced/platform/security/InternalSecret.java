package in.craves.advanced.platform.security;

import in.craves.advanced.platform.web.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.core.env.Environment;

/** Private service-to-service calls: {@code X-Craves-Internal-Secret} must equal {@code CRAVES_INTERNAL_SERVICE_SECRET}. */
public final class InternalSecret {
    public static final String HEADER = "X-Craves-Internal-Secret";

    private InternalSecret() { }

    public static void require(Environment environment, String given) {
        // Read per request, so an unset secret can never be mistaken for a matching empty header.
        String configured = environment.getProperty("craves.internal.service-secret", "");
        if (configured.isBlank()) throw ApiProblem.unavailable("INTERNAL_SECRET_NOT_CONFIGURED", "Internal calls are not set up on this service");
        if (given == null || !MessageDigest.isEqual(given.getBytes(StandardCharsets.UTF_8), configured.getBytes(StandardCharsets.UTF_8))) {
            throw new ApiProblem(401, "INTERNAL_SECRET_REQUIRED", "A valid internal service secret is required");
        }
    }
}
