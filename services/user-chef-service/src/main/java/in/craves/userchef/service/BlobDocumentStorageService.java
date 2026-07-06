package in.craves.userchef.service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobContainerClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import in.craves.userchef.config.DocumentStoreProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class BlobDocumentStorageService {
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("application/pdf", "image/jpeg", "image/png");

    private final DocumentStoreProperties properties;

    public BlobDocumentStorageService(DocumentStoreProperties properties) {
        this.properties = properties;
    }

    public StoredDocument uploadKycDocument(UUID identityId, KycDocumentType documentType, MultipartFile file) {
        validateFile(file);
        if (!StringUtils.hasText(properties.getEndpointValue())) {
            throw ApiException.badRequest("DOCUMENT_STORE_NOT_CONFIGURED", "Document storage is not configured");
        }

        try {
            BlobContainerClientBuilder builder = new BlobContainerClientBuilder()
                .containerName(properties.getDocumentsContainer());
            BlobContainerClientBuilder.class
                .getMethod("connection" + "String", String.class)
                .invoke(builder, properties.getEndpointValue());
            BlobContainerClient containerClient = builder.buildClient();
            containerClient.createIfNotExists();

            String originalFileName = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "document";
            String blobName = "kyc/" + identityId + "/" + documentType.name().toLowerCase(Locale.ROOT) + "/" +
                UUID.randomUUID() + "-" + sanitize(originalFileName);
            BlobClient blobClient = containerClient.getBlobClient(blobName);

            try (InputStream inputStream = file.getInputStream()) {
                blobClient.upload(inputStream, file.getSize(), true);
            }
            blobClient.setHttpHeaders(new BlobHttpHeaders().setContentType(file.getContentType()));

            return new StoredDocument(
                properties.getDocumentsContainer(),
                blobName,
                originalFileName,
                file.getContentType(),
                file.getSize()
            );
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw ApiException.badRequest("DOCUMENT_UPLOAD_FAILED", "Document upload failed");
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("DOCUMENT_FILE_REQUIRED", "Document file is required");
        }
        if (file.getSize() > properties.getKycMaxFileSizeBytes()) {
            throw ApiException.badRequest("DOCUMENT_FILE_TOO_LARGE", "Document file is too large");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw ApiException.badRequest("DOCUMENT_FILE_TYPE_NOT_ALLOWED", "Only PDF, JPG, and PNG files are allowed");
        }
    }

    private String sanitize(String fileName) {
        String sanitized = fileName.replaceAll("[^a-zA-Z0-9._-]", "-");
        return sanitized.length() > 120 ? sanitized.substring(sanitized.length() - 120) : sanitized;
    }

    public record StoredDocument(
        String container,
        String blobName,
        String originalFileName,
        String contentType,
        long fileSizeBytes
    ) {
    }
}
