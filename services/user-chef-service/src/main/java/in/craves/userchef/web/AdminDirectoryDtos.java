package in.craves.userchef.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminDirectoryDtos {
    private AdminDirectoryDtos() {
    }

    public record DirectorySearchRequest(String query) {
    }

    public record DirectorySearchResponse(
        UUID correlationId,
        String queryType,
        List<DirectoryHit> hits
    ) {
    }

    public record DirectoryHit(
        String entityType,
        UUID identityId,
        UUID recordId,
        String displayName,
        String secondaryLabel,
        String status,
        String matchField,
        String maskedMatchValue
    ) {
    }

    public record CustomerCaseResponse(
        UUID correlationId,
        CustomerProfileCase profile,
        List<CustomerAddressCase> addresses
    ) {
    }

    public record CustomerProfileCase(
        UUID profileId,
        UUID identityId,
        String registeredPhoneNumber,
        String firstName,
        String lastName,
        String email,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record CustomerAddressCase(
        UUID addressId,
        String addressLabel,
        String recipientName,
        String contactPhoneNumber,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String districtName,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean defaultAddress,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefCaseResponse(
        UUID correlationId,
        ChefApplicationCase application,
        List<ChefDocumentCase> documents,
        List<ChefDecisionCase> decisionHistory
    ) {
    }

    public record ChefApplicationCase(
        UUID applicationId,
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
        String status,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        UUID reviewedByIdentityId,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefDocumentCase(
        UUID documentId,
        String documentType,
        String originalFileName,
        String contentType,
        long fileSizeBytes,
        String status,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefDecisionCase(
        UUID auditId,
        UUID adminIdentityId,
        String decision,
        String reason,
        Instant createdAt
    ) {
    }
}
