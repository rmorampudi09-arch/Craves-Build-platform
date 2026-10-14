package in.craves.catalog.service;

import in.craves.catalog.config.UserChefClientProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** Reads an approved chef's registration kitchen photo (slot 1 or 2) from user-chef-service. */
@Component
public class UserChefKitchenPhotoClient {
    static final int MAX_BYTES = 10 * 1024 * 1024; // user-chef's own upload limit
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png");
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();

    private final UserChefClientProperties properties;

    public UserChefKitchenPhotoClient(UserChefClientProperties properties) {
        this.properties = properties;
    }

    public boolean configured() {
        return StringUtils.hasText(properties.getInternalBaseUrl()) && StringUtils.hasText(properties.getInternalSecret());
    }

    /** Empty when the chef has no approved photo in that slot; throws when user-chef cannot answer (retry later). */
    public Optional<Photo> fetch(UUID identityId, int slot) {
        if (!configured()) {
            throw new IllegalStateException("user-chef internal URL/secret is not configured");
        }
        String base = properties.getInternalBaseUrl().trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + "/internal/v1/chef-kitchen-photos/" + slot + "?identityId=" + identityId))
            .timeout(Duration.ofSeconds(30))
            .header("X-Craves-Internal-Secret", properties.getInternalSecret().trim())
            .GET()
            .build();
        HttpResponse<byte[]> response;
        try {
            response = HTTP.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException ex) {
            throw new IllegalStateException("user-chef kitchen photo request failed", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("user-chef kitchen photo request was interrupted", ex);
        }
        if (response.statusCode() == 404) return Optional.empty();
        if (response.statusCode() != 200) {
            throw new IllegalStateException("user-chef answered " + response.statusCode() + " for a kitchen photo");
        }
        String type = response.headers().firstValue("Content-Type").orElse("").split(";")[0].trim().toLowerCase(Locale.ROOT);
        byte[] data = response.body();
        if (!TYPES.contains(type) || data.length == 0 || data.length > MAX_BYTES) {
            throw new IllegalStateException("user-chef sent a kitchen photo that is not a JPEG/PNG up to 10 MiB");
        }
        return Optional.of(new Photo(data, type));
    }

    public record Photo(byte[] data, String contentType) {
    }
}
