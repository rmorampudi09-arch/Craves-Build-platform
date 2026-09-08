package in.craves.auth.exception;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.auth.observability.RequestCorrelationFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

class RestExceptionHandlerTest {
    private final RestExceptionHandler handler = new RestExceptionHandler();

    @Test
    void preservesResponseStatusExceptionStatusReasonAndCorrelation() {
        MockHttpServletRequest request = request("/api/v1/admin/roles", "auth-corr-1");
        var response = handler.handleResponseStatus(
            new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Internal administrator role management is not enabled"
            ),
            request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(response.getBody().error()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(response.getBody().message())
            .isEqualTo("Internal administrator role management is not enabled");
        assertThat(response.getBody().correlationId()).isEqualTo("auth-corr-1");
        assertThat(response.getBody().path()).isEqualTo("/api/v1/admin/roles");
    }

    @Test
    void unexpectedExceptionStillReturnsGenericInternalServerError() {
        MockHttpServletRequest request = request("/api/v1/auth/me", "auth-corr-2");
        var response = handler.handleUnexpected(new IllegalStateException("sensitive detail"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_SERVER_ERROR");
        assertThat(response.getBody().message()).isEqualTo("Unexpected service error");
        assertThat(response.getBody().message()).doesNotContain("sensitive detail");
        assertThat(response.getBody().correlationId()).isEqualTo("auth-corr-2");
    }

    private static MockHttpServletRequest request(String path, String correlationId) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setAttribute(RequestCorrelationFilter.ATTRIBUTE_NAME, correlationId);
        return request;
    }
}
