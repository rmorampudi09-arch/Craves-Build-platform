package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.ApiDtos.ChefApplicationStatus;
import in.craves.userchef.web.ApiDtos.KycDocumentResponse;
import in.craves.userchef.web.ChefApplicationReadiness;
import in.craves.userchef.web.ChefApplicationReadiness.BlockingIssue;
import in.craves.userchef.web.ChefApplicationReadiness.EvidenceRequirement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class ChefApplicationReadinessService {
    private final ChefApplicationService applications;
    private final AuthInternalClient auth;

    public ChefApplicationReadinessService(ChefApplicationService applications, AuthInternalClient auth) {
        this.applications = applications;
        this.auth = auth;
    }

    public ChefApplicationReadiness getReadiness(CurrentUser user) {
        if (user == null) throw ApiException.unauthorized("AUTHENTICATION_REQUIRED", "Sign in to view your application");
        var application = applications.getMyApplication(user);
        List<KycDocumentResponse> evidence = application.id() == null ? List.of() : applications.listMyApplicationEvidence(user);
        List<BlockingIssue> issues = new ArrayList<>();
        if (application.status() == ChefApplicationStatus.NOT_SUBMITTED) issues.add(new BlockingIssue("APPLICATION_REQUIRED", null));
        if (application.status() == ChefApplicationStatus.REJECTED) issues.add(new BlockingIssue("APPLICATION_REJECTED", null));

        String emailStatus = "NOT_CHECKED";
        if (application.id() != null) {
            try {
                auth.requireVerifiedEmail(user.identityId(), application.email());
                emailStatus = "VERIFIED";
            } catch (ApiException ex) {
                if (!"EMAIL_VERIFICATION_REQUIRED".equals(ex.getCode())) throw ex;
                emailStatus = "VERIFICATION_REQUIRED";
                issues.add(new BlockingIssue("EMAIL_VERIFICATION_REQUIRED", null));
            }
        }

        List<EvidenceRequirement> requirements = new ArrayList<>();
        int uploaded = 0;
        int approved = 0;
        var required = application.id() == null ? ChefApplicationService.REQUIRED_APPLICATION_DOCUMENTS
            : applications.requiredApplicationDocuments(application.id(), false);
        if (required == null || required.isEmpty()) required = ChefApplicationService.REQUIRED_APPLICATION_DOCUMENTS;
        boolean submissionBlocked = application.id() != null && applications.onboardingSubmissionBlocked(application.id());
        if (submissionBlocked) issues.add(new BlockingIssue("ONBOARDING_NOT_SUBMITTED", null));
        for (var type : required.stream().sorted().toList()) {
            var document = evidence.stream().filter(item -> item.documentType() == type).findFirst().orElse(null);
            String status = document == null ? "MISSING" : document.status();
            if (status == null || !Set.of("MISSING", "UPLOADED", "APPROVED", "REJECTED").contains(status)) {
                throw new ApiException(503, "CHEF_EVIDENCE_STATE_UNAVAILABLE", "Document readiness is temporarily unavailable");
            }
            if (document != null) uploaded++;
            if ("APPROVED".equals(status)) approved++;
            else issues.add(new BlockingIssue(switch (status) {
                case "MISSING" -> "DOCUMENT_MISSING";
                case "REJECTED" -> "DOCUMENT_REJECTED";
                default -> "DOCUMENT_AWAITING_REVIEW";
            }, type));
            requirements.add(new EvidenceRequirement(type, status,
                document != null && "REJECTED".equals(status) ? document.reviewReason() : null));
        }
        Instant lastSavedAt = Stream.concat(
            Stream.of(application.submittedAt(), application.reviewedAt()), evidence.stream().map(KycDocumentResponse::updatedAt)
        ).filter(java.util.Objects::nonNull).max(Instant::compareTo).orElse(null);
        return new ChefApplicationReadiness(1, application.status(), emailStatus,
            application.status() == ChefApplicationStatus.PENDING && !submissionBlocked && "VERIFIED".equals(emailStatus) && approved == requirements.size(),
            requirements.size(), uploaded, approved, List.copyOf(requirements), List.copyOf(issues), Instant.now(), lastSavedAt);
    }
}
