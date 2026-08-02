package in.craves.integration.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class PaymentApiProperties {
    private final boolean orderExecutionEnabled;
    private final boolean webhookIngressEnabled;

    public PaymentApiProperties(
        @Value("${CRAVES_PAYMENT_ORDER_API_ENABLED:false}") boolean orderExecutionEnabled,
        @Value("${CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED:false}") boolean webhookIngressEnabled
    ) {
        this.orderExecutionEnabled = orderExecutionEnabled;
        this.webhookIngressEnabled = webhookIngressEnabled;
    }

    public boolean orderExecutionEnabled() {
        return orderExecutionEnabled;
    }

    public boolean webhookIngressEnabled() {
        return webhookIngressEnabled;
    }

    public void requireOrderExecutionEnabled() {
        if (!orderExecutionEnabled) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Payment order execution is not enabled"
            );
        }
    }

    public void requireWebhookIngressEnabled() {
        if (!webhookIngressEnabled) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Cashfree webhook ingress is not enabled"
            );
        }
    }
}
