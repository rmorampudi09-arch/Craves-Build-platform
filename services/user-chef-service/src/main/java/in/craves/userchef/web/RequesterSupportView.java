package in.craves.userchef.web;

import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseMessageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCasePageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseStatusHistoryResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import java.util.List;

final class RequesterSupportView {
    private RequesterSupportView() {
    }

    static SupportCasePageResponse redact(SupportCasePageResponse page) {
        return new SupportCasePageResponse(
            page.cases().stream().map(RequesterSupportView::redact).toList(),
            page.nextCursor(),
            page.hasMore()
        );
    }

    static SupportCaseDetailResponse redact(SupportCaseDetailResponse detail) {
        return new SupportCaseDetailResponse(
            redact(detail.supportCase()),
            detail.messages().stream().map(RequesterSupportView::redact).toList(),
            detail.statusHistory().stream().map(RequesterSupportView::redact).toList()
        );
    }

    private static SupportCaseSummaryResponse redact(SupportCaseSummaryResponse value) {
        return new SupportCaseSummaryResponse(
            value.id(),
            value.caseNumber(),
            value.requesterIdentityId(),
            value.requesterRole(),
            value.orderId(),
            value.subject(),
            value.status(),
            null,
            value.lastRequesterMessageAt(),
            value.lastSupportMessageAt(),
            value.resolvedAt(),
            value.closedAt(),
            value.createdAt(),
            value.updatedAt()
        );
    }

    private static SupportCaseMessageResponse redact(SupportCaseMessageResponse value) {
        if (!isInternalRole(value.senderRole())) {
            return value;
        }
        return new SupportCaseMessageResponse(
            value.id(),
            null,
            "SUPPORT",
            value.body(),
            false,
            value.createdAt()
        );
    }

    private static SupportCaseStatusHistoryResponse redact(SupportCaseStatusHistoryResponse value) {
        if (!isInternalRole(value.actorRole())) {
            return new SupportCaseStatusHistoryResponse(
                value.id(),
                value.oldStatus(),
                value.newStatus(),
                value.actorIdentityId(),
                value.actorRole(),
                null,
                value.createdAt()
            );
        }
        return new SupportCaseStatusHistoryResponse(
            value.id(),
            value.oldStatus(),
            value.newStatus(),
            null,
            "SUPPORT",
            null,
            value.createdAt()
        );
    }

    private static boolean isInternalRole(String role) {
        return "SUPPORT_ADMIN".equalsIgnoreCase(role) || "PLATFORM_ADMIN".equalsIgnoreCase(role);
    }
}
