package in.craves.advanced.platform.security;

import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Same contract as the other services: a token carrying a staff role is only honoured while Auth confirms the
 * administrator session is live (header {@code X-Craves-Admin-Session: verified-v1}).
 */
@Configuration
public class AdminSessionGuard implements WebMvcConfigurer {
    private final AdvancedSettings settings;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final Semaphore permits = new Semaphore(16);

    public AdminSessionGuard(AdvancedSettings settings) {
        this.settings = settings;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (!settings.adminSessionCheckEnabled()) return;
        URI endpoint = URI.create(settings.adminSessionAuthUrl());
        if (!"https".equals(endpoint.getScheme()) || endpoint.getHost() == null || endpoint.getUserInfo() != null) {
            throw new IllegalArgumentException("Admin session verification needs a credential-free HTTPS URL");
        }
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
                if (!(authentication instanceof JwtAuthenticationToken token)) return true;
                boolean staff = authentication.getAuthorities().stream()
                        .anyMatch(a -> Roles.ADMIN.contains(a.getAuthority().replaceFirst("^ROLE_", "")));
                if (!staff) return true;
                verify(endpoint, token.getToken().getTokenValue());
                return true;
            }
        }).addPathPatterns("/api/**");
    }

    private void verify(URI endpoint, String token) {
        if (!permits.tryAcquire()) throw unavailable();
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5))
                    .header("Authorization", "Bearer " + token).header("Accept", "application/json").GET().build();
            HttpResponse<Void> reply = client.send(request, HttpResponse.BodyHandlers.discarding());
            if (reply.statusCode() == 401 || reply.statusCode() == 403) {
                throw new ApiProblem(401, "ADMIN_SESSION_ENDED", "Administrator session has ended or access was revoked");
            }
            if (reply.statusCode() != 200 || !reply.headers().firstValue("X-Craves-Admin-Session").orElse("").equals("verified-v1")) {
                throw unavailable();
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException ex) {
            throw unavailable();
        } finally {
            permits.release();
        }
    }

    private static ApiProblem unavailable() {
        return ApiProblem.unavailable("ADMIN_SESSION_CHECK_UNAVAILABLE", "Administrator session verification is temporarily unavailable");
    }
}
