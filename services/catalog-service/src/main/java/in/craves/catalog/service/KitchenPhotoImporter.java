package in.craves.catalog.service;

import in.craves.catalog.service.MediaStorageService.StoredMedia;
import in.craves.catalog.service.UserChefKitchenPhotoClient.Photo;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Copies a chef's approved registration kitchen photos into the kitchen's two public photo slots, once per kitchen:
 * right after the kitchen is saved, and at start-up for every kitchen not imported yet. Registration photos replace
 * whatever the slots held. When user-chef cannot answer, nothing is written and the next start retries.
 */
@Component
public class KitchenPhotoImporter {
    private static final Logger log = LoggerFactory.getLogger(KitchenPhotoImporter.class);
    private static final int BACKFILL_LIMIT = 500;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final MediaStorageService media;
    private final UserChefKitchenPhotoClient client;
    private final DiscoveryCacheService discoveryCacheService;
    private final ExecutorService background = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "kitchen-photo-import");
        thread.setDaemon(true);
        return thread;
    });

    public KitchenPhotoImporter(
        JdbcTemplate jdbcTemplate,
        TransactionTemplate transactionTemplate,
        MediaStorageService media,
        UserChefKitchenPhotoClient client,
        DiscoveryCacheService discoveryCacheService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = transactionTemplate;
        this.media = media;
        this.client = client;
        this.discoveryCacheService = discoveryCacheService;
    }

    public record Backfill(int checked, int imported, int failed) {
    }

    /** Returns true when the kitchen's photos changed. Throws when user-chef or storage fails (kitchen stays un-imported). */
    public boolean importKitchen(UUID kitchenId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT identity_id, kitchen_photos_imported_at FROM catalog_schema.kitchen_profile WHERE id = ?", kitchenId
        );
        if (rows.isEmpty() || rows.getFirst().get("kitchen_photos_imported_at") != null) return false;
        UUID identityId = (UUID) rows.getFirst().get("identity_id");
        Optional<Photo> first = client.fetch(identityId, 1);
        Optional<Photo> second = client.fetch(identityId, 2);

        List<StoredMedia> stored = new ArrayList<>();
        try {
            String url1 = first.map(photo -> store(kitchenId, 1, photo, stored)).orElse(null);
            String url2 = second.map(photo -> store(kitchenId, 2, photo, stored)).orElse(null);
            List<String> replaced = transactionTemplate.execute(status -> write(kitchenId, url1, url2));
            if (replaced == null) { // imported by someone else meanwhile
                stored.forEach(blob -> media.deleteQuietly(blob.blobName()));
                return false;
            }
            replaced.forEach(media::deleteByPublicUrl);
            boolean changed = url1 != null || url2 != null;
            if (changed) discoveryCacheService.invalidateAllDiscovery();
            return changed;
        } catch (RuntimeException ex) {
            stored.forEach(blob -> media.deleteQuietly(blob.blobName()));
            throw ex;
        }
    }

    /** Sets the fetched slots (registration wins), marks the kitchen imported and returns the replaced URLs. */
    private List<String> write(UUID kitchenId, String url1, String url2) {
        Map<String, Object> current = jdbcTemplate.queryForMap(
            "SELECT kitchen_photo_url, kitchen_photo_2_url, kitchen_photos_imported_at FROM catalog_schema.kitchen_profile WHERE id = ? FOR UPDATE",
            kitchenId
        );
        if (current.get("kitchen_photos_imported_at") != null) return null;
        jdbcTemplate.update(
            "UPDATE catalog_schema.kitchen_profile SET kitchen_photo_url = COALESCE(?, kitchen_photo_url), "
                + "kitchen_photo_2_url = COALESCE(?, kitchen_photo_2_url), kitchen_photos_imported_at = now(), updated_at = now() WHERE id = ?",
            url1, url2, kitchenId
        );
        List<String> replaced = new ArrayList<>();
        if (url1 != null && current.get("kitchen_photo_url") != null) replaced.add((String) current.get("kitchen_photo_url"));
        if (url2 != null && current.get("kitchen_photo_2_url") != null) replaced.add((String) current.get("kitchen_photo_2_url"));
        return replaced.stream().filter(Objects::nonNull).toList();
    }

    private String store(UUID kitchenId, int slot, Photo photo, List<StoredMedia> stored) {
        String extension = "image/png".equals(photo.contentType()) ? ".png" : ".jpg";
        StoredMedia saved = media.storeKitchenImage(kitchenId, "registration-" + slot + extension, photo.data(), photo.contentType());
        stored.add(saved);
        return saved.publicUrl();
    }

    /** After a kitchen is saved; does nothing when it was already imported. Never blocks or fails the save. */
    public void importInBackground(UUID kitchenId) {
        if (kitchenId == null || !client.configured()) return;
        background.submit(() -> {
            try {
                importKitchen(kitchenId);
            } catch (RuntimeException ex) {
                log.warn("Kitchen photo import failed, retried at next start: {}", ex.getClass().getSimpleName());
            }
        });
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!client.configured() || !media.configured()) {
            log.info("Kitchen photo import is off: user-chef internal URL/secret or media storage is not configured");
            return;
        }
        background.submit(this::backfill);
    }

    /** Imports every kitchen not imported yet, oldest first, at most 500 per start. */
    public Backfill backfill() {
        List<UUID> kitchenIds = jdbcTemplate.queryForList(
            "SELECT id FROM catalog_schema.kitchen_profile WHERE kitchen_photos_imported_at IS NULL ORDER BY created_at LIMIT " + BACKFILL_LIMIT,
            UUID.class
        );
        int imported = 0;
        int failed = 0;
        for (UUID kitchenId : kitchenIds) {
            try {
                if (importKitchen(kitchenId)) imported++;
            } catch (RuntimeException ex) {
                failed++;
            }
        }
        log.info("kitchen photo backfill imported {} of {} ({} failed, retried at next start)", imported, kitchenIds.size(), failed);
        return new Backfill(kitchenIds.size(), imported, failed);
    }
}
