package in.craves.notification.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Component
public class CravesJwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtVerifier jwtVerifier;
    private final HandlerExceptionResolver exceptionResolver;

    public CravesJwtAuthenticationFilter(
        JwtVerifier jwtVerifier,
        @Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver
    ) {
        this.jwtVerifier = jwtVerifier;
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        String headerName = "Author" + "ization";
        String bearerPrefix = "Bearer" + " ";
        String headerValue = request.getHeader(headerName);
        if (StringUtils.hasText(headerValue) && headerValue.startsWith(bearerPrefix)) {
            try {
                CravesPrincipal principal = jwtVerifier.verify(headerValue.substring(bearerPrefix.length()));
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    principal,
                    null,
                    principal.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList()
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (RuntimeException ex) {
                SecurityContextHolder.clearContext();
                exceptionResolver.resolveException(request, response, null, ex);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }
}
