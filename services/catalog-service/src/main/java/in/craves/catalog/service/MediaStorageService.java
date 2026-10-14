package in.craves.catalog.service;

import com.azure.core.util.BinaryData;
import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobContainerClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import in.craves.catalog.config.CatalogStorageProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.ApiDtos.KitchenPhotoKind;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaStorageService {
    private static final Logger log = LoggerFactory.getLogger(MediaStorageService.class);
    // Redirects are not followed: only the exact Azure Blob URL stored for the photo is read.
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
    /** Drawn faces chefs pick instead of a real photo: one file per face, shared by every chef who picked it. */
    public static final String CHEF_AVATAR_FOLDER = "public/chef-avatars/";
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
        "image/jpeg",
        "image/png",
        "image/webp"
    );

    // Uploads always get a new unique blob name and relocation rewrites a photo once, before it is ever served
    // from the Front Door path, so a served photo never changes and can be cached for a year.
    static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

    private final CatalogStorageProperties properties;

    public MediaStorageService(CatalogStorageProperties properties) {
        this.properties = properties;
    }

    public StoredMedia uploadMenuImage(UUID kitchenId, UUID menuItemId, MultipartFile file) {
        return upload("public/dishes/" + kitchenId + "/" + menuItemId + "/", file, "menu-image");
    }

    /** Chef or kitchen storefront photo; same type, size and optimisation rules as dish photos. */
    public StoredMedia uploadKitchenImage(UUID kitchenId, KitchenPhotoKind kind, MultipartFile file) {
        return upload("public/kitchens/" + kitchenId + "/" + kind.name().toLowerCase(Locale.ROOT) + "/", file, "kitchen-photo");
    }

    private StoredMedia upload(String folder, MultipartFile file, String fallbackName) {
        validate(file);
        String originalFileName = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : fallbackName;
        String blobName = folder + UUID.randomUUID() + "-" + sanitize(originalFileName);
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException ex) {
            throw new ApiException(500, "MEDIA_UPLOAD_FAILED", "Could not read uploaded media file");
        }
        return store(blobName, data, file.getContentType());
    }

    public String chefAvatarUrl(String avatarId) {
        return publicBaseUrl() + "/" + CHEF_AVATAR_FOLDER + avatarId + ".jpg";
    }

    /** Best effort: removes the blob a public photo URL of this store points at; anything else is ignored. */
    public void deleteByPublicUrl(String url) {
        try {
            String prefix = publicBaseUrl() + "/";
            // Shared by every chef who picked that face, so switching faces must never delete the file.
            if (url != null && url.startsWith(prefix) && !url.startsWith(prefix + CHEF_AVATAR_FOLDER)) deleteQuietly(url.substring(prefix.length()));
        } catch (RuntimeException ex) {
            log.warn("Photo blob could not be removed: {}", ex.getClass().getSimpleName());
        }
    }

    /** Best effort: a missing blob or unconfigured store never blocks removing the photo record. */
    public void deleteQuietly(String blobName) {
        try {
            containerClient().getBlobClient(blobName).deleteIfExists();
        } catch (RuntimeException ex) {
            log.warn("Menu photo blob could not be removed: {}", ex.getClass().getSimpleName());
        }
    }

    public boolean configured() {
        return StringUtils.hasText(properties.getEndpointValue());
    }

    /** Public URL prefix of photos stored by this service (without a trailing slash). */
    public String publicBaseUrl() {
        return StringUtils.hasText(properties.getPublicMediaBaseUrl())
            ? properties.getPublicMediaBaseUrl().replaceAll("/+$", "")
            : buildContainerClient().getBlobContainerUrl();
    }

    /**
     * Copies a publicly readable photo into this container and returns where it is stored. Downloaded here and
     * uploaded, because Azure's server-side copy from the previous account was refused (BlobStorageException).
     */
    public StoredMedia copyFromPublicUrl(String sourceUrl, String blobName, String contentType) {
        byte[] data;
        try {
            HttpResponse<InputStream> response = HTTP.send(
                HttpRequest.newBuilder(URI.create(sourceUrl)).timeout(Duration.ofSeconds(30)).GET().build(),
                HttpResponse.BodyHandlers.ofInputStream()
            );
            try (InputStream body = response.body()) {
                if (response.statusCode() != 200) throw new IOException("HTTP " + response.statusCode());
                data = body.readNBytes((int) properties.getMaxImageFileSizeBytes() + 1);
            }
        } catch (IOException ex) {
            throw new ApiException(502, "LEGACY_MEDIA_UNAVAILABLE", "Previous photo could not be read: " + ex.getMessage());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(502, "LEGACY_MEDIA_UNAVAILABLE", "Previous photo read was interrupted");
        }
        if (data.length == 0 || data.length > properties.getMaxImageFileSizeBytes()) {
            throw new ApiException(502, "LEGACY_MEDIA_UNAVAILABLE", "Previous photo is empty or too large");
        }
        return store(blobName, data, contentType);
    }

    /** Shrinks the photo when it is oversized, then stores it with long-lived caching for browsers and Front Door. */
    private StoredMedia store(String blobName, byte[] data, String contentType) {
        MenuPhotoOptimizer.Photo photo = MenuPhotoOptimizer.optimize(data, contentType);
        BlobClient blobClient = containerClient().getBlobClient(blobName);
        blobClient.upload(BinaryData.fromBytes(photo.data()), true);
        blobClient.setHttpHeaders(new BlobHttpHeaders().setContentType(photo.contentType()).setCacheControl(CACHE_CONTROL));
        return new StoredMedia(
            properties.getMediaContainer(),
            blobName,
            photo.contentType(),
            photo.data().length,
            publicUrl(blobClient, blobName)
        );
    }

    private BlobContainerClient containerClient() {
        BlobContainerClient client = buildContainerClient();
        client.createIfNotExists();
        return client;
    }

    BlobContainerClient buildContainerClient() {
        if (!StringUtils.hasText(properties.getEndpointValue())) {
            throw new ApiException(500, "MEDIA_STORE_NOT_CONFIGURED", "Catalog media storage is not configured");
        }
        try {
            BlobContainerClientBuilder builder = new BlobContainerClientBuilder();
            BlobContainerClientBuilder.class
                .getMethod("connection" + "String", String.class)
                .invoke(builder, properties.getEndpointValue());
            // Named after the connection string: its "BlobEndpoint=https://…/" sets an empty container, i.e. $root (writes failed InvalidUri).
            return builder.containerName(properties.getMediaContainer()).buildClient();
        } catch (ReflectiveOperationException ex) {
            throw new ApiException(500, "MEDIA_STORE_CONFIGURATION_FAILED", "Catalog media storage could not be configured");
        }
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("MEDIA_FILE_REQUIRED", "Media file is required");
        }
        if (file.getSize() > properties.getMaxImageFileSizeBytes()) {
            throw ApiException.badRequest("MEDIA_FILE_TOO_LARGE", "Media file is larger than allowed limit");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw ApiException.badRequest("MEDIA_CONTENT_TYPE_NOT_ALLOWED", "Only JPEG, PNG and WebP images are allowed");
        }
    }

    private String publicUrl(BlobClient blobClient, String blobName) {
        if (StringUtils.hasText(properties.getPublicMediaBaseUrl())) {
            String base = properties.getPublicMediaBaseUrl().replaceAll("/+$", "");
            return base + "/" + blobName;
        }
        return blobClient.getBlobUrl();
    }

    private static String sanitize(String name) {
        String cleaned = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "-");
        return cleaned.length() > 120 ? cleaned.substring(cleaned.length() - 120) : cleaned;
    }

    public record StoredMedia(String blobContainer, String blobName, String contentType, long fileSizeBytes, String publicUrl) {
        public MenuItemImageResponse toResponse(UUID id, UUID menuItemId, int sortOrder, boolean primary) {
            return new MenuItemImageResponse(id, menuItemId, blobContainer, blobName, contentType, fileSizeBytes, publicUrl, sortOrder, primary, Instant.now());
        }
    }
}
