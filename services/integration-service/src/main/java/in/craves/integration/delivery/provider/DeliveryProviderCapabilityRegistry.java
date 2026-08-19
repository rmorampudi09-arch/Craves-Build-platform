package in.craves.integration.delivery.provider;

import static in.craves.integration.delivery.provider.DeliveryProviderCapability.CANCEL_DELIVERY;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.CREATE_DELIVERY;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.CREATE_RECONCILIATION;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.DELIVERY_VERIFICATION;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.LIVE_COURIER_LOCATION;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.MULTI_STOP;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.NDR_ACTION;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.PROOF_OF_DELIVERY;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.PROVIDER_ETA;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.QUOTE;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.QUOTE_ETA;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.RETURN_TRACKING;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.SERVICEABILITY;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.TRACK;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.TRACKING_LINK;
import static in.craves.integration.delivery.provider.DeliveryProviderCapability.WEBHOOK_STATUS;

import in.craves.integration.delivery.telemetry.DeliveryTelemetryExtractor;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Engineering capability matrix for every delivery provider represented by Craves.
 *
 * <p>The matrix intentionally separates public/provider capability knowledge from runtime activation.
 * A provider can support a feature without being contract-ready or enabled in Craves. This service must
 * never be used as a provider ranking table.</p>
 */
@Service
public class DeliveryProviderCapabilityRegistry {
    private final Set<String> runtimeAdapters;
    private final Set<String> runtimeTelemetryExtractors;

