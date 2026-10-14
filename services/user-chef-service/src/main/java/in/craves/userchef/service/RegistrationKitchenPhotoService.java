package in.craves.userchef.service;

import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The two kitchen photos of an APPROVED chef application, for the catalog to publish. Only KITCHEN_PHOTO_1 and
 * KITCHEN_PHOTO_2 are reachable here; every other document type (ID proofs, FSSAI) stays private.
 */
@Service
public class RegistrationKitchenPhotoService {
    private final JdbcTemplate jdbcTemplate;
    private final BlobDocumentStorageService storageService;

    public RegistrationKitchenPhotoService(JdbcTemplate jdbcTemplate, BlobDocumentStorageService storageService) {
        this.jdbcTemplate = jdbcTemplate;
        this.storageService = storageService;
    }

    public Optional<StoredDocumentBytes> approvedKitchenPhoto(UUID identityId, int slot) {
        if (slot != 1 && slot != 2) {
            return Optional.empty();
        }
        return jdbcTemplate.query(
            """
                SELECT d.blob_container, d.blob_name, d.original_file_name, d.content_type, d.file_size_bytes
                FROM chef_application a
                JOIN chef_kyc_document d ON d.application_id = a.id
                WHERE a.identity_id = ?
                  AND a.status = 'APPROVED'
                  AND d.document_type = ?
                  AND d.removed_at IS NULL
                  AND d.status <> 'REJECTED'
                """,
            (rs, row) -> storageService.downloadKycDocument(
                rs.getString("blob_container"),
                rs.getString("blob_name"),
                rs.getString("original_file_name"),
                rs.getString("content_type"),
                rs.getLong("file_size_bytes")
            ),
            identityId,
            "KITCHEN_PHOTO_" + slot
        ).stream().findFirst();
    }
}
