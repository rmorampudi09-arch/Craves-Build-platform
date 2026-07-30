package in.craves.integration.payment;

import in.craves.integration.config.PaymentProviderProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CashfreeProductionReadinessService {
    private final PaymentProviderProperties provider;
    private final CashfreeWebhookProperties webhook;

    public CashfreeProductionReadinessService(
        PaymentProviderProperties provider,
        CashfreeWebhookProperties webhook
    ) {
        this.provider = provider;
        this.webhook = webhook;
    }

    public ReadinessResponse status() {
        List<String> blockers = new ArrayList<>();
        if (!"PRODUCTION".equals(provider.normalizedEnvironment())) {
            blockers.add("PAYMENT_ENVIRONMENT_NOT_PRODUCTION");
        }
        if (!provider.productionActivationApproved()) {
            blockers.add("PRODUCTION_ACTIVATION_NOT_APPROVED");
        }
        if (!StringUtils.hasText(provider.clientId())) {
            blockers.add("CLIENT_ID_SECRET_NOT_BOUND");
        }
        if (!StringUtils.hasText(provider.clientKey())) {
            blockers.add("CLIENT_KEY_SECRET_NOT_BOUND");
        }
        if (!StringUtils.hasText(provider.webhookUrl())) {
            blockers.add("WEBHOOK_URL_NOT_CONFIGURED");
        }
        if (!webhook.isWorkerEnabled()) {
            blockers.add("WEBHOOK_WORKER_DISABLED");
        }
        if (!StringUtils.hasText(provider.apiVersion())) {
            blockers.add("API_VERSION_NOT_CONFIGURED");
        }
        return new ReadinessResponse(
            provider.normalizedEnvironment(),
            blockers.isEmpty() && provider.productionReady(),
            webhook.isWorkerEnabled(),
            provider.apiVersion(),
            provider.allowedWebhookVersions().stream().sorted().toList(),
            List.copyOf(blockers)
        );
    }

    public record ReadinessResponse(
        String environment,
        boolean productionReady,
        boolean webhookWorkerEnabled,
        String apiVersion,
        List<String> allowedWebhookVersions,
        List<String> blockers
    ) {
    }
}
