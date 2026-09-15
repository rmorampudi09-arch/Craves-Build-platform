package in.craves.integration.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

class CravesJwtAuthenticationFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void invalidBearerTokenReturnsUnauthorizedWithoutInvokingApplicationChain() throws Exception {
        JwtVerifier verifier = mock(JwtVerifier.class);
        when(verifier.verify("invalid-token"))
            .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Access token is invalid"));

        CravesJwtAuthenticationFilter filter = new CravesJwtAuthenticationFilter(verifier);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/admin/operations/delivery-intelligence/overview");
        request.addHeader("Authorization", "Bearer invalid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getContentAsString()).contains("INVALID_ACCESS_TOKEN");
        verify(chain, never()).doFilter(any(ServletRequest.class), any(ServletResponse.class));
    }
}
