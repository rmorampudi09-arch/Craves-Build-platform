package in.craves.catalog.service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Account deletion for catalog-service. Only the chef side holds anything: the kitchen (contact, address, name,
 * photos), its pickup locations and its menu. A customer has no catalog row, so CUSTOMER changes nothing.
 * Rows stay (orders and payouts point at them) but lose every personal value; menu items are archived and their photos go.
 */
@Service
public class AccountErasureService {
    /** ALL is CUSTOMER and CHEF together. */
    public enum Scope { CUSTOMER, CHEF, ALL }

    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    // Placeholders that satisfy the NOT NULL columns; the same values on the kitchen and on every pickup version.
    static final String DELETED_KITCHEN_NAME = "Deleted kitchen";
    static final String DELETED = "Deleted";
    static final String OUTBOX_STOPPED_REASON = "ACCOUNT_DELETION";
    private static final String MY_KITCHENS = "(SELECT id FROM catalog_schema.kitchen_profile WHERE identity_id = ?)";

    private final JdbcTemplate jdbc;
    private final MediaStorageService media;
    private final KitchenScheduleService schedule;
    private final DiscoveryCacheService discoveryCache;
    private final TransactionTemplate transactions;

    public AccountErasureService(JdbcTemplate jdbc, MediaStorageService media, KitchenScheduleService schedule,
                                 DiscoveryCacheService discoveryCache, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.media = media;
        this.schedule = schedule;
        this.discoveryCache = discoveryCache;
        this.transactions = transactions;
    }

    /** Stops new orders to the person's kitchens, so nothing new arrives while the deletion waits. */
    public Map<String, Integer> prepare(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CUSTOMER) {
            int closed = schedule.closeForAccountDeletion(identityId);
            if (closed > 0) {
                counts.put("kitchen_schedule_config", closed);
                discoveryCache.invalidateAllDiscovery();
            }
        }
        return counts;
    }

    /**
     * Photos are deleted first and outside the transaction: a blob cannot be rolled back, and the rows must keep
     * naming a photo until it is really gone. A storage failure therefore fails the whole call with the database
     * untouched, and the retry deletes what is left (a blob that is already gone is not an error).
     */
    public Map<String, Integer> erase(UUID identityId, Scope scope, UUID requestId) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CUSTOMER) {
            int blobs = deleteBlobs(identityId);
            transactions.executeWithoutResult(status -> eraseRows(identityId, counts));
            counts.put("media_blob", blobs);
            if (counts.values().stream().anyMatch(rows -> rows > 0)) discoveryCache.invalidateAllDiscovery();
        }
        LOGGER.info("Account erasure service=catalog requestId={} scope={} counts={}", requestId, scope, counts);
        return counts;
    }

    private int deleteBlobs(UUID identityId) {
        Set<String> names = new LinkedHashSet<>();
        jdbc.query("SELECT chef_photo_url, kitchen_photo_url, kitchen_photo_2_url FROM catalog_schema.kitchen_profile WHERE identity_id = ?",
            rs -> {
                for (int column = 1; column <= 3; column++) names.add(media.ownedBlobName(rs.getString(column)));
            }, identityId);
        jdbc.query("""
            SELECT i.blob_container, i.blob_name, i.public_url FROM catalog_schema.menu_item_image i
              JOIN catalog_schema.menu_item m ON m.id = i.menu_item_id
             WHERE m.kitchen_id IN %s
            """.formatted(MY_KITCHENS),
            rs -> {
                names.add(media.ownedBlobName(rs.getString(3)));
                names.add(media.ownedBlobName(rs.getString(1), rs.getString(2)));
            }, identityId);
        names.remove(null); // URLs of another host and the shared avatar faces: only cleared below, never deleted
        int removed = 0;
        for (String name : names) {
            if (media.delete(name)) removed++;
        }
        return removed;
    }

    private void eraseRows(UUID identityId, Map<String, Integer> counts) {
        // One statement that also closes the kitchen: the pickup trigger then adds its new version already anonymised
        // and, because the kitchen is no longer ACTIVE, never queues it for the delivery provider. Rows already erased are skipped.
        counts.put("kitchen_profile", jdbc.update("""
            UPDATE catalog_schema.kitchen_profile
               SET kitchen_name = ?, display_name = NULL, description = NULL, phone_number = NULL, email = NULL,
                   address_line1 = ?, address_line2 = NULL, landmark = NULL, area_name = NULL, city = ?, state = ?,
                   postal_code = NULL, latitude = NULL, longitude = NULL, social_links = '{}'::jsonb, service_areas = '[]'::jsonb,
                   chef_photo_url = NULL, kitchen_photo_url = NULL, kitchen_photo_2_url = NULL, status = 'INACTIVE', updated_at = now()
             WHERE identity_id = ?
               AND (kitchen_name, display_name, description, phone_number, email, address_line1, address_line2, landmark, area_name, city, state,
                    postal_code, latitude, longitude, social_links, service_areas, chef_photo_url, kitchen_photo_url, kitchen_photo_2_url, status)
                   IS DISTINCT FROM (?, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, '{}'::jsonb, '[]'::jsonb, NULL, NULL, NULL, 'INACTIVE')
            """, DELETED_KITCHEN_NAME, DELETED, DELETED, DELETED, identityId, DELETED_KITCHEN_NAME, DELETED, DELETED, DELETED));
        // Every version, retired ones included (they keep the real old address); ids stay because orders and the provider refer to them.
        counts.put("kitchen_pickup_location", jdbc.update("""
            UPDATE catalog_schema.kitchen_pickup_location
               SET kitchen_name = ?, contact_phone = NULL, contact_email = NULL, address_line1 = ?, address_line2 = NULL, landmark = NULL,
                   area_name = NULL, city = ?, state = ?, postal_code = NULL, latitude = NULL, longitude = NULL, updated_at = now()
             WHERE kitchen_id IN %s
               AND (kitchen_name, contact_phone, contact_email, address_line1, address_line2, landmark, area_name, city, state, postal_code, latitude, longitude)
                   IS DISTINCT FROM (?, NULL, NULL, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL)
            """.formatted(MY_KITCHENS), DELETED_KITCHEN_NAME, DELETED, DELETED, DELETED, identityId, DELETED_KITCHEN_NAME, DELETED, DELETED, DELETED));
        // Not yet sent to the provider: never send now. DELIVERED rows are only a record and stay.
        counts.put("pickup_location_provisioning_outbox", jdbc.update("""
            UPDATE catalog_schema.pickup_location_provisioning_outbox
               SET status = 'DEAD_LETTER', lock_token = NULL, locked_at = NULL, last_error = ?, updated_at = now()
             WHERE status IN ('PENDING', 'PROCESSING', 'FAILED') AND kitchen_id IN %s
            """.formatted(MY_KITCHENS),
            OUTBOX_STOPPED_REASON, identityId));
        counts.put("menu_item", jdbc.update("""
            UPDATE catalog_schema.menu_item SET status = 'ARCHIVED', is_available = false, updated_at = now()
             WHERE (status <> 'ARCHIVED' OR is_available) AND kitchen_id IN %s
            """.formatted(MY_KITCHENS), identityId));
        counts.put("menu_item_image", jdbc.update("""
            DELETE FROM catalog_schema.menu_item_image
             WHERE menu_item_id IN (SELECT id FROM catalog_schema.menu_item WHERE kitchen_id IN %s)
            """.formatted(MY_KITCHENS), identityId));
    }
}
