package in.craves.integration.delivery.shiprocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.ShiprocketPickupProvisioningProperties;
import in.craves.integration.config.ShiprocketProperties;
import in.craves.integration.delivery.PickupLocationProvisioningController.PickupLocationProvisioningRequest;
import in.craves.integration.delivery.provider.DeliveryProviderPickupLocationRepository;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "craves.providers.shiprocket", name = "enabled", havingValue = "true")
public class ShiprocketPickupProvisioningService {
    public static final String PROVIDER_ID = "shiprocket";
    private static final String PICKUP_PREFIX = "CRV";

    private final ShiprocketProperties shiprocketProperties;
    private final ShiprocketPickupProvisioningProperties provisioningProperties;
    private final ShiprocketTransport transport;
    private final DeliveryProviderPickupLocationRepository pickupLocations;
    private final ObjectMapper objectMapper;

    public ShiprocketPickupProvisioningService(
        ShiprocketProperties shiprocketProperties,
        ShiprocketPickupProvisioningProperties provisioningProperties,
        ShiprocketTransport transport,
        DeliveryProviderPickupLocationRepository pickupLocations,
        ObjectMapper objectMapper
    ) {
        this.shiprocketProperties = shiprocketProperties;
        this.provisioningProperties = provisioningProperties;
        this.transport = transport;
        this.pickupLocations = pickupLocations;
        this.objectMapper = objectMapper;
    }

    public ProvisioningResult provision(PickupLocationProvisioningRequest request) {
        validateGate();
        ValidatedPickup pickup = validate(request);

        var existingMapping = pickupLocations.findVerifiedExternalLocation(PROVIDER_ID, pickup.pickupLocationId());
        if (existingMapping.isPresent()) {
            return new ProvisioningResult(PROVIDER_ID, existingMapping.get(), false);
        }

        String externalCode = externalLocationCode(pickup.pickupLocationId());
        JsonNode existingProviderLocation = findProviderLocation(externalCode);
        if (existingProviderLocation != null) {
            verifyProviderLocation(existingProviderLocation, pickup, externalCode);
            persistMapping(pickup, externalCode, existingProviderLocation, false);
            return new ProvisioningResult(PROVIDER_ID, externalCode, false);
        }

        try {
            transport.mutate("/settings/company/addpickup", buildCreateBody(pickup, externalCode));
        } catch (ShiprocketApiException mutationFailure) {
            // Never blindly retry a provider mutation. Reconcile by deterministic pickup code first,
            // because Shiprocket may have committed before a response was lost.
            JsonNode reconciled = findProviderLocation(externalCode);
            if (reconciled == null) {
                throw mutationFailure;
            }
            verifyProviderLocation(reconciled, pickup, externalCode);
            persistMapping(pickup, externalCode, reconciled, true);
            return new ProvisioningResult(PROVIDER_ID, externalCode, true);
        }

        JsonNode created = findProviderLocation(externalCode);
        if (created == null) {
            throw new ShiprocketApiException(
                null,
                "Shiprocket pickup creation returned success but the deterministic pickup could not be reconciled",
                true
            );
        }
        verifyProviderLocation(created, pickup, externalCode);
        persistMapping(pickup, externalCode, created, true);
        return new ProvisioningResult(PROVIDER_ID, externalCode, true);
    }

