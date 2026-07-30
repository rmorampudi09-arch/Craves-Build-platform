package in.craves.integration.operations;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AdminOperationsModels {
    private AdminOperationsModels() {
    }

    public record CreateCaseRequest(
        @NotBlank @Size(max = 40) String category,
        @NotBlank @Size(max = 20) String priority,
        @NotBlank @Size(max = 40) String subjectType,
        @NotNull UUID subjectId,
        UUID orderId,
        UUID checkoutId,
        UUID paymentOrderId,
        UUID refundId,
        UUID deliveryJobId,
        UUID subscriptionId,
        UUID customerIdentityId,
        UUID chefIdentityId,
        @NotBlank @Size(max = 300) String summary,
        @NotBlank @Size(max = 4000) String description
    ) {
    }

    public record UpdateCaseRequest(
        @NotBlank @Size(max = 30) String status,
        UUID assignedAdminIdentityId,
        @NotBlank @Size(max = 1000) String reason
    ) {
    }

    public record AddCaseNoteRequest(
        @NotBlank @Size(max = 30) String noteType,
        @NotBlank @Size(max = 4000) String body
    ) {
    }

    public record RetryReleaseRequest(
        @NotBlank @Size(max = 40) String domain,
        @NotNull UUID recordId,
        @NotBlank @Size(max = 1000) String reason
    ) {
    }

    public record CaseResponse(
        UUID id,
        String caseReference,
        String category,
        String priority,
        String status,
        String subjectType,
        UUID subjectId,
        UUID orderId,
        UUID checkoutId,
        UUID paymentOrderId,
        UUID refundId,
        UUID deliveryJobId,
        UUID subscriptionId,
        UUID customerIdentityId,
        UUID chefIdentityId,
        String summary,
        String description,
        UUID assignedAdminIdentityId,
        String closureReason,
        Instant createdAt,
        Instant updatedAt,
        Instant closedAt
    ) {
    }

    public record CaseNoteResponse(
        UUID id,
        String noteType,
        String body,
        UUID actorIdentityId,
        Instant createdAt
    ) {
    }

    public record CaseDetails(CaseResponse value, List<CaseNoteResponse> notes) {
    }

    public record InvestigationSnapshot(
        String entityType,
        UUID entityId,
        Map<String, Object> fields,
        Instant capturedAt
    ) {
    }

    public record RetryReleaseResponse(
        UUID releaseId,
        UUID caseId,
        String domain,
        UUID recordId,
        String previousStatus,
        String releaseStatus,
        Instant createdAt
    ) {
    }
}
