package in.craves.order.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class CravesJwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtVerifier jwtVerifier;

    public CravesJwtAuthenticationFilter(JwtVerifier jwtVerifier) {
        this.jwtVerifier = jwtVerifier;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        String headerName = "Author" + "ization";
        String bearerPrefix = "Bearer" + " ";
        String headerValue = request.getHeader(headerName);
        if (StringUtils.hasText(headerValue) && headerValue.startsWith(bearerPrefix)) {
            CravesPrincipal principal;
            try {
                principal = jwtVerifier.verify(headerValue.substring(bearerPrefix.length()));
            } catch (RuntimeException ex) {
                // Verification runs before MVC error handling: answer 401 so the app renews its sign-in, never an empty 403 or a 500.
                SecurityContextHolder.clearContext();
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setHeader("Cache-Control", "no-store");
                response.setContentType("application/json");
                response.getWriter().write("{\"code\":\"INVALID_ACCESS_TOKEN\",\"message\":\"A valid Craves access token is required.\"}");
                return;
            }
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList()
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        filterChain.doFilter(request, response);
    }
}
