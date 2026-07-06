package in.craves.userchef.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiDtos {
    private ApiDtos() {
    }

    public enum AddressLabel {
        HOME,
        WORK,
        OTHER
    }

    public enum ChefApplicationStatus {
        NOT_SUBMITTED,
        PENDING,
        APPROVED,
        REJECTED
    }

    public enum KycDocumentType {
        AADHAAR_CARD,
        PAN_CARD
    }

    public record CustomerProfileRequest(
        @NotBlank String firstName,
        @NotBlank String lastName,
        @Email String email
    ) {
    }

    public record CustomerProfileResponse(
        UUID id,
        UUID identityId,
        String registeredPhoneNumber,
        String firstName,
        String lastName,
        String email,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record CustomerAddressRequest(
        AddressLabel addressLabel,
        String recipientName,
        @NotBlank @Pattern(regexp = "^\\+?[0-9]{10,15}$") String contactPhoneNumber,
        @NotBlank String addressLine1,
        String addressLine2,
        String landmark,
        @NotBlank String city,
        @NotBlank String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        Boolean isDefault
    ) {
    }

    public record CustomerAddressResponse(
        UUID id,
        UUID identityId,
        AddressLabel addressLabel,
        String recipientName,
        String contactPhoneNumber,
        String addressLine1,
        String addressLine2,
        String landmark,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean isDefault,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefApplicationRequest(
        @NotBlank @Email String email,
        @NotBlank String firstName,
        @NotBlank String lastName,
        @NotBlank String addressLine1,
        String addressLine2,
        String landmark,
        @NotBlank String city,
        @NotBlank String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude
    ) {
    }

    public record KycDocumentResponse(
        UUID id,
        KycDocumentType documentType,
        String originalFileName,
        String blobContainer,
        String blobName,
        String contentType,
        long fileSizeBytes,
        String status,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefApplicationResponse(
        UUID id,
        UUID identityId,
        String phoneNumber,
        String email,
        String firstName,
        String lastName,
        String addressLine1,
        String addressLine2,
        String landmark,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        ChefApplicationStatus status,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        UUID reviewedByIdentityId,
        List<KycDocumentResponse> documents
    ) {
    }

    public record AdminDecisionRequest(String reason) {
    }
}
