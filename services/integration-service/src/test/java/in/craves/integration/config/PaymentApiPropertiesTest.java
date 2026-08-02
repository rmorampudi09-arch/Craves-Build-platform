package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class PaymentApiPropertiesTest {
    @Test
    void defaultsCanBeRepresentedAsFullyFailClosed() {
        PaymentApiProperties properties = new PaymentApiProperties(false, false);

        assertThat(properties.orderExecutionEnabled()).isFalse();
        assertThat(properties.webhookIngressEnabled()).isFalse();
        assertThatThrownBy(properties::requireOrderExecutionEnabled)
            .isInstanceOfSatisfying(ResponseStatusException.class, error ->
                assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        assertThatThrownBy(properties::requireWebhookIngressEnabled)
            .isInstanceOfSatisfying(ResponseStatusException.class, error ->
                assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void explicitActivationAllowsTheCorrespondingBoundary() {
        PaymentApiProperties properties = new PaymentApiProperties(true, true);

        properties.requireOrderExecutionEnabled();
        properties.requireWebhookIngressEnabled();
        assertThat(properties.orderExecutionEnabled()).isTrue();
        assertThat(properties.webhookIngressEnabled()).isTrue();
    }
}
