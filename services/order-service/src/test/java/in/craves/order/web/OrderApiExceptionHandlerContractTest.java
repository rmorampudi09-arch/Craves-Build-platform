package in.craves.order.web;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.order.exception.OrderApiException;
import in.craves.order.observability.RequestCorrelationFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class OrderApiExceptionHandlerContractTest {
    private final OrderApiExceptionHandler handler = new OrderApiExceptionHandler();

    @Test
    void keepsLegacyErrorAliasAndAddsCorrelationContract() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/cart/validate");
        request.setAttribute(RequestCorrelationFilter.ATTRIBUTE_NAME, "corr-order-123");

        ResponseEntity<StandardApiErrorResponse> response = handler.handleOrderApiException(
            OrderApiException.conflict("CART_VALIDATION_FAILED", "One or more cart items are unavailable"),
            request
        );

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("CART_VALIDATION_FAILED");
        assertThat(response.getBody().error()).isEqualTo("CART_VALIDATION_FAILED");
        assertThat(response.getBody().correlationId()).isEqualTo("corr-order-123");
        assertThat(response.getBody().path()).isEqualTo("/api/v1/cart/validate");
    }
}
