package in.craves.catalog.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiDtos {
    private ApiDtos() {
    }

    public enum KitchenStatus {
        DRAFT, ACTIVE, INACTIVE, SUSPENDED
    }

    /** ARCHIVED is set only by the chef's DELETE of a dish; it is hidden from every customer and chef list. */
    public enum MenuItemStatus {
        DRAFT, ACTIVE, INACTIVE, ARCHIVED
    }

    public enum KitchenPhotoKind {
        CHEF, KITCHEN
    }

    public enum FoodType {
        VEG, NON_VEG, EGG
    }

    public enum SpiceLevel {
        MILD, MEDIUM, SPICY
    }

    public record KitchenProfileRequest(
        @NotBlank String kitchenName,
        String displayName,
        String description,
        String phoneNumber,
        String email,
        @NotBlank String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        @NotBlank String city,
        @NotBlank String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        KitchenStatus status,
        // Optional: absent or null keeps the stored value (craves.in and app 1.30.0 do not send them).
        List<String> cuisines,
        List<String> serviceAreas,
        SocialLinks socialLinks
    ) {
    }

    public record SocialLinks(String instagram, String facebook, String youtube, String website) {
    }

    /** Body and response of the chef's order settings; defaultPrepMinutes is 5-120 or null (unset). */
    public record KitchenSettings(@NotNull Boolean autoAcceptOrders, Integer defaultPrepMinutes) {
    }

    public record KitchenProfileResponse(
        UUID id,
        UUID identityId,
        String kitchenName,
        String displayName,
        String description,
        String phoneNumber,
        String email,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        KitchenStatus status,
        Instant createdAt,
        Instant updatedAt,
        String chefPhotoUrl,
        String kitchenPhotoUrl,
        List<String> cuisines,
        List<String> serviceAreas,
        SocialLinks socialLinks,
        // Chef and internal (order-service) reads only; null, so omitted from JSON, on public reads.
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean autoAcceptOrders,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer defaultPrepMinutes
    ) {
        public KitchenProfileResponse withoutChefSettings() {
            return new KitchenProfileResponse(
                id, identityId, kitchenName, displayName, description, phoneNumber, email, addressLine1, addressLine2, landmark,
                areaName, city, state, postalCode, latitude, longitude, status, createdAt, updatedAt,
                chefPhotoUrl, kitchenPhotoUrl, cuisines, serviceAreas, socialLinks, null, null
            );
        }
    }

    public record MenuItemRequest(
        @NotBlank String itemName,
        String description,
        @NotBlank String category,
        @NotNull FoodType foodType,
        @NotNull @DecimalMin("0.01") BigDecimal price,
        String currency,
        @Positive Integer servesCount,
        @Positive Integer preparationTimeMinutes,
        SpiceLevel spiceLevel,
        @NotNull @Positive Integer unitPackageWeightGrams,
        @NotNull Boolean thermoboxRequired,
        Boolean available,
        MenuItemStatus status
    ) {
    }

    public record MenuItemResponse(
        UUID id,
        UUID kitchenId,
        String itemName,
        String description,
        String category,
        FoodType foodType,
        BigDecimal price,
        String currency,
        Integer servesCount,
        Integer preparationTimeMinutes,
        SpiceLevel spiceLevel,
        Integer unitPackageWeightGrams,
        Boolean thermoboxRequired,
        boolean available,
        MenuItemStatus status,
        List<MenuItemImageResponse> images,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record MenuItemImageResponse(
        UUID id,
        UUID menuItemId,
        String blobContainer,
        String blobName,
        String contentType,
        long fileSizeBytes,
        String publicUrl,
        int sortOrder,
        boolean primary,
        Instant createdAt
    ) {
    }

    public record ChefAvatarRequest(@NotBlank @Size(max = 40) String avatarId) {
    }

    public record AvailabilityRequest(
        boolean available,
        String reason
    ) {
    }

    public record PublicKitchenSummaryResponse(
        UUID id,
        String kitchenName,
        String displayName,
        String description,
        String areaName,
        String city,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal distanceKm,
        long activeMenuItemCount
    ) {
    }

    public record DiscoveryRadiusResponse(
        String city,
        String areaName,
        BigDecimal radiusKm,
        BigDecimal maxRadiusKm
    ) {
    }

    public record PublicKitchenDiscoveryResponse(
        DiscoveryRadiusResponse radius,
        List<PublicKitchenSummaryResponse> kitchens
    ) {
    }
}
