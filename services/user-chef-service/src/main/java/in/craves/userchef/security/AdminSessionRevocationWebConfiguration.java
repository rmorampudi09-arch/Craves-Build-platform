package in.craves.userchef.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Checks live admin authority after local JWT verification, before any owning-service operation. */
@Configuration
public class AdminSessionRevocationWebConfiguration implements WebMvcConfigurer {
    private static final Set<String> ADMIN_ROLES = Set.of("PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN",
        "OPERATIONS_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", "AUDIT_ADMIN");
    private final ObjectMapper mapper;
    private final HttpClient client;
    private final URI endpoint;
    private final Semaphore permits;

    @Autowired
    public AdminSessionRevocationWebConfiguration(ObjectMapper mapper,
        @Value("${CRAVES_ADMIN_SESSION_AUTH_URL:https://api.craves.in/api/v1/auth/me}") String endpoint) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build(),
            URI.create(endpoint), new Semaphore(16));
        if (!"https".equals(this.endpoint.getScheme()) || this.endpoint.getHost() == null
            || this.endpoint.getUserInfo() != null || this.endpoint.getQuery() != null || this.endpoint.getFragment() != null)
            throw new IllegalArgumentException("Admin session verification requires a credential-free HTTPS origin/path");
    }

    AdminSessionRevocationWebConfiguration(ObjectMapper mapper, HttpClient client, URI endpoint, Semaphore permits) {
        this.mapper = mapper; this.client = client; this.endpoint = endpoint; this.permits = permits;
    }

    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor()).addPathPatterns("/api/**");
    }

    HandlerInterceptor interceptor() {
        return new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
                String authorization = request.getHeader("Authorization");
                if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken
                    || authorization == null || !authorization.startsWith("Bearer ")) return true;
                if (!hasInternalRole(authorization.substring(7))) return true;
                if (!permits.tryAcquire()) throw unavailable();
                try {
                    HttpRequest verification = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5))
                        .header("Authorization", authorization).header("Accept", "application/json").GET().build();
                    var reply = client.send(verification, HttpResponse.BodyHandlers.discarding());
                    int status = reply.statusCode();
                    if (status == 401 || status == 403)
                        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Administrator session has ended or access was revoked");
                    if (status != 200 || !reply.headers().firstValue("X-Craves-Admin-Session").orElse("").equals("verified-v1")) throw unavailable();
                    return true;
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt(); throw unavailable();
                } catch (IOException error) {
                    throw unavailable();
                } finally { permits.release(); }
            }
        };
    }

    private boolean hasInternalRole(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new IllegalArgumentException();
            Map<?, ?> claims = mapper.readValue(Base64.getUrlDecoder().decode(parts[1]), Map.class);
            Object roles = claims.get("roles");
            return roles instanceof List<?> values && values.stream().anyMatch(ADMIN_ROLES::contains);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Access token claims are invalid");
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Administrator session verification is temporarily unavailable");
    }
}
