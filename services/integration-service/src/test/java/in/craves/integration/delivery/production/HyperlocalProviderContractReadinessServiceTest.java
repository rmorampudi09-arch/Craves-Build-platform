package in.craves.integration.delivery.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.integration.config.DeliveryProviderContractProperties;
import in.craves.integration.config.DeliveryProviderContractProperties.Contract;
import in.craves.integration.delivery.DeliveryIntelligenceModels.ProviderResponse;
import in.craves.integration.delivery.DeliveryProviderRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class HyperlocalProviderContractReadinessServiceTest {

    @Test
    void defaultsKeepEveryPartnerGatedProviderFailClosed() {
        DeliveryProviderContractProperties contracts = new DeliveryProviderContractProperties();
        DeliveryProviderRepository providers = mock(DeliveryProviderRepository.class);
        when(providers.find("shadowfax")).thenReturn(Optional.empty());
        when(providers.find("porter")).thenReturn(Optional.empty());
        when(providers.find("delhivery")).thenReturn(Optional.empty());

        HyperlocalProviderContractReadinessService service =
            new HyperlocalProviderContractReadinessService(contracts, providers, List.of());

        var matrix = service.matrix();
        for (var status : matrix.providers()) {
            assertThat(status.vendorContractReady()).isFalse();
            assertThat(status.executableAdapterRegistered()).isFalse();
            assertThat(status.routingEligible()).isFalse();
            assertThat(status.blockers()).contains(
                "VENDOR_CONTRACT_NOT_VERIFIED",
                "CONTRACT_VERSION_NOT_RECORDED",
                "CREDENTIAL_MODEL_NOT_VERIFIED",
                "SERVICEABILITY_SCHEMA_NOT_VERIFIED",
                "QUOTE_SCHEMA_NOT_VERIFIED",
                "CREATE_SCHEMA_NOT_VERIFIED",
                "CANCEL_SCHEMA_NOT_VERIFIED",
                "TRACK_SCHEMA_NOT_VERIFIED",
                "WEBHOOK_SCHEMA_NOT_VERIFIED",
                "CREATE_RECONCILIATION_NOT_VERIFIED",
                "HYDERABAD_SERVICEABILITY_NOT_VERIFIED",
                "EXECUTABLE_ADAPTER_NOT_DEPLOYED",
                "PROVIDER_CATALOG_INACTIVE"
            );
        }
    }

    @Test
    void verifiedPaperContractStillCannotRouteWithoutRealAdapterAndCatalogActivation() {
        DeliveryProviderContractProperties contracts = new DeliveryProviderContractProperties();
        verifyAll(contracts.getPorter(), "porter-enterprise-contract-v1");
        DeliveryProviderRepository providers = mock(DeliveryProviderRepository.class);
        when(providers.find("shadowfax")).thenReturn(Optional.empty());
        when(providers.find("porter")).thenReturn(Optional.empty());
        when(providers.find("delhivery")).thenReturn(Optional.empty());

        HyperlocalProviderContractReadinessService service =
            new HyperlocalProviderContractReadinessService(contracts, providers, List.of());

        var porter = provider(service.matrix(), "PORTER");
        assertThat(porter.vendorContractReady()).isTrue();
        assertThat(porter.routingEligible()).isFalse();
        assertThat(porter.blockers()).containsExactly(
            "EXECUTABLE_ADAPTER_NOT_DEPLOYED",
            "PROVIDER_CATALOG_INACTIVE"
        );
    }

    @Test
    void providerBecomesRoutingEligibleOnlyAfterAllThreeIndependentGatesPass() {
        DeliveryProviderContractProperties contracts = new DeliveryProviderContractProperties();
        verifyAll(contracts.getShadowfax(), "shadowfax-hyperlocal-contract-v1");

        DeliveryProviderRepository providers = mock(DeliveryProviderRepository.class);
        when(providers.find("shadowfax")).thenReturn(Optional.of(providerRecord("shadowfax", true)));
        when(providers.find("porter")).thenReturn(Optional.empty());
        when(providers.find("delhivery")).thenReturn(Optional.empty());

        DeliveryProviderAdapter shadowfax = mock(DeliveryProviderAdapter.class);
        when(shadowfax.providerId()).thenReturn("shadowfax");

        HyperlocalProviderContractReadinessService service =
            new HyperlocalProviderContractReadinessService(
                contracts,
                providers,
                List.of(shadowfax)
            );

        var status = provider(service.matrix(), "SHADOWFAX");
        assertThat(status.vendorContractReady()).isTrue();
        assertThat(status.executableAdapterRegistered()).isTrue();
        assertThat(status.providerCatalogActive()).isTrue();
        assertThat(status.routingEligible()).isTrue();
        assertThat(status.blockers()).isEmpty();
    }

    private static void verifyAll(Contract contract, String version) {
        contract.setContractVerified(true);
        contract.setCredentialModelVerified(true);
        contract.setServiceabilitySchemaVerified(true);
        contract.setQuoteSchemaVerified(true);
        contract.setCreateSchemaVerified(true);
        contract.setCancelSchemaVerified(true);
        contract.setTrackSchemaVerified(true);
        contract.setWebhookSchemaVerified(true);
        contract.setCreateReconciliationVerified(true);
        contract.setHyderabadServiceabilityVerified(true);
        contract.setContractVersion(version);
    }

    private static ProviderResponse providerRecord(String providerId, boolean active) {
        Instant now = Instant.parse("2026-08-19T10:00:00Z");
        return new ProviderResponse(
            providerId,
            providerId,
            "EXTERNAL",
            active,
            List.of("HYDERABAD"),
            Map.of("delivery", true),
            now,
            now
        );
    }

    private static HyperlocalProviderContractReadinessService.ProviderContractReadiness provider(
        HyperlocalProviderContractReadinessService.ContractReadinessMatrix matrix,
        String name
    ) {
        return matrix.providers().stream()
            .filter(item -> item.provider().equals(name))
            .findFirst()
            .orElseThrow();
    }
}
