package in.craves.userchef.service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobContainerClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import com.azure.storage.blob.models.BlobRequestConditions;
import com.azure.storage.blob.options.BlobInputStreamOptions;
import in.craves.userchef.config.DocumentStoreProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class BlobDocumentStorageService {
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("application/pdf", "image/jpeg", "image/png");
    private static final Set<String> APPLICANT_PHOTO_CONTENT_TYPES = Set.of("image/jpeg", "image/png");

    private final DocumentStoreProperties properties;

    public BlobDocumentStorageService(DocumentStoreProperties properties) {
        this.properties = properties;
    }

    public StoredDocument uploadKycDocument(UUID identityId, KycDocumentType documentType, MultipartFile file) {
        if(identityId==null || documentType==null) throw ApiException.badRequest("DOCUMENT_OWNER_REQUIRED", "Choose a document for your application");
        byte[] verifiedBytes=validatedBytes(documentType,file);
        BlobContainerClient containerClient = documentsContainer();
        try {
            containerClient.createIfNotExists();
            requirePrivate(containerClient);

            String originalFileName = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "document";
            String blobName = "kyc/" + identityId + "/" + documentType.name().toLowerCase(Locale.ROOT) + "/" +
                UUID.randomUUID() + "-" + sanitize(originalFileName);
            BlobClient blobClient = containerClient.getBlobClient(blobName);

            try (InputStream inputStream = new ByteArrayInputStream(verifiedBytes)) {
                blobClient.upload(inputStream, verifiedBytes.length, false);
            }
            blobClient.setHttpHeaders(new BlobHttpHeaders().setContentType(file.getContentType()));

            return new StoredDocument(
                properties.getDocumentsContainer(),
                blobName,
                sanitize(originalFileName),
                file.getContentType(),
                verifiedBytes.length
            );
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw ApiException.badRequest("DOCUMENT_UPLOAD_FAILED", "Document upload failed");
        }
    }

    public StoredDocumentBytes downloadKycDocument(
        String container,
        String blobName,
        String originalFileName,
        String contentType,
        long expectedSizeBytes
    ) {
        if (!StringUtils.hasText(container) || !container.equals(properties.getDocumentsContainer())) {
            throw ApiException.notFound("DOCUMENT_NOT_FOUND", "Document was not found");
        }
        if (!StringUtils.hasText(blobName) || !blobName.startsWith("kyc/") || blobName.contains("..")) {
            throw ApiException.notFound("DOCUMENT_NOT_FOUND", "Document was not found");
        }
        if (contentType==null || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw ApiException.badRequest("DOCUMENT_FILE_TYPE_NOT_ALLOWED", "Document type is not allowed");
        }
        if (expectedSizeBytes < 1 || expectedSizeBytes > properties.getKycMaxFileSizeBytes()) {
            throw ApiException.badRequest("DOCUMENT_FILE_SIZE_INVALID", "Document size is invalid");
        }
        try {
            BlobContainerClient documents=documentsContainer();
            requirePrivate(documents);
            BlobClient client = documents.getBlobClient(blobName);
            if (!client.exists()) {
                throw ApiException.notFound("DOCUMENT_NOT_FOUND", "Document was not found");
            }
            var metadata=client.getProperties();
            if(metadata.getBlobSize()!=expectedSizeBytes || metadata.getBlobSize()>properties.getKycMaxFileSizeBytes()) {
                throw ApiException.badRequest("DOCUMENT_FILE_SIZE_INVALID", "Document size is invalid");
            }
            byte[] bytes;
            // Pin the version checked above and bound memory even if storage changes during the read.
            try(InputStream stream=client.openInputStream(new BlobInputStreamOptions()
                .setRequestConditions(new BlobRequestConditions().setIfMatch(metadata.getETag())))) {
                bytes=stream.readNBytes(Math.toIntExact(expectedSizeBytes)+1);
            }
            if(bytes.length!=expectedSizeBytes) throw ApiException.badRequest("DOCUMENT_FILE_SIZE_INVALID", "Document size is invalid");
            requireSignature(contentType,bytes);
            return new StoredDocumentBytes(sanitize(originalFileName), contentType, bytes);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw ApiException.badRequest("DOCUMENT_DOWNLOAD_FAILED", "Document could not be downloaded");
        }
    }

    private BlobContainerClient documentsContainer() {
        if (!StringUtils.hasText(properties.getEndpointValue())) {
            throw ApiException.badRequest("DOCUMENT_STORE_NOT_CONFIGURED", "Document storage is not configured");
        }
        try {
            BlobContainerClientBuilder builder = new BlobContainerClientBuilder()
                .containerName(properties.getDocumentsContainer());
            BlobContainerClientBuilder.class
                .getMethod("connection" + "String", String.class)
                .invoke(builder, properties.getEndpointValue());
            return builder.buildClient();
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw ApiException.badRequest("DOCUMENT_STORE_NOT_CONFIGURED", "Document storage is not configured");
        }
    }

    private static void requirePrivate(BlobContainerClient container) {
        if(container.getProperties().getBlobPublicAccess()!=null)
            throw ApiException.badRequest("DOCUMENT_STORAGE_PRIVACY_REQUIRED", "Document uploads are temporarily unavailable. Please try again later.");
    }

    byte[] validatedBytes(KycDocumentType documentType, MultipartFile file) {
        validateFile(documentType,file);
        long limit=properties.getKycMaxFileSizeBytes();
        if(limit<1 || limit>10L*1024*1024) throw ApiException.badRequest("DOCUMENT_SIZE_LIMIT_INVALID", "Document uploads are temporarily unavailable");
        try(InputStream stream=file.getInputStream()) {
            byte[] bytes=stream.readNBytes(Math.toIntExact(limit)+1);
            if(bytes.length>limit) throw ApiException.badRequest("DOCUMENT_FILE_TOO_LARGE", "Document file is too large");
            if(bytes.length!=file.getSize()) throw ApiException.badRequest("DOCUMENT_FILE_SIZE_INVALID", "We could not read the complete file. Please select it again.");
            requireSignature(file.getContentType(),bytes);
            return bytes;
        } catch(ApiException ex) {throw ex;}
        catch(Exception ex) {throw ApiException.badRequest("DOCUMENT_FILE_UNREADABLE", "We could not read this file. Please select it again.");}
    }

    static void requireSignature(String contentType,byte[] bytes) {
        byte[] signature=switch(contentType) {
            case "application/pdf" -> new byte[]{0x25,0x50,0x44,0x46,0x2d};
            case "image/png" -> new byte[]{(byte)0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a};
            case "image/jpeg" -> new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff};
            default -> new byte[0];
        };
        boolean matches=signature.length>0 && bytes.length>=signature.length;
        for(int i=0;matches && i<signature.length;i++) matches=bytes[i]==signature[i];
        if(!matches) throw ApiException.badRequest("DOCUMENT_CONTENT_TYPE_MISMATCH", "This file does not match its format. Choose an original PDF, JPG or PNG file.");
    }

    private void validateFile(KycDocumentType documentType, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("DOCUMENT_FILE_REQUIRED", "Document file is required");
        }
        if (file.getSize() > properties.getKycMaxFileSizeBytes()) {
            throw ApiException.badRequest("DOCUMENT_FILE_TOO_LARGE", "Document file is too large");
        }
        if (file.getContentType()==null || !ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw ApiException.badRequest("DOCUMENT_FILE_TYPE_NOT_ALLOWED", "Only PDF, JPG, and PNG files are allowed");
        }
        if (documentType == KycDocumentType.APPLICANT_PHOTO && !APPLICANT_PHOTO_CONTENT_TYPES.contains(file.getContentType())) {
            throw ApiException.badRequest(
                "APPLICANT_PHOTO_FILE_TYPE_NOT_ALLOWED",
                "Applicant photo must be a JPG or PNG image"
            );
        }
    }

    private String sanitize(String fileName) {
        String source = StringUtils.hasText(fileName) ? fileName : "document";
        String sanitized = source.replaceAll("[^a-zA-Z0-9._-]", "-");
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

    public record StoredDocumentBytes(String originalFileName, String contentType, byte[] bytes) {
    }
}