    private void validateGate() {
        if (!provisioningProperties.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Shiprocket pickup provisioning is disabled");
        }
        if (!shiprocketProperties.isEnabled()
            || !shiprocketProperties.credentialReady()
            || !"PRODUCTION".equals(shiprocketProperties.executionMode())
            || !shiprocketProperties.isProductionActivationApproved()) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Shiprocket pickup provisioning production prerequisites are not satisfied"
            );
        }
    }

    private ValidatedPickup validate(PickupLocationProvisioningRequest request) {
        Objects.requireNonNull(request, "pickup provisioning request is required");
        UUID pickupLocationId = Objects.requireNonNull(request.pickupLocationId(), "pickupLocationId is required");
        UUID kitchenId = Objects.requireNonNull(request.kitchenId(), "kitchenId is required");
        if (request.versionNumber() < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pickup version must be positive");
        }
        String name = required(request.kitchenName(), "kitchenName");
        String email = required(request.contactEmail(), "contactEmail");
        String phone = normalizeIndianPhone(request.contactPhone());
        String address1 = required(request.addressLine1(), "addressLine1");
        if (address1.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Shiprocket pickup addressLine1 exceeds 80 characters");
        }
        String city = required(request.city(), "city");
        String state = required(request.state(), "state");
        String postalCode = required(request.postalCode(), "postalCode");
        if (!postalCode.matches("\\d{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Shiprocket pickup postalCode must contain 6 digits");
        }
        String address2 = Stream.of(request.addressLine2(), request.landmark(), request.areaName())
            .filter(StringUtils::hasText)
            .map(String::trim)
            .distinct()
            .reduce((left, right) -> left + ", " + right)
            .orElse("");
        String country = StringUtils.hasText(request.country()) ? request.country().trim() : "India";
        return new ValidatedPickup(
            pickupLocationId,
            kitchenId,
            request.versionNumber(),
            name,
            email,
            phone,
            address1,
            address2,
            city,
            state,
            postalCode,
            country,
            request.latitude(),
            request.longitude()
        );
    }

    private ObjectNode buildCreateBody(ValidatedPickup pickup, String externalCode) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("pickup_location", externalCode);
        body.put("name", pickup.kitchenName());
        body.put("email", pickup.email());
        body.put("phone", pickup.phone());
        body.put("address", pickup.address1());
        body.put("address_2", pickup.address2());
        body.put("city", pickup.city());
        body.put("state", pickup.state());
        body.put("country", pickup.country());
        body.put("pin_code", pickup.postalCode());
        if (pickup.latitude() != null) {
            body.put("lat", pickup.latitude());
        }
        if (pickup.longitude() != null) {
            body.put("long", pickup.longitude());
        }
        return body;
    }

    private JsonNode findProviderLocation(String externalCode) {
        JsonNode response = transport.get("/settings/company/pickup", Map.of());
        JsonNode addresses = response.path("data").path("shipping_address");
        if (!addresses.isArray()) {
            return null;
        }
        Iterator<JsonNode> iterator = addresses.elements();
        while (iterator.hasNext()) {
            JsonNode item = iterator.next();
            if (externalCode.equalsIgnoreCase(item.path("pickup_location").asText(""))) {
                return item;
            }
        }
        return null;
    }

    private void verifyProviderLocation(JsonNode provider,
                                        ValidatedPickup expected,
                                        String externalCode) {
        String providerAddress = normalized(provider.path("address").asText(""));
        String providerCity = normalized(provider.path("city").asText(""));
        String providerState = normalized(provider.path("state").asText(""));
        String providerPincode = provider.hasNonNull("pin_code")
            ? provider.path("pin_code").asText("")
            : provider.path("pin").asText("");

        boolean matches = normalized(expected.address1()).equals(providerAddress)
            && normalized(expected.city()).equals(providerCity)
            && normalized(expected.state()).equals(providerState)
            && expected.postalCode().equals(providerPincode.trim());
        if (!matches) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Shiprocket pickup code " + externalCode + " already exists with different physical address data"
            );
        }
    }

    private void persistMapping(ValidatedPickup pickup,
                                String externalCode,
                                JsonNode providerLocation,
                                boolean created) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("provider_pickup_id", providerLocation.path("id").asText(""));
        metadata.put("address_fingerprint", addressFingerprint(pickup));
        metadata.put("pickup_version", pickup.versionNumber());
        metadata.put("provisioning_mode", created ? "CREATED_AND_RECONCILED" : "RECONCILED_EXISTING");
        pickupLocations.upsertVerified(
            PROVIDER_ID,
            pickup.pickupLocationId(),
            externalCode,
            metadata.toString()
        );
    }

    static String externalLocationCode(UUID pickupLocationId) {
        return PICKUP_PREFIX + pickupLocationId.toString().replace("-", "").toUpperCase(Locale.ROOT);
    }

    private static String addressFingerprint(ValidatedPickup pickup) {
        String canonical = String.join(
            "|",
            normalized(pickup.address1()),
            normalized(pickup.address2()),
            normalized(pickup.city()),
            normalized(pickup.state()),
            pickup.postalCode(),
            normalized(pickup.country())
        );
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not fingerprint pickup address", ex);
        }
    }

    private static String required(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required for Shiprocket pickup provisioning");
        }
        return value.trim();
    }

    private static String normalizeIndianPhone(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        if (digits.length() != 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "contactPhone must contain a valid 10-digit Indian number");
        }
        return digits;
    }

    private static String normalized(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private record ValidatedPickup(
        UUID pickupLocationId,
        UUID kitchenId,
        int versionNumber,
        String kitchenName,
        String email,
        String phone,
        String address1,
        String address2,
        String city,
        String state,
        String postalCode,
        String country,
        java.math.BigDecimal latitude,
        java.math.BigDecimal longitude
    ) {
    }

    public record ProvisioningResult(String providerId, String externalLocationCode, boolean created) {
    }
}
