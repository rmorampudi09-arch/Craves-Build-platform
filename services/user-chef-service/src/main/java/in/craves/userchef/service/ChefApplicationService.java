package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocument;
import in.craves.userchef.web.ApiDtos.AdminDecisionRequest;
import in.craves.userchef.web.ApiDtos.ChefApplicationRequest;
import in.craves.userchef.web.ApiDtos.ChefApplicationResponse;
import in.craves.userchef.web.ApiDtos.ChefApplicationStatus;
import in.craves.userchef.web.ApiDtos.KycDocumentResponse;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ChefApplicationService {
    static final Set<KycDocumentType> REQUIRED_APPLICATION_DOCUMENTS = Set.of(
        KycDocumentType.APPLICANT_PHOTO,
        KycDocumentType.GOVERNMENT_ID_FRONT,
        KycDocumentType.GOVERNMENT_ID_BACK,
        KycDocumentType.TAX_ID_CARD
    );

    private final JdbcTemplate jdbcTemplate;
    private final BlobDocumentStorageService storageService;
    private final AuthInternalClient authInternalClient;
    private final NotificationInternalClient notificationInternalClient;
    private final in.craves.userchef.email.AuthEmailProjectionService emailProjection;
    private final boolean onboardingV2Enabled;

    @org.springframework.beans.factory.annotation.Autowired
    public ChefApplicationService(
        JdbcTemplate jdbcTemplate,
        BlobDocumentStorageService storageService,
        AuthInternalClient authInternalClient,
        NotificationInternalClient notificationInternalClient,
        in.craves.userchef.email.AuthEmailProjectionService emailProjection,
        @org.springframework.beans.factory.annotation.Value("${CRAVES_CHEF_ONBOARDING_V2_ENABLED:false}") boolean onboardingV2Enabled
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.storageService = storageService;
        this.authInternalClient = authInternalClient;
        this.notificationInternalClient = notificationInternalClient;
        this.emailProjection = emailProjection;
        this.onboardingV2Enabled = onboardingV2Enabled;
    }

    public ChefApplicationService(JdbcTemplate jdbcTemplate, BlobDocumentStorageService storageService,
        AuthInternalClient authInternalClient, NotificationInternalClient notificationInternalClient,
        in.craves.userchef.email.AuthEmailProjectionService emailProjection) {
        this(jdbcTemplate,storageService,authInternalClient,notificationInternalClient,emailProjection,false);
    }

    public ChefApplicationResponse getMyApplication(CurrentUser user) {
        List<ChefApplicationResponse> rows = findApplications("WHERE identity_id = ?", user.identityId());
        if (rows.isEmpty()) {
            return new ChefApplicationResponse(null, user.identityId(), user.phoneNumber(), null, null, null, null, null, null, null, null, null, null, null, ChefApplicationStatus.NOT_SUBMITTED, null, null, null, null, List.of(), null);
        }
        return rows.getFirst();
    }

    @Transactional
    public ChefApplicationResponse submitApplication(CurrentUser user, ChefApplicationRequest request) {
        emailProjection.lockIdentity(user.identityId());
        String canonicalEmail = authInternalClient.requireVerifiedEmail(user.identityId(), request.email());
        List<String> statuses = jdbcTemplate.query(
              "SELECT status FROM chef_application WHERE identity_id = ? FOR UPDATE",
            (rs, rowNum) -> rs.getString("status"),
            user.identityId()
        );
        if (onboardingV2Enabled || Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT EXISTS(SELECT 1 FROM chef_onboarding_draft WHERE identity_id=?)", Boolean.class, user.identityId()))) {
            throw ApiException.conflict("USE_NEW_ONBOARDING_FLOW", "Continue your saved Chef onboarding application.");
        }
        if (!statuses.isEmpty() && "APPROVED".equals(statuses.getFirst())) {
            throw ApiException.conflict("CHEF_ALREADY_APPROVED", "Approved chef applications cannot be resubmitted");
        }

        if (statuses.isEmpty()) {
            jdbcTemplate.update(
                "INSERT INTO chef_application (id, identity_id, phone_number, email, first_name, last_name, address_line1, address_line2, landmark, city, state, postal_code, latitude, longitude, status, submitted_at, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', now(), now(), now())",
                UUID.randomUUID(), user.identityId(), user.phoneNumber(), canonicalEmail, request.firstName(),
                request.lastName(), request.addressLine1(), blankToNull(request.addressLine2()),
                blankToNull(request.landmark()), request.city(), request.state(), blankToNull(request.postalCode()),
                request.latitude(), request.longitude()
            );
        } else {
            jdbcTemplate.update(
                "UPDATE chef_application SET phone_number = ?, email = ?, first_name = ?, last_name = ?, address_line1 = ?, address_line2 = ?, landmark = ?, city = ?, state = ?, postal_code = ?, latitude = ?, longitude = ?, status = 'PENDING', rejection_reason = NULL, reviewed_at = NULL, reviewed_by_identity_id = NULL, submitted_at = now(), updated_at = now() WHERE identity_id = ?",
                user.phoneNumber(), canonicalEmail, request.firstName(), request.lastName(), request.addressLine1(),
                blankToNull(request.addressLine2()), blankToNull(request.landmark()), request.city(), request.state(),
                blankToNull(request.postalCode()), request.latitude(), request.longitude(), user.identityId()
            );
        }
        return getMyApplication(user);
    }

    @Transactional
    public KycDocumentResponse uploadDocument(CurrentUser user, KycDocumentType documentType, MultipartFile file) {
        jdbcTemplate.query("SELECT id FROM chef_application WHERE identity_id=? FOR UPDATE",(rs,row)->rs.getObject(1,UUID.class),user.identityId());
        ChefApplicationResponse application = getExistingApplication(user.identityId());
        if(Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT EXISTS(SELECT 1 FROM chef_onboarding_draft WHERE application_id=? AND submitted AND review_status<>'MORE_INFORMATION_REQUIRED')",Boolean.class,application.id())))
            throw ApiException.conflict("ONBOARDING_ALREADY_SUBMITTED","Uploads are locked while this application is being reviewed.");
        if (application.status() == ChefApplicationStatus.APPROVED && !hasOnboardingDraft(application.id())) {
            throw ApiException.conflict("CHEF_ALREADY_APPROVED", "Start the updated onboarding before adding its required evidence");
        }
        if (!requiredApplicationDocuments(application.id(), false).contains(documentType) && !(documentType==KycDocumentType.FSSAI_LICENSE && hasOnboardingDraft(application.id()))) {
            throw ApiException.badRequest("CHEF_DOCUMENT_TYPE_NOT_ALLOWED", "Use one of the current Chef application evidence types");
        }

        List<ExistingDocument> existing = jdbcTemplate.query(
            "SELECT id, status FROM chef_kyc_document WHERE application_id = ? AND document_type = ?",
            (rs, rowNum) -> new ExistingDocument(rs.getObject("id", UUID.class), rs.getString("status")),
            application.id(),
            documentType.name()
        );
        if (!existing.isEmpty() && "APPROVED".equals(existing.getFirst().status())) {
            throw ApiException.conflict(
                "CHEF_DOCUMENT_ALREADY_APPROVED",
                "An approved Chef document stays accepted and cannot be replaced unless the application is reopened through a controlled process"
            );
        }

        if(!existing.isEmpty()) jdbcTemplate.update("INSERT INTO chef_onboarding_document_history(id,document_id,identity_id,action,snapshot) SELECT ?,id,identity_id,'REPLACED',to_jsonb(d) FROM chef_kyc_document d WHERE id=?",UUID.randomUUID(),existing.getFirst().id());
        StoredDocument stored = storageService.uploadKycDocument(user.identityId(), documentType, file);
        UUID documentId = existing.isEmpty() ? UUID.randomUUID() : existing.getFirst().id();
        if (existing.isEmpty()) {
            jdbcTemplate.update(
                "INSERT INTO chef_kyc_document (id, application_id, identity_id, document_type, original_file_name, blob_container, blob_name, content_type, file_size_bytes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', now(), now())",
                documentId, application.id(), user.identityId(), documentType.name(), stored.originalFileName(),
                stored.container(), stored.blobName(), stored.contentType(), stored.fileSizeBytes()
            );
        } else {
            jdbcTemplate.update(
                "UPDATE chef_kyc_document SET original_file_name = ?, blob_container = ?, blob_name = ?, content_type = ?, " +
                    "file_size_bytes = ?, removed_at=NULL, status = 'UPLOADED', review_reason = NULL, reviewed_by_identity_id = NULL, " +
                    "reviewed_at = NULL, updated_at = now() WHERE id = ?",
                stored.originalFileName(), stored.container(), stored.blobName(), stored.contentType(),
                stored.fileSizeBytes(), documentId
            );
        }
        return getDocument(documentId);
    }

    public List<KycDocumentResponse> listMyApplicationEvidence(CurrentUser user) {
        ChefApplicationResponse application = getExistingApplication(user.identityId());
        return listApplicationEvidence(application.id());
    }

    public List<KycDocumentResponse> listApplicationEvidenceForAdmin(CurrentUser admin, UUID applicationId) {
        requireReviewAccess(admin);
        getApplicationForAdmin(admin, applicationId);
        return listApplicationEvidence(applicationId);
    }

    public List<ChefApplicationResponse> listApplications(CurrentUser admin, ChefApplicationStatus status) {
        requireReviewAccess(admin);
        if (status == null || status == ChefApplicationStatus.NOT_SUBMITTED) {
            return findApplications("WHERE (status = 'APPROVED' OR NOT EXISTS (SELECT 1 FROM chef_onboarding_draft d WHERE d.application_id=chef_application.id AND d.submitted=false))", new Object[]{});
        }
        return findApplications("WHERE (status = ? OR (? = 'PENDING' AND status = 'APPROVED' AND EXISTS(SELECT 1 FROM chef_onboarding_draft d WHERE d.application_id=chef_application.id AND d.submitted=true AND (d.fssai_reviewed_at IS NULL OR d.fssai_reviewed_number IS DISTINCT FROM d.details->>'fssaiNumber' OR EXISTS(SELECT 1 FROM chef_kyc_document k WHERE k.application_id=chef_application.id AND k.removed_at IS NULL AND k.document_type IN ('SELECTED_PROOF_FRONT','SELECTED_PROOF_BACK','KITCHEN_PHOTO_1','KITCHEN_PHOTO_2','FSSAI_LICENSE') AND k.status <> 'APPROVED'))))) AND (status = 'APPROVED' OR NOT EXISTS (SELECT 1 FROM chef_onboarding_draft d WHERE d.application_id=chef_application.id AND d.submitted=false))", status.name(), status.name());
    }

    public ChefApplicationResponse getApplicationForAdmin(CurrentUser admin, UUID applicationId) {
        requireReviewAccess(admin);
        List<ChefApplicationResponse> rows = findApplications("WHERE id = ?", applicationId);
        if (rows.isEmpty()) {
            throw ApiException.notFound("CHEF_APPLICATION_NOT_FOUND", "Chef application was not found");
        }
        return rows.getFirst();
    }

    @Transactional
    public ChefApplicationResponse approve(CurrentUser admin, UUID applicationId) {
        requireDecisionAccess(admin);
        ChefApplicationResponse application = getApplicationForAdmin(admin, applicationId);
        if (application.status() != ChefApplicationStatus.PENDING) {
            throw ApiException.conflict("CHEF_APPLICATION_NOT_PENDING", "Only pending chef applications can be approved");
        }
        emailProjection.lockIdentity(application.identityId());
        jdbcTemplate.query("SELECT id FROM chef_application WHERE id=? FOR UPDATE",(rs,row)->rs.getObject(1,UUID.class),applicationId);
        // Re-read after the projection lock: an email replacement may have synchronized while review was opened.
        application = getApplicationForAdmin(admin, applicationId);
        if (application.status() != ChefApplicationStatus.PENDING) {
            throw ApiException.conflict("CHEF_APPLICATION_NOT_PENDING", "Only pending chef applications can be approved");
        }
        authInternalClient.requireVerifiedEmail(application.identityId(), application.email());
        requireCompleteApplicationDocuments(applicationId);
        updateDecision(applicationId, admin.identityId(), "APPROVED", null);
        authInternalClient.grantChefRole(application.identityId(), applicationId);
        ChefApplicationResponse approved = getApplicationForAdmin(admin, applicationId);
        notificationInternalClient.chefApproved(approved);
        return approved;
    }

    @Transactional
    public ChefApplicationResponse reject(CurrentUser admin, UUID applicationId, AdminDecisionRequest request) {
        requireDecisionAccess(admin);
        jdbcTemplate.query("SELECT id FROM chef_application WHERE id=? FOR UPDATE",(rs,row)->rs.getObject(1,UUID.class),applicationId);
        if (request == null || !StringUtils.hasText(request.reason())) {
            throw ApiException.badRequest("REJECTION_REASON_REQUIRED", "Rejection reason is required");
        }
        ChefApplicationResponse application = getApplicationForAdmin(admin, applicationId);
        if (application.status() != ChefApplicationStatus.PENDING) {
            throw ApiException.conflict("CHEF_APPLICATION_NOT_PENDING", "Only pending chef applications can be rejected");
        }
        if(onboardingSubmissionBlocked(applicationId))
            throw ApiException.conflict("ONBOARDING_NOT_SUBMITTED","Wait for the Chef to submit the completed onboarding application.");
        updateDecision(applicationId, admin.identityId(), "REJECTED", request.reason());
        ChefApplicationResponse rejected = getApplicationForAdmin(admin, applicationId);
        notificationInternalClient.chefRejected(rejected);
        return rejected;
    }

    private void requireCompleteApplicationDocuments(UUID applicationId) {
        Set<KycDocumentType> required = requiredApplicationDocuments(applicationId, true);
        if(hasOnboardingDraft(applicationId) && !onboardingFssaiVerified(applicationId))
            throw ApiException.conflict("FSSAI_VERIFICATION_REQUIRED","Review and record the current FSSAI registration number before approving this application.");
        List<KycDocumentResponse> evidence = listApplicationEvidence(applicationId);
        Set<KycDocumentType> uploaded = evidence.stream()
            .map(KycDocumentResponse::documentType)
            .collect(java.util.stream.Collectors.toSet());
        List<KycDocumentType> missing = required.stream()
            .filter(type -> !uploaded.contains(type))
            .sorted()
            .toList();
        if (!missing.isEmpty()) {
            throw ApiException.conflict(
                "CHEF_REQUIRED_DOCUMENTS_MISSING",
                "Required Chef application evidence is incomplete: " + missing.stream()
                    .map(ChefApplicationService::documentLabel)
                    .toList()
            );
        }

        Set<KycDocumentType> approved = evidence.stream()
            .filter(document -> "APPROVED".equals(document.status()))
            .map(KycDocumentResponse::documentType)
            .collect(java.util.stream.Collectors.toSet());
        List<KycDocumentType> awaitingApproval = required.stream()
            .filter(type -> !approved.contains(type))
            .sorted()
            .toList();
        if (!awaitingApproval.isEmpty()) {
            throw ApiException.conflict(
                "CHEF_REQUIRED_DOCUMENTS_NOT_APPROVED",
                "Every required Chef document must be individually approved before the application can be approved: " +
                    awaitingApproval.stream().map(ChefApplicationService::documentLabel).toList()
            );
        }
    }

    public Set<KycDocumentType> requiredApplicationDocuments(UUID applicationId, boolean approving) {
        var rows = jdbcTemplate.query(
            "SELECT details->>'proofKind' AS proof, details->>'fssaiNumber' AS fssai, details->>'proofHasBack' AS has_back, submitted FROM chef_onboarding_draft WHERE application_id=?",
            (rs,row) -> new OnboardingRequirements(rs.getString("proof"), rs.getString("fssai"), rs.getBoolean("submitted"), rs.getString("has_back")),
            applicationId
        );
        if (rows.isEmpty()) {
            if(onboardingV2Enabled) {
                if(approving) throw ApiException.conflict("ONBOARDING_INCOMPLETE","The Chef must complete the updated onboarding first.");
                return Set.of(KycDocumentType.KITCHEN_PHOTO_1,KycDocumentType.KITCHEN_PHOTO_2,KycDocumentType.FSSAI_LICENSE);
            }
            return REQUIRED_APPLICATION_DOCUMENTS;
        }
        var metadata = rows.getFirst();
        if (approving && (!metadata.submitted() || metadata.proof() == null ||
            metadata.fssai() == null || !metadata.fssai().matches("[0-9]{14}")))
            throw ApiException.conflict("ONBOARDING_INCOMPLETE", "The Chef must complete and submit the saved onboarding application.");
        if (metadata.proof() == null)
            return Set.of(KycDocumentType.KITCHEN_PHOTO_1, KycDocumentType.KITCHEN_PHOTO_2, KycDocumentType.FSSAI_LICENSE);
        try {
            return in.craves.userchef.onboarding.ChefOnboardingPolicy.required(
                in.craves.userchef.onboarding.ChefOnboardingDtos.ProofKind.valueOf(metadata.proof()),
                "false".equals(metadata.hasBack()) ? Boolean.FALSE : null
            );
        } catch (IllegalArgumentException ex) {
            throw ApiException.conflict("ONBOARDING_STATE_INVALID", "The saved Chef document choice is invalid.");
        }
    }

    public boolean onboardingFssaiVerified(UUID applicationId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT EXISTS(SELECT 1 FROM chef_onboarding_draft WHERE application_id=? AND fssai_reviewed_number=details->>'fssaiNumber' AND fssai_reviewed_at IS NOT NULL)",Boolean.class,applicationId));
    }

    public boolean onboardingSubmissionBlocked(UUID applicationId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM chef_onboarding_draft WHERE application_id=? AND submitted=false)",
            Boolean.class, applicationId)) || onboardingV2Enabled && !hasOnboardingDraft(applicationId);
    }

    private boolean hasOnboardingDraft(UUID applicationId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT EXISTS(SELECT 1 FROM chef_onboarding_draft WHERE application_id=?)",Boolean.class,applicationId));
    }

    private record OnboardingRequirements(String proof, String fssai, boolean submitted, String hasBack) {}

    private static String documentLabel(KycDocumentType type) {
        return switch (type) {
            case APPLICANT_PHOTO -> "Applicant photo";
            case GOVERNMENT_ID_FRONT -> "Government ID front";
            case GOVERNMENT_ID_BACK -> "Government ID back";
            case TAX_ID_CARD -> "Tax ID card";
            case AADHAAR_CARD -> "Legacy government ID";
            case PAN_CARD -> "Legacy tax ID";
            case KITCHEN_PHOTO_1 -> "Kitchen photo 1";
            case KITCHEN_PHOTO_2 -> "Kitchen photo 2";
            case FSSAI_LICENSE -> "FSSAI registration or licence";
            case SELECTED_PROOF_FRONT -> "Selected proof front or single file";
            case SELECTED_PROOF_BACK -> "Selected proof back";
        };
    }

    private void updateDecision(UUID applicationId, UUID adminIdentityId, String decision, String reason) {
        int updated = jdbcTemplate.update(
            "UPDATE chef_application SET status = ?, rejection_reason = ?, reviewed_at = now(), reviewed_by_identity_id = ?, updated_at = now() WHERE id = ?",
            decision, blankToNull(reason), adminIdentityId, applicationId
        );
        if (updated == 0) {
            throw ApiException.notFound("CHEF_APPLICATION_NOT_FOUND", "Chef application was not found");
        }
        jdbcTemplate.update(
            "INSERT INTO admin_chef_decision_audit (id, application_id, admin_identity_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, now())",
            UUID.randomUUID(), applicationId, adminIdentityId, decision, blankToNull(reason)
        );
    }

    private ChefApplicationResponse getExistingApplication(UUID identityId) {
        List<ChefApplicationResponse> rows = findApplications("WHERE identity_id = ?", identityId);
        if (rows.isEmpty()) {
            throw ApiException.badRequest("CHEF_APPLICATION_REQUIRED", "Submit chef application before uploading documents");
        }
        return rows.getFirst();
    }

    private KycDocumentResponse getDocument(UUID documentId) {
        return jdbcTemplate.query("SELECT * FROM chef_kyc_document WHERE id = ?", this::mapDocument, documentId).getFirst();
    }

    private List<ChefApplicationResponse> findApplications(String whereClause, Object... args) {
        String sql = "SELECT * FROM chef_application " + whereClause + " ORDER BY submitted_at DESC";
        return jdbcTemplate.query(sql, this::mapApplication, args);
    }

    private ChefApplicationResponse mapApplication(ResultSet rs, int rowNum) throws SQLException {
        UUID applicationId = rs.getObject("id", UUID.class);
        return new ChefApplicationResponse(
            applicationId, rs.getObject("identity_id", UUID.class), rs.getString("phone_number"),
            rs.getString("email"), rs.getString("first_name"), rs.getString("last_name"),
            rs.getString("address_line1"), rs.getString("address_line2"), rs.getString("landmark"),
            rs.getString("city"), rs.getString("state"), rs.getString("postal_code"),
            rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
            ChefApplicationStatus.valueOf(rs.getString("status")), rs.getString("rejection_reason"),
            instant(rs, "submitted_at"), instant(rs, "reviewed_at"),
            rs.getObject("reviewed_by_identity_id", UUID.class), listLegacyDocuments(applicationId),
            rs.getString("reference_code")
        );
    }

    private List<KycDocumentResponse> listLegacyDocuments(UUID applicationId) {
        return jdbcTemplate.query(
            "SELECT * FROM chef_kyc_document WHERE application_id = ? AND removed_at IS NULL AND (document_type IN ('AADHAAR_CARD', 'PAN_CARD') OR EXISTS(SELECT 1 FROM chef_onboarding_draft d WHERE d.application_id=chef_kyc_document.application_id)) ORDER BY document_type",
            this::mapDocument, applicationId
        );
    }

    private List<KycDocumentResponse> listApplicationEvidence(UUID applicationId) {
        return jdbcTemplate.query(
            "SELECT * FROM chef_kyc_document WHERE application_id = ? AND removed_at IS NULL AND document_type IN ('APPLICANT_PHOTO', 'GOVERNMENT_ID_FRONT', 'GOVERNMENT_ID_BACK', 'TAX_ID_CARD', 'KITCHEN_PHOTO_1', 'KITCHEN_PHOTO_2', 'FSSAI_LICENSE', 'SELECTED_PROOF_FRONT', 'SELECTED_PROOF_BACK') ORDER BY document_type",
            this::mapDocument, applicationId
        );
    }

    private KycDocumentResponse mapDocument(ResultSet rs, int rowNum) throws SQLException {
        return new KycDocumentResponse(
            rs.getObject("id", UUID.class), KycDocumentType.valueOf(rs.getString("document_type")),
            rs.getString("original_file_name"), rs.getString("blob_container"), rs.getString("blob_name"),
            rs.getString("content_type"), rs.getLong("file_size_bytes"), rs.getString("status"),
            rs.getString("review_reason"), instant(rs, "reviewed_at"),
            instant(rs, "created_at"), instant(rs, "updated_at")
        );
    }

    private static void requireReviewAccess(CurrentUser user) {
        if (user == null || !user.hasAnyRole(
            "PLATFORM_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN"
        )) {
            throw ApiException.forbidden("CHEF_REVIEW_ROLE_REQUIRED", "Chef review access is required");
        }
    }

    private static void requireDecisionAccess(CurrentUser user) {
        if (user == null || !user.hasAnyRole("PLATFORM_ADMIN", "CHEF_ADMIN")) {
            throw ApiException.forbidden("CHEF_DECISION_ROLE_REQUIRED", "Chef decision access is required");
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record ExistingDocument(UUID id, String status) {}
}
