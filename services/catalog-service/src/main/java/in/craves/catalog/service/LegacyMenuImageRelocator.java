package in.craves.catalog.service;

import com.azure.storage.blob.models.BlobStorageException;
import in.craves.catalog.exception.ApiException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Moves every dish photo whose URL is not under this environment's public photo address: photos left in the
 * previous storage account, and photos still linked straight to blob storage after the address is switched to
 * the Front Door path (CRAVES_MEDIA_PUBLIC_BASE_URL). On start, each one is copied (and shrunk if oversized)
 * into this environment's photo store and its row rewritten. Rows already moved are skipped.
 */
@Component
public class LegacyMenuImageRelocator {
    private static final Logger log = LoggerFactory.getLogger(LegacyMenuImageRelocator.class);
    // Only Azure Blob sources: never fetch an arbitrary host stored in the database.
    private static final Pattern AZURE_BLOB = Pattern.compile("^https://[a-z0-9]{3,24}\\.blob\\.core\\.windows\\.net/[^?#]+$");
    private final JdbcTemplate jdbcTemplate;
    private final MediaStorageService media;

    public LegacyMenuImageRelocator(JdbcTemplate jdbcTemplate, MediaStorageService media) {
        this.jdbcTemplate = jdbcTemplate;
        this.media = media;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (media.configured()) CompletableFuture.runAsync(this::relocate).exceptionally(ex -> {
            log.warn("Legacy menu photo relocation stopped: {}", ex.getClass().getSimpleName());
            return null;
        });
    }

    int relocate() {
        String base;
        try {
            base = media.publicBaseUrl() + "/";
        } catch (RuntimeException ex) {
            log.warn("Legacy menu photo relocation skipped: {}", ex.getClass().getSimpleName());
            return 0;
        }
        var rows = jdbcTemplate.queryForList(
            "SELECT id, blob_name, content_type, public_url FROM catalog_schema.menu_item_image WHERE public_url IS NOT NULL AND NOT starts_with(public_url, ?)",
            base
        );
        int moved = 0;
        for (Map<String, Object> row : rows) {
            String url = (String) row.get("public_url");
            if (!AZURE_BLOB.matcher(url).matches()) continue;
            try {
                var stored = media.copyFromPublicUrl(url, (String) row.get("blob_name"), (String) row.get("content_type"));
                moved += jdbcTemplate.update(
                    "UPDATE catalog_schema.menu_item_image SET public_url = ?, content_type = ?, file_size_bytes = ? WHERE id = ? AND public_url = ?",
                    stored.publicUrl(), stored.contentType(), stored.fileSizeBytes(), row.get("id"), url
                );
            } catch (RuntimeException ex) {
                // Error codes and our own messages only; never response bodies.
                String detail = ex instanceof BlobStorageException blob ? String.valueOf(blob.getErrorCode()) : ex instanceof ApiException api ? api.getMessage() : "";
                log.warn("Menu photo {} not relocated: {} {}", row.get("id"), ex.getClass().getSimpleName(), detail);
            }
        }
        log.info("Relocated {} of {} menu photos", moved, rows.size());
        return moved;
    }
}
