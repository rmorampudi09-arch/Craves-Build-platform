package in.craves.integration.delivery.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.DeliveryIntelligenceModels.ProviderResponse;
import in.craves.integration.delivery.DeliveryProviderRepository;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderPickupLocationRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class DeliveryProviderReadinessServiceTest {

    @Test
    void matrixKeepsVendorGatedProvidersExplicitlyBlocked() {
        BorzoProperties borzo = mock(BorzoProperties.class);
        DeliveryCommandProperties delivery = mock(DeliveryCommandProperties.class);
        DeliveryProviderRepository providers = mock(DeliveryProviderRepository.class);
        DeliveryProviderPickupLocationRepository pickups = mock(DeliveryProviderPickupLocationRepository.class);

        when(borzo.normalizedEnvironment()).thenReturn("SANDBOX");
        when(borzo.normalizedBaseUrl()).thenReturn("https://robotapitest-in.borzodelivery.com/api/business/1.8");
        when(providers.find("borzo")).thenReturn(Optional.empty());
        when(providers.find("shadowfax")).thenReturn(Optional.empty());
        when(providers.find("porter")).thenReturn(Optional.empty());
        when(providers.find("delhivery")).thenReturn(Optional.empty());
        when(pickups.countVerified("shadowfax")).thenReturn(0);
        when(pickups.countVerified("porter")).thenReturn(0);
        when(pickups.countVerified("delhivery")).thenReturn(0);

        DeliveryProviderReadinessService service = new DeliveryProviderReadinessService(
            borzo,
            delivery,
            providers,
            pickups,
            List.of()
        );

        var matrix = service.matrix();

        assertThat(provider(matrix, "SHADOWFAX").blockers())
            .contains("VENDOR_PRIVATE_API_CONTRACT_REQUIRED", "COMMAND_ADAPTER_NOT_REGISTERED", "PROVIDER_CATALOG_INACTIVE");
        assertThat(provider(matrix, "PORTER").blockers())
            .contains("ENTERPRISE_API_ONBOARDING_REQUIRED", "COMMAND_ADAPTER_NOT_REGISTERED", "PROVIDER_CATALOG_INACTIVE");
        assertThat(provider(matrix, "DELHIVERY").blockers())
            .contains("INTRACITY_API_PRODUCT_NOT_VERIFIED", "COMMAND_ADAPTER_NOT_REGISTERED", "PROVIDER_CATALOG_INACTIVE");
    }

    @Test
    void vendorContractBlockersRemainAuthoritativeEvenIfCatalogIsAccidentallyActivated() {
        BorzoProperties borzo = mock(BorzoProperties.class);
        DeliveryCommandProperties delivery = mock(DeliveryCommandProperties.class);
        DeliveryProviderRepository providers = mock(DeliveryProviderRepository.class);
        DeliveryProviderPickupLocationRepository pickups = mock(DeliveryProviderPickupLocationRepository.class);
        DeliveryProviderAdapter shadowfax = adapter("shadowfax");
        DeliveryProviderAdapter porter = adapter("porter");
        DeliveryProviderAdapter delhivery = adapter("delhivery");

        when(borzo.normalizedEnvironment()).thenReturn("SANDBOX");
        when(borzo.normalizedBaseUrl()).thenReturn("https://robotapitest-in.borzodelivery.com/api/business/1.8");
        when(providers.find("borzo")).thenReturn(Optional.empty());
        when(providers.find("shadowfax")).thenReturn(Optional.of(providerRecord("shadowfax", true)));
        when(providers.find("porter")).thenReturn(Optional.of(providerRecord("porter", true)));
        when(providers.find("delhivery")).thenReturn(Optional.of(providerRecord("delhivery", true)));
        when(pickups.countVerified("shadowfax")).thenReturn(5);
        when(pickups.countVerified("porter")).thenReturn(5);
        when(pickups.countVerified("delhivery")).thenReturn(5);

        DeliveryProviderReadinessService service = new DeliveryProviderReadinessService(
            borzo,
            delivery,
            providers,
            pickups,
            List.of(shadowfax, porter, delhivery)
        );

        var matrix = service.matrix();

        assertThat(provider(matrix, "SHADOWFAX")).satisfies(status -> {
            assertThat(status.commandAdapterRegistered()).isTrue();
            assertThat(status.providerCatalogActive()).isTrue();
            assertThat(status.productionReady()).isFalse();
            assertThat(status.providerCreateEnabled()).isFalse();
            assertThat(status.blockers()).contains("VENDOR_PRIVATE_API_CONTRACT_REQUIRED");
        });
        assertThat(provider(matrix, "PORTER")).satisfies(status -> {
            assertThat(status.commandAdapterRegistered()).isTrue();
            assertThat(status.providerCatalogActive()).isTrue();
            assertThat(status.productionReady()).isFalse();
            assertThat(status.providerCreateEnabled()).isFalse();
            assertThat(status.blockers()).contains("ENTERPRISE_API_ONBOARDING_REQUIRED");
        });
        assertThat(provider(matrix, "DELHIVERY")).satisfies(status -> {
            assertThat(status.commandAdapterRegistered()).isTrue();
            assertThat(status.providerCatalogActive()).isTrue();
            assertThat(status.productionReady()).isFalse();
            assertThat(status.providerCreateEnabled()).isFalse();
            assertThat(status.blockers()).contains("INTRACITY_API_PRODUCT_NOT_VERIFIED");
        });
    }

    private static DeliveryProviderAdapter adapter(String providerId) {
        DeliveryProviderAdapter adapter = mock(DeliveryProviderAdapter.class);
        when(adapter.providerId()).thenReturn(providerId);
        return adapter;
    }

    private static ProviderResponse providerRecord(String providerId, boolean active) {
        Instant now = Instant.parse("2026-08-16T10:00:00Z");
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

    private static DeliveryProviderReadinessService.ProviderReadiness provider(
        DeliveryProviderReadinessService.ReadinessMatrix matrix,
        String name
    ) {
        return matrix.providers().stream()
            .filter(item -> item.provider().equals(name))
            .findFirst()
            .orElseThrow();
    }
}
