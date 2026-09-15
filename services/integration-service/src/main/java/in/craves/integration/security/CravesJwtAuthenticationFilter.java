package in.craves.integration.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

@Component
public class CravesJwtAuthenticationFilter extends OncePerRequestFilter {
    private static final String INVALID_ACCESS_TOKEN_RESPONSE =
        "{\"code\":\"INVALID_ACCESS_TOKEN\",\"message\":\"Invalid access token\"}";

    private final JwtVerifier jwtVerifier;

    public CravesJwtAuthenticationFilter(JwtVerifier jwtVerifier) {
        this.jwtVerifier = jwtVerifier;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // This exact webhook authenticates its provider Bearer credential in PidgeWebhookService.
        // It must not be interpreted as a customer/admin Craves JWT.
        return "POST".equals(request.getMethod())
            && "/api/v1/webhooks/delivery/pidge".equals(request.getServletPath());
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            CravesPrincipal principal;
            try {
                principal = jwtVerifier.verify(header.substring(7));
            } catch (ResponseStatusException exception) {
                if (exception.getStatusCode() != HttpStatus.UNAUTHORIZED) {
                    throw exception;
                }
                SecurityContextHolder.clearContext();
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                response.setHeader("Cache-Control", "no-store");
                response.getWriter().write(INVALID_ACCESS_TOKEN_RESPONSE);
                return;
            }

            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.roles().stream()
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
                    .toList()
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        filterChain.doFilter(request, response);
    }
}
