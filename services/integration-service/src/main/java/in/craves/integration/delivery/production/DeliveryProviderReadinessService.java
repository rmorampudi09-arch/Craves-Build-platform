package in.craves.integration.delivery.production;

import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DeliveryProviderReadinessService {
    private final BorzoProperties borzo;
    private final DeliveryCommandProperties delivery;

    public DeliveryProviderReadinessService(BorzoProperties borzo, DeliveryCommandProperties delivery) {
        this.borzo = borzo;
        this.delivery = delivery;
    }

    public ReadinessResponse status() {
        List<String> blockers = new ArrayList<>();
        if (!"PRODUCTION".equals(borzo.normalizedEnvironment())) {
            blockers.add("BORZO_API_ENVIRONMENT_NOT_PRODUCTION");
        }
        if (!borzo.isProductionActivationApproved()) {
            blockers.add("PRODUCTION_ACTIVATION_NOT_APPROVED");
        }
        if (!StringUtils.hasText(borzo.getAuthToken())) {
            blockers.add("AUTH_TOKEN_SECRET_NOT_BOUND");
        }
        if (!StringUtils.hasText(borzo.getCallbackSecret())) {
            blockers.add("CALLBACK_SECRET_NOT_BOUND");
        }
        if (!StringUtils.hasText(borzo.getCallbackUrl())) {
            blockers.add("CALLBACK_URL_NOT_CONFIGURED");
        }
        if (StringUtils.hasText(borzo.getCallbackUrl())) {
            URI callback = URI.create(borzo.getCallbackUrl());
            if (!"https".equalsIgnoreCase(callback.getScheme())) {
                blockers.add("CALLBACK_URL_NOT_HTTPS");
            }
        }
        String baseUrl = borzo.normalizedBaseUrl().toLowerCase();
        if (baseUrl.contains("test") || baseUrl.contains("sandbox")) {
            blockers.add("PROVIDER_BASE_URL_IS_NON_PRODUCTION");
        }
        if (!StringUtils.hasText(delivery.getFullyQualifiedNamespace())
            && !StringUtils.hasText(delivery.getConnectionString())) {
            blockers.add("SERVICE_BUS_NOT_CONFIGURED");
        }
        if (!delivery.isWebhookProcessingEnabled()) {
            blockers.add("WEBHOOK_PROCESSOR_DISABLED");
        }
        if (!delivery.isTrackingReconciliationEnabled()) {
            blockers.add("TRACKING_RECONCILIATION_DISABLED");
        }
        if (!delivery.isStatusPublisherEnabled()) {
            blockers.add("DELIVERY_STATUS_PUBLISHER_DISABLED");
        }

        boolean providerCreateEnabled = borzo.isEnabled() && delivery.isEnabled();
        boolean productionReady = blockers.isEmpty() && borzo.productionReady();
        return new ReadinessResponse(
            "BORZO",
            borzo.normalizedEnvironment(),
            productionReady,
            providerCreateEnabled,
            delivery.isReconciliationEnabled(),
            delivery.isWebhookProcessingEnabled(),
            delivery.isTrackingReconciliationEnabled(),
            delivery.isStatusPublisherEnabled(),
            List.copyOf(blockers)
        );
    }

    public record ReadinessResponse(
        String provider,
        String environment,
        boolean productionReady,
        boolean providerCreateEnabled,
        boolean createReconciliationEnabled,
        boolean webhookProcessingEnabled,
        boolean trackingReconciliationEnabled,
        boolean statusPublisherEnabled,
        List<String> blockers
    ) {
    }
}