    public DeliveryProviderCapabilityRegistry(
        List<DeliveryProviderAdapter> adapters,
        List<DeliveryTelemetryExtractor> telemetryExtractors
    ) {
        this.runtimeAdapters = adapters.stream()
            .map(DeliveryProviderAdapter::providerId)
            .map(DeliveryProviderCapabilityRegistry::normalize)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
        this.runtimeTelemetryExtractors = telemetryExtractors.stream()
            .map(DeliveryTelemetryExtractor::providerId)
            .map(DeliveryProviderCapabilityRegistry::normalize)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    public CapabilityMatrix matrix() {
        return new CapabilityMatrix(List.of(
            profile(
                "borzo",
                "Borzo",
                "BUSINESS_API",
                borzoCapabilities(),
                "Public provider API; Craves adapter is implemented."
            ),
            profile(
                "shiprocket",
                "Shiprocket Quick",
                "HYPERLOCAL_AGGREGATOR",
                shiprocketCapabilities(),
                "Public Shiprocket API; Craves adapter is implemented."
            ),
            profile(
                "shadowfax",
                "Shadowfax",
                "HYPERLOCAL_MARKETPLACE",
                shadowfaxCapabilities(),
                "Exact transaction/auth/webhook contract remains partner-gated and must be verified before execution."
            ),
            profile(
                "porter",
                "Porter",
                "INTRACITY_2W",
                porterCapabilities(),
                "Public feature surface exists; executable API credentials/contract must be verified before execution."
            ),
            profile(
                "delhivery",
                "Delhivery Direct Intracity",
                "DIRECT_INTRACITY",
                delhiveryCapabilities(),
                "Hyderabad intracity product is represented, but its exact executable API contract remains fail-closed until verified."
            )
        ));
    }

    private ProviderCapabilityProfile profile(
        String providerId,
        String displayName,
        String productFamily,
        Map<DeliveryProviderCapability, CapabilityAvailability> capabilities,
        String note
    ) {
        String normalized = normalize(providerId);
        return new ProviderCapabilityProfile(
            normalized,
            displayName,
            productFamily,
            runtimeAdapters.contains(normalized),
            runtimeTelemetryExtractors.contains(normalized),
            Map.copyOf(capabilities),
            note
        );
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> borzoCapabilities() {
        return capabilities(Map.ofEntries(
            Map.entry(SERVICEABILITY, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(QUOTE, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(QUOTE_ETA, CapabilityAvailability.SUPPORTED_NOT_WIRED),
            Map.entry(CREATE_DELIVERY, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(CANCEL_DELIVERY, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(TRACK, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(TRACKING_LINK, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(WEBHOOK_STATUS, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(LIVE_COURIER_LOCATION, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(PROVIDER_ETA, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(DELIVERY_VERIFICATION, CapabilityAvailability.SUPPORTED_NOT_WIRED),
            Map.entry(PROOF_OF_DELIVERY, CapabilityAvailability.SUPPORTED_NOT_WIRED),
            Map.entry(NDR_ACTION, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(RETURN_TRACKING, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(CREATE_RECONCILIATION, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(MULTI_STOP, CapabilityAvailability.SUPPORTED_NOT_WIRED)
        ));
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> shiprocketCapabilities() {
        return capabilities(Map.ofEntries(
            Map.entry(SERVICEABILITY, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(QUOTE, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(QUOTE_ETA, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(CREATE_DELIVERY, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(CANCEL_DELIVERY, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(TRACK, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(TRACKING_LINK, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(WEBHOOK_STATUS, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(LIVE_COURIER_LOCATION, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(PROVIDER_ETA, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(DELIVERY_VERIFICATION, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(PROOF_OF_DELIVERY, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(NDR_ACTION, CapabilityAvailability.SUPPORTED_NOT_WIRED),
            Map.entry(RETURN_TRACKING, CapabilityAvailability.SUPPORTED_NOT_WIRED),
            Map.entry(CREATE_RECONCILIATION, CapabilityAvailability.AVAILABLE_NOW),
            Map.entry(MULTI_STOP, CapabilityAvailability.NOT_VERIFIED)
        ));
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> shadowfaxCapabilities() {
        return capabilities(Map.ofEntries(
            Map.entry(SERVICEABILITY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(QUOTE, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(QUOTE_ETA, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(CREATE_DELIVERY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(CANCEL_DELIVERY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(TRACK, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(TRACKING_LINK, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(WEBHOOK_STATUS, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(LIVE_COURIER_LOCATION, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(PROVIDER_ETA, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(DELIVERY_VERIFICATION, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(PROOF_OF_DELIVERY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(NDR_ACTION, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(RETURN_TRACKING, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(CREATE_RECONCILIATION, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(MULTI_STOP, CapabilityAvailability.NOT_VERIFIED)
        ));
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> porterCapabilities() {
        return capabilities(Map.ofEntries(
            Map.entry(SERVICEABILITY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(QUOTE, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(QUOTE_ETA, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(CREATE_DELIVERY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(CANCEL_DELIVERY, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(TRACK, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(TRACKING_LINK, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(WEBHOOK_STATUS, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(LIVE_COURIER_LOCATION, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(PROVIDER_ETA, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(DELIVERY_VERIFICATION, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(PROOF_OF_DELIVERY, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(NDR_ACTION, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(RETURN_TRACKING, CapabilityAvailability.NOT_VERIFIED),
            Map.entry(CREATE_RECONCILIATION, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED),
            Map.entry(MULTI_STOP, CapabilityAvailability.NOT_SUPPORTED)
        ));
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> delhiveryCapabilities() {
        EnumMap<DeliveryProviderCapability, CapabilityAvailability> values = new EnumMap<>(DeliveryProviderCapability.class);
        for (DeliveryProviderCapability capability : DeliveryProviderCapability.values()) {
            values.put(capability, CapabilityAvailability.PRIVATE_CONTRACT_REQUIRED);
        }
        values.put(DELIVERY_VERIFICATION, CapabilityAvailability.NOT_VERIFIED);
        values.put(PROOF_OF_DELIVERY, CapabilityAvailability.NOT_VERIFIED);
        values.put(NDR_ACTION, CapabilityAvailability.NOT_VERIFIED);
        values.put(MULTI_STOP, CapabilityAvailability.NOT_VERIFIED);
        return Map.copyOf(values);
    }

    private static Map<DeliveryProviderCapability, CapabilityAvailability> capabilities(
        Map<DeliveryProviderCapability, CapabilityAvailability> values
    ) {
        EnumMap<DeliveryProviderCapability, CapabilityAvailability> result =
            new EnumMap<>(DeliveryProviderCapability.class);
        for (DeliveryProviderCapability capability : DeliveryProviderCapability.values()) {
            result.put(capability, values.getOrDefault(capability, CapabilityAvailability.NOT_VERIFIED));
        }
        return Map.copyOf(result);
    }

    private static String normalize(String providerId) {
        return providerId == null ? "" : providerId.trim().toLowerCase(Locale.ROOT);
    }

    public enum CapabilityAvailability {
        AVAILABLE_NOW,
        SUPPORTED_NOT_WIRED,
        PRIVATE_CONTRACT_REQUIRED,
        NOT_VERIFIED,
        NOT_SUPPORTED
    }

    public record CapabilityMatrix(List<ProviderCapabilityProfile> providers) {
    }

    public record ProviderCapabilityProfile(
        String providerId,
        String displayName,
        String productFamily,
        boolean runtimeAdapterRegistered,
        boolean runtimeTelemetryExtractorRegistered,
        Map<DeliveryProviderCapability, CapabilityAvailability> capabilities,
        String note
    ) {
    }
}
