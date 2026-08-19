package in.craves.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.catalog.service.CatalogService;
import in.craves.catalog.web.ApiDtos.DiscoveryRadiusResponse;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.KitchenStatus;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import in.craves.catalog.web.ApiDtos.MenuItemResponse;
import in.craves.catalog.web.ApiDtos.MenuItemStatus;
import in.craves.catalog.web.ApiDtos.PublicKitchenDiscoveryResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenSummaryResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PublicCatalogControllerPrivacyTest {
    private final CatalogService catalogService = mock(CatalogService.class);
    private final PublicCatalogController controller = new PublicCatalogController(catalogService);

    @Test
    void publicKitchenDetailExcludesIdentityContactAddressAndExactCoordinates() {
        UUID kitchenId = UUID.randomUUID();
        when(catalogService.getPublicKitchen(kitchenId)).thenReturn(new KitchenProfileResponse(
            kitchenId,
            UUID.randomUUID(),
            "Ravi Home Kitchen",
            "Ravi Inti Vantalu",
            "Telugu home food",
            "+919999999999",
            "chef@example.com",
            "12-3-45 Private House",
            "Private Lane",
            "Private Landmark",
            "Kukatpally",
            "Hyderabad",
            "Telangana",
            "500072",
            new BigDecimal("17.4948"),
            new BigDecimal("78.3996"),
            KitchenStatus.ACTIVE,
            Instant.now(),
            Instant.now()
        ));

        var response = controller.getKitchen(kitchenId);

        assertThat(response.id()).isEqualTo(kitchenId);
        assertThat(response.areaName()).isEqualTo("Kukatpally");
        assertThat(response.city()).isEqualTo("Hyderabad");
        assertThat(response.toString()).doesNotContain("9999999999", "Private House", "500072", "17.4948", "78.3996");
    }

    @Test
    void publicDiscoveryKeepsDistanceButRedactsExactCoordinates() {
        UUID kitchenId = UUID.randomUUID();
        when(catalogService.discoverKitchens(null, null, "Hyderabad", null, null)).thenReturn(
            new PublicKitchenDiscoveryResponse(
                new DiscoveryRadiusResponse("Hyderabad", "DEFAULT", BigDecimal.TEN, BigDecimal.valueOf(15)),
                List.of(new PublicKitchenSummaryResponse(
                    kitchenId,
                    "Kitchen",
                    "Display",
                    "Description",
                    "Madhapur",
                    "Hyderabad",
                    new BigDecimal("17.44"),
                    new BigDecimal("78.39"),
                    new BigDecimal("2.30"),
                    5
                ))
            )
        );

        var response = controller.discoverKitchens(null, null, "Hyderabad", null, null);

        assertThat(response.kitchens().getFirst().latitude()).isNull();
        assertThat(response.kitchens().getFirst().longitude()).isNull();
        assertThat(response.kitchens().getFirst().distanceKm()).isEqualByComparingTo("2.30");
    }

    @Test
    void publicMenuImageRedactsBlobStorageCoordinates() {
        UUID kitchenId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        MenuItemImageResponse image = new MenuItemImageResponse(
            UUID.randomUUID(), itemId, "private-container", "internal/blob/name.jpg", "image/jpeg", 1000,
            "https://cdn.example/menu.jpg", 0, true, Instant.now()
        );
        MenuItemResponse item = new MenuItemResponse(
            itemId, kitchenId, "Pappu Annam", "Home style", "Lunch", FoodType.VEG,
            BigDecimal.valueOf(120), "INR", 1, 20, null, 500, false, true,
            MenuItemStatus.ACTIVE, List.of(image), Instant.now(), Instant.now()
        );
        when(catalogService.getPublicMenuItem(itemId)).thenReturn(item);

        MenuItemResponse response = controller.getMenuItem(itemId);

        assertThat(response.images().getFirst().blobContainer()).isNull();
        assertThat(response.images().getFirst().blobName()).isNull();
        assertThat(response.images().getFirst().publicUrl()).isEqualTo("https://cdn.example/menu.jpg");
    }
}
