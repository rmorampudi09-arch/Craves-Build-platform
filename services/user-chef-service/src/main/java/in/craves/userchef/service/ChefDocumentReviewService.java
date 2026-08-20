package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ChefDocumentReviewService {
    private static final int MAX_REASON_LENGTH = 1000;

    private final JdbcTemplate jdbcTemplate;
    private final BlobDocumentStorageService storageService;
    private final NotificationInternalClient notificationInternalClient;

    public ChefDocumentReviewService(
        JdbcTemplate jdbcTemplate,
        BlobDocumentStorageService storageService,
        NotificationInternalClient notificationInternalClient
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.storageService = storageService;
        this.notificationInternalClient = notificationInternalClient;
    }

    public List<DocumentMetadata> list(CurrentUser admin, UUID applicationId) {
        requireReviewAccess(admin);
        return jdbcTemplate.query(
            """
                SELECT id, document_type, original_file_name, content_type, file_size_bytes,
                       status, review_reason, reviewed_at
                FROM chef_kyc_document
                WHERE application_id = ?
                ORDER BY document_type
                """,
            (resultSet, rowNumber) -> mapMetadata(resultSet),
            applicationId
        );
    }

    public StoredDocumentBytes download(
        CurrentUser admin,
        UUID applicationId,
        UUID documentId
    ) {
        requireReviewAccess(admin);
        DocumentLocation location = jdbcTemplate.query(
            """
                SELECT blob_container, blob_name, original_file_name, content_type, file_size_bytes
                FROM chef_kyc_document
                WHERE id = ? AND application_id = ?
                """,
            (resultSet, rowNumber) -> new DocumentLocation(
                resultSet.getString("blob_container"),
                resultSet.getString("blob_name"),
                resultSet.getString("original_file_name"),
                resultSet.getString("content_type"),
                resultSet.getLong("file_size_bytes")
            ),
            documentId,
            applicationId
        ).stream().findFirst().orElseThrow(() ->
            ApiException.notFound("CHEF_DOCUMENT_NOT_FOUND", "Chef proof document was not found")
        );
        return storageService.downloadKycDocument(
            location.container(),
            location.blobName(),
            location.originalFileName(),
            location.contentType(),
            location.fileSizeBytes()
        );
    }

    @Transactional
    public DocumentMetadata approve(CurrentUser admin, UUID applicationId, UUID documentId) {
        requireDecisionAccess(admin);
        DocumentReviewTarget target = reviewTarget(applicationId, documentId);
        requirePendingReview(target);

        jdbcTemplate.update(
            "UPDATE chef_kyc_document SET status = 'APPROVED', review_reason = NULL, " +
                "reviewed_by_identity_id = ?, reviewed_at = now(), updated_at = now() WHERE id = ? AND application_id = ?",
            admin.identityId(), documentId, applicationId
        );
        audit(applicationId, documentId, admin.identityId(), "APPROVED", null);
        return metadata(applicationId, documentId);
    }

    @Transactional
    public DocumentMetadata reject(CurrentUser admin, UUID applicationId, UUID documentId, String rawReason) {
        requireDecisionAccess(admin);
        String reason = rejectionReason(rawReason);
        DocumentReviewTarget target = reviewTarget(applicationId, documentId);
        requirePendingReview(target);

        jdbcTemplate.update(
            "UPDATE chef_kyc_document SET status = 'REJECTED', review_reason = ?, " +
                "reviewed_by_identity_id = ?, reviewed_at = now(), updated_at = now() WHERE id = ? AND application_id = ?",
            reason, admin.identityId(), documentId, applicationId
        );
        audit(applicationId, documentId, admin.identityId(), "REJECTED", reason);
        notificationInternalClient.chefDocumentRejected(
            target.chefIdentityId(),
            applicationId,
            documentId,
            target.documentType(),
            reason
        );
        return metadata(applicationId, documentId);
    }

    private DocumentReviewTarget reviewTarget(UUID applicationId, UUID documentId) {
        return jdbcTemplate.query(
            """
                SELECT d.identity_id, d.document_type, d.status AS document_status,
                       a.status AS application_status
                FROM chef_kyc_document d
                JOIN chef_application a ON a.id = d.application_id
                WHERE d.id = ? AND d.application_id = ?
                """,
            (resultSet, rowNumber) -> new DocumentReviewTarget(
                resultSet.getObject("identity_id", UUID.class),
                resultSet.getString("document_type"),
                resultSet.getString("document_status"),
                resultSet.getString("application_status")
            ),
            documentId,
            applicationId
        ).stream().findFirst().orElseThrow(() ->
            ApiException.notFound("CHEF_DOCUMENT_NOT_FOUND", "Chef proof document was not found")
        );
    }

    private static void requirePendingReview(DocumentReviewTarget target) {
        if (!"PENDING".equals(target.applicationStatus())) {
            throw ApiException.conflict(
                "CHEF_APPLICATION_NOT_PENDING",
                "Document decisions are only allowed while the Chef application is pending"
            );
        }
        if (!"UPLOADED".equals(target.documentStatus())) {
            throw ApiException.conflict(
                "CHEF_DOCUMENT_NOT_AWAITING_REVIEW",
                "Only a newly uploaded Chef document can receive a review decision"
            );
        }
    }

    private DocumentMetadata metadata(UUID applicationId, UUID documentId) {
        return jdbcTemplate.query(
            """
                SELECT id, document_type, original_file_name, content_type, file_size_bytes,
                       status, review_reason, reviewed_at
                FROM chef_kyc_document
                WHERE id = ? AND application_id = ?
                """,
            (resultSet, rowNumber) -> mapMetadata(resultSet),
            documentId,
            applicationId
        ).stream().findFirst().orElseThrow(() ->
            ApiException.notFound("CHEF_DOCUMENT_NOT_FOUND", "Chef proof document was not found")
        );
    }

    private static DocumentMetadata mapMetadata(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        Timestamp reviewedAt = resultSet.getTimestamp("reviewed_at");
        return new DocumentMetadata(
            resultSet.getObject("id", UUID.class),
            resultSet.getString("document_type"),
            resultSet.getString("original_file_name"),
            resultSet.getString("content_type"),
            resultSet.getLong("file_size_bytes"),
            resultSet.getString("status"),
            resultSet.getString("review_reason"),
            reviewedAt == null ? null : reviewedAt.toInstant()
        );
    }

    private void audit(
        UUID applicationId,
        UUID documentId,
        UUID adminIdentityId,
        String decision,
        String reason
    ) {
        jdbcTemplate.update(
            "INSERT INTO admin_chef_document_decision_audit " +
                "(id, application_id, document_id, admin_identity_id, decision, reason, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, now())",
            UUID.randomUUID(), applicationId, documentId, adminIdentityId, decision, reason
        );
    }

    private static String rejectionReason(String value) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest("CHEF_DOCUMENT_REJECTION_REASON_REQUIRED", "Document rejection reason is required");
        }
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 3 || normalized.length() > MAX_REASON_LENGTH) {
            throw ApiException.badRequest(
                "CHEF_DOCUMENT_REJECTION_REASON_INVALID",
                "Document rejection reason must contain 3 to 1000 characters"
            );
        }
        return normalized;
    }

    private static void requireReviewAccess(CurrentUser user) {
        if (user == null || !user.hasAnyRole("PLATFORM_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN")) {
            throw ApiException.forbidden(
                "CHEF_DOCUMENT_REVIEW_ROLE_REQUIRED",
                "Chef document review access is required"
            );
        }
    }

    private static void requireDecisionAccess(CurrentUser user) {
        if (user == null || !user.hasAnyRole("PLATFORM_ADMIN", "CHEF_ADMIN")) {
            throw ApiException.forbidden(
                "CHEF_DOCUMENT_DECISION_ROLE_REQUIRED",
                "Chef document decision access is required"
            );
        }
    }

    public record DocumentMetadata(
        UUID id,
        String documentType,
        String originalFileName,
        String contentType,
        long fileSizeBytes,
        String status,
        String reviewReason,
        Instant reviewedAt
    ) {}

    private record DocumentLocation(
        String container,
        String blobName,
        String originalFileName,
        String contentType,
        long fileSizeBytes
    ) {}

    private record DocumentReviewTarget(
        UUID chefIdentityId,
        String documentType,
        String documentStatus,
        String applicationStatus
    ) {}
}
