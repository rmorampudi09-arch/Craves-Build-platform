package in.craves.advanced.platform.security;

import in.craves.advanced.platform.web.ApiProblem;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** The verified caller of the current request. */
public final class CurrentUser {
    private CurrentUser() { }

    public static Optional<UUID> optionalId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token && token.isAuthenticated()) {
            return Optional.of(UUID.fromString(token.getToken().getSubject()));
        }
        return Optional.empty();
    }

    public static UUID id() {
        return optionalId().orElseThrow(() -> new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in to continue"));
    }

    public static boolean hasRole(String role) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_" + role));
    }

    public static boolean hasAnyRole(String... roles) {
        return Arrays.stream(roles).anyMatch(CurrentUser::hasRole);
    }

    public static UUID requireAnyRole(String... roles) {
        UUID id = id();
        if (!hasAnyRole(roles)) throw ApiProblem.forbidden("ACCESS_DENIED", "Your account cannot do this");
        return id;
    }

    /** The caller's raw access token, for calls made on their behalf to other Craves APIs. */
    public static String bearerToken() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            Jwt jwt = token.getToken();
            return jwt.getTokenValue();
        }
        throw new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in to continue");
    }
}
