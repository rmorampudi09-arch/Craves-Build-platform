package in.craves.integration.delivery.production;

import in.craves.integration.config.DeliveryProviderContractProperties;
import in.craves.integration.config.DeliveryProviderContractProperties.Contract;
import in.craves.integration.delivery.DeliveryProviderRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * Reports exactly what is still missing before the partner-gated hyperlocal providers can become
 * executable. This is intentionally independent from provider activation: contract verification,
 * a deployed adapter and an active catalog row are separate gates.
 */
@Service
public class HyperlocalProviderContractReadinessService {
    private final DeliveryProviderContractProperties contracts;
    private final DeliveryProviderRepository providerRepository;
    private final Set<String> adapterIds;

    public HyperlocalProviderContractReadinessService(
        DeliveryProviderContractProperties contracts,
        DeliveryProviderRepository providerRepository,
        List<DeliveryProviderAdapter> adapters
    ) {
        this.contracts = contracts;
        this.providerRepository = providerRepository;
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (DeliveryProviderAdapter adapter : adapters) {
            ids.add(normalize(adapter.providerId()));
        }
        this.adapterIds = Set.copyOf(ids);
    }

    public ContractReadinessMatrix matrix() {
        return new ContractReadinessMatrix(List.of(
            readiness("SHADOWFAX", "HYPERLOCAL_MARKETPLACE", contracts.getShadowfax()),
            readiness("PORTER", "INTRACITY_2W", contracts.getPorter()),
            readiness("DELHIVERY", "DIRECT_INTRACITY", contracts.getDelhivery())
        ));
    }

    private ProviderContractReadiness readiness(String provider,
                                                 String productFamily,
                                                 Contract contract) {
        String providerId = normalize(provider);
        List<String> blockers = new ArrayList<>();

        if (!contract.isContractVerified()) {
            blockers.add("VENDOR_CONTRACT_NOT_VERIFIED");
        }
        if (!StringUtils.hasText(contract.getContractVersion())) {
            blockers.add("CONTRACT_VERSION_NOT_RECORDED");
        }
        if (!contract.isCredentialModelVerified()) {
            blockers.add("CREDENTIAL_MODEL_NOT_VERIFIED");
        }
        if (!contract.isServiceabilitySchemaVerified()) {
            blockers.add("SERVICEABILITY_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isQuoteSchemaVerified()) {
            blockers.add("QUOTE_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isCreateSchemaVerified()) {
            blockers.add("CREATE_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isCancelSchemaVerified()) {
            blockers.add("CANCEL_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isTrackSchemaVerified()) {
            blockers.add("TRACK_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isWebhookSchemaVerified()) {
            blockers.add("WEBHOOK_SCHEMA_NOT_VERIFIED");
        }
        if (!contract.isCreateReconciliationVerified()) {
            blockers.add("CREATE_RECONCILIATION_NOT_VERIFIED");
        }
        if (!contract.isHyderabadServiceabilityVerified()) {
            blockers.add("HYDERABAD_SERVICEABILITY_NOT_VERIFIED");
        }

        boolean adapterRegistered = adapterIds.contains(providerId);
        if (!adapterRegistered) {
            blockers.add("EXECUTABLE_ADAPTER_NOT_DEPLOYED");
        }

        boolean catalogActive = providerRepository.find(providerId)
            .map(response -> response.active())
            .orElse(false);
        if (!catalogActive) {
            blockers.add("PROVIDER_CATALOG_INACTIVE");
        }

        boolean contractReady = contract.executableContractReady();
        return new ProviderContractReadiness(
            provider,
            productFamily,
            contract.getContractVersion(),
            contractReady,
            adapterRegistered,
            catalogActive,
            contractReady && adapterRegistered && catalogActive,
            List.copyOf(blockers)
        );
    }

    private static String normalize(String providerId) {
        return providerId.trim().toLowerCase(Locale.ROOT);
    }

    public record ContractReadinessMatrix(List<ProviderContractReadiness> providers) {}

    public record ProviderContractReadiness(
        String provider,
        String productFamily,
        String contractVersion,
        boolean vendorContractReady,
        boolean executableAdapterRegistered,
        boolean providerCatalogActive,
        boolean routingEligible,
        List<String> blockers
    ) {}
}
