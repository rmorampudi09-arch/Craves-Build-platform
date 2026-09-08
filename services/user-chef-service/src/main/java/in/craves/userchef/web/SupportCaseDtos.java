package in.craves.userchef.web;

import in.craves.userchef.support.SupportCaseStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SupportCaseDtos {
    private SupportCaseDtos() {
    }

    public record CreateSupportCaseRequest(
        String contextRole,
        UUID orderId,
        String subject,
        String message
    ) {
    }

    public record AddSupportMessageRequest(String message) {
    }

    public record AddBackofficeSupportMessageRequest(
        String message,
        boolean internalNote
    ) {
    }

    public record UpdateSupportCaseStatusRequest(
        SupportCaseStatus status,
        String note
    ) {
    }

    public record SupportCaseSummaryResponse(
        UUID id,
        String caseNumber,
        UUID requesterIdentityId,
        String requesterRole,
        UUID orderId,
        String subject,
        SupportCaseStatus status,
        UUID assignedToIdentityId,
        Instant lastRequesterMessageAt,
        Instant lastSupportMessageAt,
        Instant resolvedAt,
        Instant closedAt,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record SupportCaseMessageResponse(
        UUID id,
        UUID senderIdentityId,
        String senderRole,
        String body,
        boolean internalNote,
        Instant createdAt
    ) {
    }

    public record SupportCaseStatusHistoryResponse(
        UUID id,
        SupportCaseStatus oldStatus,
        SupportCaseStatus newStatus,
        UUID actorIdentityId,
        String actorRole,
        String note,
        Instant createdAt
    ) {
    }

    public record SupportCaseDetailResponse(
        SupportCaseSummaryResponse supportCase,
        List<SupportCaseMessageResponse> messages,
        List<SupportCaseStatusHistoryResponse> statusHistory
    ) {
    }

    public record SupportCasePageResponse(
        List<SupportCaseSummaryResponse> cases,
        String nextCursor,
        boolean hasMore
    ) {
    }
}
