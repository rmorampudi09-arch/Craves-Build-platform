package in.craves.userchef.web;

import in.craves.userchef.web.ApiDtos.ChefApplicationStatus;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.time.Instant;
import java.util.List;

/** Current application approval requirements only; this is not food-business compliance certification. */
public record ChefApplicationReadiness(
    int contractVersion,
    ChefApplicationStatus applicationStatus,
    String emailStatus,
    boolean approvalReady,
    int requiredDocumentCount,
    int uploadedDocumentCount,
    int approvedDocumentCount,
    List<EvidenceRequirement> documents,
    List<BlockingIssue> blockingIssues,
    Instant evaluatedAt,
    Instant lastSavedAt
) {
    public record EvidenceRequirement(KycDocumentType documentType, String status, String rejectionReason) {}
    public record BlockingIssue(String code, KycDocumentType documentType) {}
}
