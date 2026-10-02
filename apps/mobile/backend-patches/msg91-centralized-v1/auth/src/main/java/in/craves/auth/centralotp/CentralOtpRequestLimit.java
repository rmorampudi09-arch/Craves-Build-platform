package in.craves.auth.centralotp;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(-200)
public class CentralOtpRequestLimit extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if ("/api/v1/auth/otp/send".equals(path) || "/api/v1/auth/otp/verify".equals(path)) {
            response.setHeader("Cache-Control", "private, no-store");
            if ("POST".equals(request.getMethod())
                    && (request.getContentLengthLong() < 1 || request.getContentLengthLong() > 1024)) {
                response.setStatus(413);
                response.setContentType("application/json");
                response.getWriter().write("{\"code\":\"OTP_REQUEST_TOO_LARGE\",\"message\":\"Invalid verification request\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
