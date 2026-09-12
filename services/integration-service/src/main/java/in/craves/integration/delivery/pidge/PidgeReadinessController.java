package in.craves.integration.delivery.pidge;

import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryProviderCatalogRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/delivery-provider-readiness/pidge")
public class PidgeReadinessController {
    private final PidgeProperties properties;
    private final DeliveryCommandProperties delivery;
    private final DeliveryProviderCatalogRepository catalog;
    private final InternalRequestAuthorizer authorizer;
    private final PidgeApiClient client;
    public PidgeReadinessController(PidgeProperties properties, DeliveryCommandProperties delivery,
        DeliveryProviderCatalogRepository catalog, InternalRequestAuthorizer authorizer, PidgeApiClient client) {
        this.properties=properties; this.delivery=delivery; this.catalog=catalog; this.authorizer=authorizer; this.client=client;
    }
    @GetMapping
    public Readiness status(@RequestHeader("X-Craves-Internal-Secret") String key) {
        authorizer.requireValid(key);
        List<String> blockers = new ArrayList<>();
        if (!properties.isEnabled()) blockers.add("PIDGE_API_DISABLED");
        if (!properties.credentialReady()) blockers.add("PIDGE_API_TOKEN_NOT_BOUND");
        if (!properties.isCreateEnabled()) blockers.add("PIDGE_CREATE_DISABLED");
        if (!properties.isProductionActivationApproved()) blockers.add("PRODUCTION_ACTIVATION_NOT_APPROVED");
        if (!properties.isManualAllocationVerified()) blockers.add("MANUAL_ALLOCATION_NOT_VERIFIED");
        if (!properties.isWebhookVerified()) blockers.add("AUTHENTICATED_WEBHOOK_NOT_VERIFIED");
        if (properties.getWebhookToken().isBlank()) blockers.add("WEBHOOK_TOKEN_NOT_BOUND");
        if (!delivery.isEnabled()) blockers.add("DELIVERY_COMMANDS_DISABLED");
        if (!delivery.isReconciliationEnabled()) blockers.add("CREATE_RECONCILIATION_DISABLED");
        if (!delivery.isWebhookProcessingEnabled()) blockers.add("WEBHOOK_PROCESSOR_DISABLED");
        if (!delivery.isTrackingReconciliationEnabled()) blockers.add("TRACKING_RECONCILIATION_DISABLED");
        if (!delivery.isStatusPublisherEnabled()) blockers.add("STATUS_PUBLISHER_DISABLED");
        boolean active = catalog.activeProviderIds().stream().anyMatch("pidge"::equalsIgnoreCase);
        if (!active) blockers.add("PROVIDER_CATALOG_INACTIVE");
        return new Readiness("PIDGE", properties.getEnvironment(), blockers.isEmpty() && properties.productionCreateReady(), active, List.copyOf(blockers));
    }
    /** Explicit diagnostic only: one chargeable quote request, no order creation. */
    @PostMapping("/quote")
    public ProviderQuote quote(@RequestHeader("X-Craves-Internal-Secret") String key, @RequestBody QuoteRequest request) {
        authorizer.requireValid(key);
        return client.readOnlyQuote(request);
    }
    public record Readiness(String providerId, String environment, boolean productionReady, boolean catalogActive, List<String> blockers) {}
}
