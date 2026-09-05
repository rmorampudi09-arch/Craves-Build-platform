package in.craves.integration.delivery.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.telemetry.DeliveryTelemetryExtractor;
import java.util.List;
import org.junit.jupiter.api.Test;

class DeliveryProviderCapabilityRegistryTest {

    @Test
    void representsAllCravesProvidersWithoutCommercialRanking() {
        DeliveryProviderAdapter borzo = mock(DeliveryProviderAdapter.class);
        DeliveryProviderAdapter shiprocket = mock(DeliveryProviderAdapter.class);
        when(borzo.providerId()).thenReturn("borzo");
        when(shiprocket.providerId()).thenReturn("shiprocket");

        DeliveryTelemetryExtractor borzoTelemetry = mock(DeliveryTelemetryExtractor.class);
        DeliveryTelemetryExtractor shiprocketTelemetry = mock(DeliveryTelemetryExtractor.class);
        when(borzoTelemetry.providerId()).thenReturn("borzo");
        when(shiprocketTelemetry.providerId()).thenReturn("shiprocket");

        DeliveryProviderCapabilityRegistry registry = new DeliveryProviderCapabilityRegistry(
            List.of(borzo, shiprocket),
            List.of(borzoTelemetry, shiprocketTelemetry)
        );

        var matrix = registry.matrix();
        assertThat(matrix.providers())
            .extracting(DeliveryProviderCapabilityRegistry.ProviderCapabilityProfile::providerId)
            .containsExactly("borzo", "shiprocket", "shadowfax", "porter", "delhivery");

        var shiprocketProfile = provider(matrix, "shiprocket");
        assertThat(shiprocketProfile.runtimeAdapterRegistered()).isTrue();
        assertThat(shiprocketProfile.runtimeTelemetryExtractorRegistered()).isTrue();
        assertThat(shiprocketProfile.capabilities().get(DeliveryProviderCapability.LIVE_COURIER_LOCATION))
            .isEqualTo(DeliveryProviderCapabilityRegistry.CapabilityAvailability.AVAILABLE_NOW);
        assertThat(shiprocketProfile.capabilities().get(DeliveryProviderCapability.NDR_ACTION))
            .isEqualTo(DeliveryProviderCapabilityRegistry.CapabilityAvailability.SUPPORTED_NOT_WIRED);

        var shadowfaxProfile = provider(matrix, "shadowfax");
        assertThat(shadowfaxProfile.runtimeAdapterRegistered()).isFalse();
        assertThat(shadowfaxProfile.capabilities().get(DeliveryProviderCapability.LIVE_COURIER_LOCATION))
            .isEqualTo(DeliveryProviderCapabilityRegistry.CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED);

        var porterProfile = provider(matrix, "porter");
        assertThat(porterProfile.capabilities().get(DeliveryProviderCapability.MULTI_STOP))
            .isEqualTo(DeliveryProviderCapabilityRegistry.CapabilityAvailability.NOT_SUPPORTED);
    }

    private static DeliveryProviderCapabilityRegistry.ProviderCapabilityProfile provider(
        DeliveryProviderCapabilityRegistry.CapabilityMatrix matrix,
        String providerId
    ) {
        return matrix.providers().stream()
            .filter(provider -> provider.providerId().equals(providerId))
            .findFirst()
            .orElseThrow();
    }
}
