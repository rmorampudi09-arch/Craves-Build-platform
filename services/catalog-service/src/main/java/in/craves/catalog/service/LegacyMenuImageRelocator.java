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
 * Dish photos uploaded before the environment rebuild are still served from the previous storage account.
 * On start, each one is copied (server side) into this environment's photo store and its URL rewritten,
 * so existing menus keep their photos when the old account goes away. Rows already moved are skipped.
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
                String next = media.copyFromPublicUrl(url, (String) row.get("blob_name"), (String) row.get("content_type"));
                moved += jdbcTemplate.update(
                    "UPDATE catalog_schema.menu_item_image SET public_url = ? WHERE id = ? AND public_url = ?", next, row.get("id"), url
                );
            } catch (RuntimeException ex) {
                // Error codes and our own messages only; never response bodies.
                String detail = ex instanceof BlobStorageException blob ? String.valueOf(blob.getErrorCode()) : ex instanceof ApiException api ? api.getMessage() : "";
                log.warn("Legacy menu photo {} not relocated: {} {}", row.get("id"), ex.getClass().getSimpleName(), detail);
            }
        }
        log.info("Relocated {} of {} legacy menu photos", moved, rows.size());
        return moved;
    }
}
