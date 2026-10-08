package in.craves.userchef.onboarding;

import in.craves.userchef.web.ApiDtos.ChefApplicationResponse;
import in.craves.userchef.web.ApiDtos.KycDocumentResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ChefOnboardingDtos {
    private ChefOnboardingDtos() {}
    public enum ProofKind { AADHAAR, PAN, BANK_STATEMENT, OTHER_GOVERNMENT_ID }
    public record Details(
        String email, String firstName, String lastName, LocalDate dateOfBirth,
        String kitchenName, String kitchenDescription,
        String addressLine1, String addressLine2, String landmark, String city, String state,
        String postalCode, BigDecimal latitude, BigDecimal longitude,
        ProofKind proofKind, String otherGovernmentId, String fssaiNumber, String language
    ) {}
    public record SaveRequest(Long expectedVersion, Details details) {}
    public record State(
        boolean enabled, boolean legacy, long version, String resumeStep, boolean submitted,
        String phoneNumber, Details details, ChefApplicationResponse application,
        List<KycDocumentResponse> documents, List<String> requiredDocuments,
        String supportPhone, String supportEmail, ReviewProgress progress
    ) {}
    public record ReviewProgress(String status,String reason,String nextAction,boolean fssaiVerified,String termsVersion) {}
    public record ReviewAction(Long expectedVersion,String action,String reason,String fssaiNumber) {}
    public record HelpRequest(UUID requestKey, String message) {}
    public record Help(
        UUID id, String caseNumber, UUID supportCaseId, UUID identityId, Details details,
        String phoneNumber, String message, String status, Instant createdAt
    ) {}
    public record HelpPage(List<Help> items, String nextCursor) {}
    public record HelpStatusRequest(String status) {}
    public record ContentRequest(
        String language, String title, String kind, String body, String contentType, Long fileSizeBytes
    ) {}
    public record PublishRequest(Long expectedVersion, boolean published) {}
    public record Content(
        UUID id, String language, String title, String kind, String body, boolean published,
        boolean ready, long version, String contentType, Long fileSizeBytes, Instant createdAt
    ) {}
    public record UploadTicket(Content content, String uploadUrl, Instant expiresAt) {}
    public record Playback(String url, Instant expiresAt) {}
}
