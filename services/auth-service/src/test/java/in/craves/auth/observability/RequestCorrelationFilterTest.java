package in.craves.auth.observability;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestCorrelationFilterTest {
    private final RequestCorrelationFilter filter = new RequestCorrelationFilter();

    @Test
    void preservesSafeIncomingCorrelationIdAndExposesItDuringRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.addHeader(RequestCorrelationFilter.HEADER_NAME, "client-123.trace_456");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> seenInMdc = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> seenInMdc.set(MDC.get(RequestCorrelationFilter.MDC_KEY)));

        assertThat(response.getHeader(RequestCorrelationFilter.HEADER_NAME)).isEqualTo("client-123.trace_456");
        assertThat(seenInMdc.get()).isEqualTo("client-123.trace_456");
        assertThat(MDC.get(RequestCorrelationFilter.MDC_KEY)).isNull();
    }

    @Test
    void replacesUnsafeIncomingCorrelationId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.addHeader(RequestCorrelationFilter.HEADER_NAME, "unsafe id with spaces");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> { });

        String generated = response.getHeader(RequestCorrelationFilter.HEADER_NAME);
        assertThat(generated).isNotBlank().doesNotContain(" ");
        assertThat(generated).isEqualTo(RequestCorrelationFilter.current(request));
    }
}
