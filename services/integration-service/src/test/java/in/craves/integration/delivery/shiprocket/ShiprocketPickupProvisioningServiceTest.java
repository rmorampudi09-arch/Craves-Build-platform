package in.craves.integration.delivery.shiprocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.ShiprocketPickupProvisioningProperties;
import in.craves.integration.config.ShiprocketProperties;
import in.craves.integration.delivery.PickupLocationProvisioningController.PickupLocationProvisioningRequest;
import in.craves.integration.delivery.provider.DeliveryProviderPickupLocationRepository;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ShiprocketPickupProvisioningServiceTest {
    private static final UUID PICKUP_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final UUID KITCHEN_ID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    private ShiprocketTransport transport;
    private DeliveryProviderPickupLocationRepository repository;
    private ObjectMapper objectMapper;
    private ShiprocketPickupProvisioningService service;

    @BeforeEach
    void setUp() {
        ShiprocketProperties shiprocket = new ShiprocketProperties();
        shiprocket.setEnabled(true);
        shiprocket.setEnvironment("PRODUCTION");
        shiprocket.setProductionActivationApproved(true);
        shiprocket.setEmail("api@example.com");
        shiprocket.setPassword("secret-placeholder");

        ShiprocketPickupProvisioningProperties provisioning = new ShiprocketPickupProvisioningProperties();
        provisioning.setEnabled(true);

        transport = mock(ShiprocketTransport.class);
        repository = mock(DeliveryProviderPickupLocationRepository.class);
        objectMapper = new ObjectMapper();
        service = new ShiprocketPickupProvisioningService(
            shiprocket, provisioning, transport, repository, objectMapper
        );
    }

    @Test
    void returnsExistingVerifiedMappingWithoutProviderMutation() {
        when(repository.findVerifiedExternalLocation("shiprocket", PICKUP_ID))
            .thenReturn(Optional.of("CRV_EXISTING"));

        var result = service.provision(request());

        assertThat(result.externalLocationCode()).isEqualTo("CRV_EXISTING");
        assertThat(result.created()).isFalse();
        verify(transport, never()).mutate(any(), any());
    }

    @Test
    void createsPickupThenReconcilesAndPersistsVerifiedMapping() {
        when(repository.findVerifiedExternalLocation("shiprocket", PICKUP_ID)).thenReturn(Optional.empty());
        when(transport.get(eq("/settings/company/pickup"), eq(Map.of())))
            .thenReturn(emptyPickupList())
            .thenReturn(providerPickup());
        when(transport.mutate(eq("/settings/company/addpickup"), any()))
            .thenReturn(objectMapper.createObjectNode().put("success", true));

        var result = service.provision(request());

        assertThat(result.created()).isTrue();
        assertThat(result.externalLocationCode()).isEqualTo(
            ShiprocketPickupProvisioningService.externalLocationCode(PICKUP_ID)
        );
        verify(repository).upsertVerified(
            eq("shiprocket"), eq(PICKUP_ID), eq(result.externalLocationCode()), any()
        );
    }

    @Test
    void uncertainCreateIsReconciledBeforeAnyRetry() {
        when(repository.findVerifiedExternalLocation("shiprocket", PICKUP_ID)).thenReturn(Optional.empty());
        when(transport.get(eq("/settings/company/pickup"), eq(Map.of())))
            .thenReturn(emptyPickupList())
            .thenReturn(providerPickup());
        when(transport.mutate(eq("/settings/company/addpickup"), any()))
            .thenThrow(new ShiprocketApiException(null, "response lost", true));

        var result = service.provision(request());

        assertThat(result.created()).isTrue();
        verify(transport).mutate(eq("/settings/company/addpickup"), any());
        verify(repository).upsertVerified(eq("shiprocket"), eq(PICKUP_ID), any(), any());
    }

    private PickupLocationProvisioningRequest request() {
        return new PickupLocationProvisioningRequest(
            PICKUP_ID,
            KITCHEN_ID,
            2,
            "Home Kitchen",
            "+91 98765 43210",
            "chef@example.com",
            "12 Lake View Road",
            "Flat 3A",
            "Near Park",
            "Madhapur",
            "Hyderabad",
            "Telangana",
            "500081",
            new BigDecimal("17.4500000"),
            new BigDecimal("78.3900000"),
            "India"
        );
    }

    private ObjectNode emptyPickupList() {
        ObjectNode root = objectMapper.createObjectNode();
        root.putObject("data").putArray("shipping_address");
        return root;
    }

    private ObjectNode providerPickup() {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode list = root.putObject("data").putArray("shipping_address");
        ObjectNode pickup = list.addObject();
        pickup.put("id", "provider-123");
        pickup.put("pickup_location", ShiprocketPickupProvisioningService.externalLocationCode(PICKUP_ID));
        pickup.put("address", "12 Lake View Road");
        pickup.put("city", "Hyderabad");
        pickup.put("state", "Telangana");
        pickup.put("pin_code", "500081");
        return root;
    }
}
