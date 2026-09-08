package in.craves.integration.payment;

import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.config.RazorpayProviderProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class RazorpayProductionReadinessService {
    private final PaymentRoutingProperties routing;
    private final RazorpayProviderProperties provider;
    private final RazorpayWebhookProperties webhook;
    private final RazorpayWebhookInboxService inbox;

    public RazorpayProductionReadinessService(
        PaymentRoutingProperties routing,
        RazorpayProviderProperties provider,
        RazorpayWebhookProperties webhook,
        RazorpayWebhookInboxService inbox
    ) {
        this.routing = routing;
        this.provider = provider;
        this.webhook = webhook;
        this.inbox = inbox;
    }

    public Snapshot snapshot() {
        long backlog = inbox.countNonTerminal();
        long deadLetters = inbox.countDeadLetters();
        List<String> blockers = new ArrayList<>();
        if (!routing.razorpay()) blockers.add("RAZORPAY_NOT_ACTIVE_PROVIDER");
        if (!routing.razorpayEnabled()) blockers.add("RAZORPAY_API_DISABLED");
        if (routing.cashfreeEnabled()) blockers.add("CASHFREE_API_MUST_REMAIN_DISABLED");
        if (routing.cashfreeTrafficAllowed()) blockers.add("CASHFREE_TRAFFIC_MUST_REMAIN_DISABLED");
        if (!provider.production()) blockers.add("RAZORPAY_NOT_IN_PRODUCTION_MODE");
        if (!provider.productionActivationApproved()) blockers.add("PRODUCTION_ACTIVATION_NOT_APPROVED");
        if (!provider.productionPaymentExecutionEnabled()) blockers.add("PRODUCTION_PAYMENT_EXECUTION_DISABLED");
        if (!provider.hasCredentials()) blockers.add("RAZORPAY_CREDENTIALS_NOT_CONFIGURED");
        if (!provider.hasWebhookSecret()) blockers.add("RAZORPAY_WEBHOOK_SECRET_NOT_CONFIGURED");
        if (!webhook.isWorkerEnabled()) blockers.add("RAZORPAY_WEBHOOK_WORKER_DISABLED");
        if (deadLetters > 0) blockers.add("RAZORPAY_WEBHOOK_DEAD_LETTERS_PRESENT");
        return new Snapshot(
            blockers.isEmpty(),
            routing.provider(),
            routing.razorpayEnabled(),
            routing.cashfreeEnabled(),
            routing.cashfreeTrafficAllowed(),
            provider.environment(),
            provider.productionActivationApproved(),
            provider.productionPaymentExecutionEnabled(),
            provider.hasCredentials(),
            provider.hasWebhookSecret(),
            provider.autoCapture(),
            webhook.isWorkerEnabled(),
            backlog,
            deadLetters,
            List.copyOf(blockers)
        );
    }

    public record Snapshot(
        boolean productionReady,
        String activeProvider,
        boolean razorpayApiEnabled,
        boolean cashfreeApiEnabled,
        boolean cashfreeTrafficAllowed,
        String environment,
        boolean productionActivationApproved,
        boolean productionPaymentExecutionEnabled,
        boolean credentialsConfigured,
        boolean webhookSecretConfigured,
        boolean autoCaptureFallbackEnabled,
        boolean webhookWorkerEnabled,
        long webhookBacklog,
        long webhookDeadLetters,
        List<String> blockers
    ) {}
}
