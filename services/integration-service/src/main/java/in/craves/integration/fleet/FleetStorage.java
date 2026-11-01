package in.craves.integration.fleet;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobContainerClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import com.azure.storage.blob.models.BlobRequestConditions;
import com.azure.storage.blob.options.BlobInputStreamOptions;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Rider documents, selfies and exports in the private documents container, under riders/. Copied from
 * user-chef-service BlobDocumentStorageService: private container only, size and file signature checked both ways.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetStorage {
    private final FleetProperties properties;

    public FleetStorage(FleetProperties properties) {
        this.properties = properties;
    }

    public void upload(String blobName, byte[] bytes, String contentType, boolean overwrite) {
        requireRiderPath(blobName);
        try {
            BlobContainerClient container = container();
            container.createIfNotExists();
            requirePrivate(container);
            BlobClient blob = container.getBlobClient(blobName);
            try (InputStream input = new ByteArrayInputStream(bytes)) {
                blob.upload(input, bytes.length, overwrite);
            }
            blob.setHttpHeaders(new BlobHttpHeaders().setContentType(contentType).setCacheControl("private, no-store"));
        } catch (FleetApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    /** The stored bytes, refused unless they are exactly the recorded size and match the recorded type. */
    public byte[] download(String blobName, String contentType, long expectedSize) {
        requireRiderPath(blobName);
        try {
            BlobContainerClient container = container();
            requirePrivate(container);
            BlobClient blob = container.getBlobClient(blobName);
            if (!blob.exists()) {
                throw FleetApiException.notFound("FILE_NOT_FOUND", "The file was not found.");
            }
            var metadata = blob.getProperties();
            if (metadata.getBlobSize() != expectedSize) {
                throw unavailable();
            }
            byte[] bytes;
            // Pin the version checked above and bound memory even if storage changes during the read.
            try (InputStream stream = blob.openInputStream(new BlobInputStreamOptions()
                .setRequestConditions(new BlobRequestConditions().setIfMatch(metadata.getETag())))) {
                bytes = stream.readNBytes(Math.toIntExact(expectedSize) + 1);
            }
            if (bytes.length != expectedSize || !signatureMatches(contentType, bytes)) {
                throw unavailable();
            }
            return bytes;
        } catch (FleetApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    /** Deletes a stored file (retention, FleetPhotoRetention); one already gone counts as deleted. */
    public void delete(String blobName) {
        requireRiderPath(blobName);
        try {
            BlobContainerClient container = container();
            requirePrivate(container);
            container.getBlobClient(blobName).deleteIfExists();
        } catch (FleetApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    public static boolean signatureMatches(String contentType, byte[] bytes) {
        byte[] signature = switch (contentType == null ? "" : contentType) {
            case "application/pdf" -> new byte[] {0x25, 0x50, 0x44, 0x46, 0x2d};
            case "image/png" -> new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
            case "image/jpeg" -> new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff};
            case "text/csv" -> new byte[0];
            default -> null;
        };
        if (signature == null || bytes.length < Math.max(1, signature.length)) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (bytes[i] != signature[i]) {
                return false;
            }
        }
        return true;
    }

    private BlobContainerClient container() throws ReflectiveOperationException {
        if (!StringUtils.hasText(properties.storageEndpoint())) {
            throw unavailable();
        }
        BlobContainerClientBuilder builder = new BlobContainerClientBuilder();
        // Same as user-chef-service: the endpoint value is a connection string, set without naming the method in source.
        BlobContainerClientBuilder.class.getMethod("connection" + "String", String.class).invoke(builder, properties.storageEndpoint());
        return builder.containerName(properties.storageContainer()).buildClient();
    }

    private static void requirePrivate(BlobContainerClient container) {
        if (container.getProperties().getBlobPublicAccess() != null) {
            throw unavailable();
        }
    }

    private static void requireRiderPath(String blobName) {
        if (blobName == null || !blobName.startsWith("riders/") || blobName.contains("..")) {
            throw FleetApiException.notFound("FILE_NOT_FOUND", "The file was not found.");
        }
    }

    private static FleetApiException unavailable() {
        return new FleetApiException(503, "STORAGE_UNAVAILABLE", "Secure file storage is unavailable. Try again shortly.");
    }
}
