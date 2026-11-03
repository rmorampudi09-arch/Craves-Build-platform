package in.craves.catalog.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.CatalogStorageProperties;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.service.AccountErasureService.Scope;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real Flyway schema (trigger, outbox, NOT NULLs), real SQL; only the blob container is a mock, so nothing here
 * can touch Azure storage. Destructive fixtures only in the disposable CI database, like ChefCatalogDatabaseTest.
 */
@EnabledIfEnvironmentVariable(named = "CRAVES_CATALOG_DISPOSABLE_DATABASE", matches = "true")
class AccountErasureDatabaseTest {
    static final String BASE = "https://media.example";
    static final String PICKUP = "catalog_schema.kitchen_pickup_location";
    static final String OUTBOX = "catalog_schema.pickup_location_provisioning_outbox";
    // "no personal column holds anything": the shape every erased pickup version must have
    static final String PICKUP_NOT_ANONYMISED = "NOT (kitchen_name = 'Deleted kitchen' AND contact_phone IS NULL AND contact_email IS NULL"
        + " AND address_line1 = 'Deleted' AND address_line2 IS NULL AND landmark IS NULL AND area_name IS NULL"
        + " AND city = 'Deleted' AND state = 'Deleted' AND postal_code IS NULL AND latitude IS NULL AND longitude IS NULL)";

    JdbcTemplate jdbc;
    AccountErasureService erasure;
    TransactionTemplate transactions;
    KitchenScheduleService schedule;
    DiscoveryCacheService cache;
    MediaStorageService media;
    final Set<String> deleted = new TreeSet<>();
    final Set<String> failing = new HashSet<>();

    final UUID chef = UUID.randomUUID(), kitchen = UUID.randomUUID(), request = UUID.randomUUID();
    final UUID dishA = UUID.randomUUID(), dishB = UUID.randomUUID(), dishOld = UUID.randomUUID();
    final UUID otherChef = UUID.randomUUID(), otherKitchen = UUID.randomUUID(), otherDish = UUID.randomUUID();

    @BeforeEach void setup() {
        assertEquals("true", System.getenv("GITHUB_ACTIONS"), "Disposable CI only; never a local production tunnel");
        String url = System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test", url);
        var ds = new DriverManagerDataSource(url, "postgres", System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load().migrate();

        var properties = new CatalogStorageProperties();
        properties.setPublicMediaBaseUrl(BASE);
        properties.setMediaContainer("media");
        media = spy(new MediaStorageService(properties));
        var container = mock(BlobContainerClient.class);
        when(container.getBlobClient(anyString())).thenAnswer(call -> {
            String name = call.getArgument(0);
            var blob = mock(BlobClient.class);
            when(blob.deleteIfExists()).thenAnswer(x -> {
                if (failing.contains(name)) throw new IllegalStateException("storage down");
                return deleted.add(name);
            });
            return blob;
        });
        doReturn(container).when(media).buildContainerClient();

        var finance = mock(CatalogFinanceEligibility.class);
        when(finance.current()).thenReturn(new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(), Instant.now(), true, UUID.randomUUID(), 1,
            UUID.randomUUID().toString().replace("-", "").repeat(2), List.of(chef, otherChef)));
        schedule = new KitchenScheduleService(jdbc, new ObjectMapper().findAndRegisterModules(), finance);
        cache = mock(DiscoveryCacheService.class);
        transactions = new TransactionTemplate(new DataSourceTransactionManager(ds));
        erasure = new AccountErasureService(jdbc, media, schedule, cache, transactions);

        seedKitchen(kitchen, chef, "main");
        for (String address : List.of("Second address", "Third address", "Fourth address")) {
            jdbc.update("UPDATE catalog_schema.kitchen_profile SET address_line1 = ? WHERE id = ?", address, kitchen);
        }
        // four pickup versions: the provider has the first, the rest are still to be sent
        outbox(1, "DELIVERED");
        outbox(2, "FAILED");
        outbox(3, "PROCESSING");
        jdbc.update("UPDATE " + OUTBOX + " SET last_error = 'provider said 12 Test Street' WHERE status = 'FAILED'");
        seedDish(kitchen, dishA, "ACTIVE", true);
        seedImage(dishA, "public/dishes/main/a1.png", true);
        seedImage(dishA, "public/dishes/main/a2.png", false);
        seedDish(kitchen, dishB, "ACTIVE", true);
        seedImage(dishB, "public/dishes/main/b1.png", true);
        // photo from the previous storage account: not ours to delete, but the row still goes
        jdbc.update("INSERT INTO catalog_schema.menu_item_image(id,menu_item_id,blob_container,blob_name,content_type,file_size_bytes,public_url,sort_order,is_primary)"
            + " VALUES (?,?,'old-account','public/dishes/main/legacy.png','image/png',1,'https://old.blob.core.windows.net/media/public/dishes/main/legacy.png',5,false)", UUID.randomUUID(), dishB);
        seedDish(kitchen, dishOld, "ARCHIVED", false);
        seedImage(dishOld, "public/dishes/main/old.png", true);

        seedKitchen(otherKitchen, otherChef, "other");
        seedDish(otherKitchen, otherDish, "ACTIVE", true);
        seedImage(otherDish, "public/dishes/other/o1.png", true);
    }

    // ---- fixtures ----

    void seedKitchen(UUID id, UUID identity, String tag) {
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id,kitchen_name,display_name,description,phone_number,email,address_line1,address_line2,landmark,area_name,city,state,postal_code,"
                + "latitude,longitude,status,chef_photo_url,kitchen_photo_url,kitchen_photo_2_url,social_links,service_areas) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,'{\"instagram\":\"https://instagram.com/lakshmi\"}'::jsonb,'[\"Gachibowli\"]'::jsonb)",
            id, identity, "Lakshmi " + tag + " kitchen", "Lakshmi's " + tag, "Home food by Lakshmi", "+919999900001", tag + "@lakshmi.example", "12 Test Street", "Flat 4", "Near the temple",
            "Gachibowli", "Hyderabad", "Telangana", "500032", new java.math.BigDecimal("17.4400000"), new java.math.BigDecimal("78.3900000"),
            BASE + "/public/kitchens/" + id + "/chef/" + tag + "-me.png", BASE + "/public/kitchens/" + id + "/kitchen/" + tag + "-a.png", BASE + "/public/kitchens/" + id + "/kitchen/" + tag + "-b.png");
    }

    void seedDish(UUID kitchenId, UUID dish, String status, boolean available) {
        jdbc.update("INSERT INTO catalog_schema.menu_item(id,kitchen_id,item_name,category,food_type,price,is_available,status,unit_package_weight_grams,thermobox_required) VALUES (?,?,'Fixture meal','Lunch','VEG',100,?,?,500,false)",
            dish, kitchenId, available, status);
        jdbc.update("UPDATE catalog_schema.menu_item SET description = 'Grandma Lakshmi recipe, pick up at 12 Test Street' WHERE id = ?", dish);
    }

    void seedImage(UUID dish, String blobName, boolean primary) {
        jdbc.update("INSERT INTO catalog_schema.menu_item_image(id,menu_item_id,blob_container,blob_name,content_type,file_size_bytes,public_url,sort_order,is_primary) VALUES (?,?,'media',?,'image/png',1,?,?,?)",
            UUID.randomUUID(), dish, blobName, BASE + "/" + blobName, primary ? 0 : 1, primary);
    }

    void outbox(int version, String status) {
        String lock = status.equals("PROCESSING") ? ", lock_token = gen_random_uuid(), locked_at = now()" : "";
        jdbc.update("UPDATE " + OUTBOX + " SET status = ?" + lock + " WHERE pickup_location_id = (SELECT id FROM " + PICKUP + " WHERE kitchen_id = ? AND version_number = ?)", status, kitchen, version);
    }

    /** Every row of the table text, so any change at all (value, updated_at, a new row) shows. */
    String dump(String from) {
        return jdbc.queryForObject("SELECT coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '') FROM " + from + " t", String.class);
    }

    String everything() {
        return String.join("\n#\n", dump("catalog_schema.kitchen_profile"), dump(PICKUP), dump(OUTBOX), dump("catalog_schema.menu_item"),
            dump("catalog_schema.menu_item_image"), dump("catalog_schema.kitchen_schedule_config"), dump("catalog_schema.kitchen_schedule_audit"));
    }

    String otherChefRows() {
        return String.join("\n#\n", dump("(SELECT * FROM catalog_schema.kitchen_profile WHERE id = '" + otherKitchen + "')"),
            dump("(SELECT * FROM " + PICKUP + " WHERE kitchen_id = '" + otherKitchen + "')"),
            dump("(SELECT * FROM " + OUTBOX + " WHERE kitchen_id = '" + otherKitchen + "')"),
            dump("(SELECT * FROM catalog_schema.menu_item WHERE kitchen_id = '" + otherKitchen + "')"),
            dump("(SELECT * FROM catalog_schema.menu_item_image WHERE menu_item_id = '" + otherDish + "')"));
    }

    int count(String sql, Object... args) {
        return jdbc.queryForObject("SELECT count(*) FROM " + sql, Integer.class, args);
    }

    Set<String> mainKitchenBlobs() {
        return new TreeSet<>(Set.of(
            "public/kitchens/" + kitchen + "/chef/main-me.png", "public/kitchens/" + kitchen + "/kitchen/main-a.png", "public/kitchens/" + kitchen + "/kitchen/main-b.png",
            "public/dishes/main/a1.png", "public/dishes/main/a2.png", "public/dishes/main/b1.png", "public/dishes/main/old.png"));
    }

    // ---- prepare ----

    @Test void prepareClosesTheKitchenToNewOrders() {
        assertTrue(schedule.availability(kitchen, Instant.now()).availableNow());

        assertEquals(Map.of("kitchen_schedule_config", 1), erasure.prepare(chef, Scope.CHEF, request));

        assertFalse(schedule.availability(kitchen, Instant.now()).availableNow());
        var row = jdbc.queryForMap("SELECT accepting_orders, paused_until, pause_reason FROM catalog_schema.kitchen_schedule_config WHERE kitchen_id = ?", kitchen);
        assertEquals(false, row.get("accepting_orders"));
        assertNull(row.get("paused_until"));
        assertEquals("ACCOUNT_DELETION", row.get("pause_reason"));
        verify(cache).invalidateAllDiscovery();
        // a retry changes nothing
        assertEquals(Map.of(), erasure.prepare(chef, Scope.ALL, request));
        assertEquals(1, count("catalog_schema.kitchen_schedule_config WHERE kitchen_id = ?", kitchen));
    }

    @Test void prepareReplacesAnEarlierPauseAndLeavesOtherKitchensAlone() {
        jdbc.update("INSERT INTO catalog_schema.kitchen_schedule_config(kitchen_id, accepting_orders, paused_until, pause_reason) VALUES (?, true, now() + interval '2 days', 'Festival')", kitchen);
        String other = otherChefRows();

        erasure.prepare(chef, Scope.ALL, request);

        var row = jdbc.queryForMap("SELECT accepting_orders, paused_until, pause_reason FROM catalog_schema.kitchen_schedule_config WHERE kitchen_id = ?", kitchen);
        assertEquals(false, row.get("accepting_orders"));
        assertNull(row.get("paused_until"));
        assertEquals("ACCOUNT_DELETION", row.get("pause_reason"));
        assertEquals(0, count("catalog_schema.kitchen_schedule_config WHERE kitchen_id = ?", otherKitchen));
        assertEquals(other, otherChefRows());
    }

    @Test void prepareWithNoKitchenIsDoneWithEmptyCounts() {
        String before = everything();
        assertEquals(Map.of(), erasure.prepare(UUID.randomUUID(), Scope.CHEF, request));
        assertEquals(before, everything());
        verify(cache, never()).invalidateAllDiscovery();
    }

    // ---- erase ----

    @Test void eraseChefAnonymisesKitchenArchivesMenuAndDeletesPhotos() {
        String other = otherChefRows();
        Set<String> pickupIds = new HashSet<>(jdbc.queryForList("SELECT id::text FROM " + PICKUP + " WHERE kitchen_id = ?", String.class, kitchen));
        assertEquals(4, pickupIds.size());

        Map<String, Integer> counts = erasure.erase(chef, Scope.CHEF, request);

        assertEquals(Map.of("kitchen_profile", 1, "kitchen_pickup_location", 4, "pickup_location_provisioning_outbox", 3,
            "menu_item", 3, "menu_item_image", 5, "media_blob", 7), counts);
        // kitchen: every personal column replaced, closed, still the same row of the same person
        var k = jdbc.queryForMap("SELECT * FROM catalog_schema.kitchen_profile WHERE id = ?", kitchen);
        assertEquals(chef, k.get("identity_id"));
        assertEquals("Deleted kitchen", k.get("kitchen_name"));
        assertEquals("Deleted", k.get("address_line1"));
        assertEquals("Deleted", k.get("city"));
        assertEquals("Deleted", k.get("state"));
        assertEquals("INACTIVE", k.get("status"));
        for (String column : List.of("display_name", "description", "phone_number", "email", "address_line2", "landmark", "area_name", "postal_code",
            "latitude", "longitude", "chef_photo_url", "kitchen_photo_url", "kitchen_photo_2_url")) {
            assertNull(k.get(column), column);
        }
        assertEquals("{}", k.get("social_links").toString());
        assertEquals("[]", k.get("service_areas").toString());
        // photos: every stored blob deleted, none of the other chef's
        assertEquals(mainKitchenBlobs(), deleted);
        // pickup versions: none removed (orders point at them), all anonymised, one active
        assertTrue(jdbc.queryForList("SELECT id::text FROM " + PICKUP + " WHERE kitchen_id = ?", String.class, kitchen).containsAll(pickupIds));
        assertEquals(0, count(PICKUP + " WHERE kitchen_id = ? AND " + PICKUP_NOT_ANONYMISED, kitchen));
        assertEquals(1, count(PICKUP + " WHERE kitchen_id = ? AND status = 'ACTIVE'", kitchen));
        // unsent provisioning stopped; what the provider already has stays a record
        assertEquals(List.of("DELIVERED", "DEAD_LETTER", "DEAD_LETTER", "DEAD_LETTER"),
            jdbc.queryForList("SELECT o.status FROM " + OUTBOX + " o JOIN " + PICKUP + " p ON p.id = o.pickup_location_id WHERE o.kitchen_id = ? ORDER BY p.version_number", String.class, kitchen));
        assertEquals(0, count(OUTBOX + " WHERE kitchen_id = ? AND (lock_token IS NOT NULL OR last_error LIKE '%Test Street%')", kitchen));
        // menu
        assertEquals(0, count("catalog_schema.menu_item WHERE kitchen_id = ? AND (status <> 'ARCHIVED' OR is_available)", kitchen));
        assertEquals(3, count("catalog_schema.menu_item WHERE kitchen_id = ?", kitchen));
        // the dish text a person wrote goes too (the archived dish included); the name stays
        assertEquals(0, count("catalog_schema.menu_item WHERE kitchen_id = ? AND description IS NOT NULL", kitchen));
        assertEquals(3, count("catalog_schema.menu_item WHERE kitchen_id = ? AND item_name = 'Fixture meal'", kitchen));
        // marked imported, so the registration photos can never be copied back onto the erased kitchen
        assertEquals(1, count("catalog_schema.kitchen_profile WHERE id = ? AND kitchen_photos_imported_at IS NOT NULL", kitchen));
        assertEquals(0, count("catalog_schema.menu_item_image WHERE menu_item_id IN (?, ?, ?)", dishA, dishB, dishOld));
        // nobody else
        assertEquals(other, otherChefRows());
        verify(cache).invalidateAllDiscovery();
    }

    @Test void erasingTheAddressNeverQueuesAPickupForTheProvider() {
        int outboxBefore = count(OUTBOX + " WHERE kitchen_id = ?", kitchen);

        erasure.erase(chef, Scope.ALL, request);

        assertEquals(0, count(OUTBOX + " WHERE kitchen_id = ? AND status IN ('PENDING', 'PROCESSING', 'FAILED')", kitchen));
        assertEquals(outboxBefore, count(OUTBOX + " WHERE kitchen_id = ?", kitchen)); // the trigger's new pickup version was not enqueued
        assertEquals(5, count(PICKUP + " WHERE kitchen_id = ?", kitchen)); // ...though it exists
        assertEquals(0, count(PICKUP + " WHERE kitchen_id = ? AND " + PICKUP_NOT_ANONYMISED, kitchen));
    }

    @Test void customerScopeChangesNoCatalogRow() {
        String before = everything();

        assertEquals(Map.of(), erasure.prepare(chef, Scope.CUSTOMER, request));
        assertEquals(Map.of(), erasure.erase(chef, Scope.CUSTOMER, request));

        assertEquals(before, everything());
        assertEquals(Set.of(), deleted);
        verify(cache, never()).invalidateAllDiscovery();
    }

    @Test void eraseTwiceIsDoneWithZeroCounts() {
        erasure.erase(chef, Scope.CHEF, request);
        String afterFirst = everything();
        Set<String> blobsAfterFirst = new TreeSet<>(deleted);

        Map<String, Integer> second = erasure.erase(chef, Scope.CHEF, request);

        assertEquals(Map.of("kitchen_profile", 0, "kitchen_pickup_location", 0, "pickup_location_provisioning_outbox", 0,
            "menu_item", 0, "menu_item_image", 0, "media_blob", 0), second);
        assertEquals(afterFirst, everything());
        assertEquals(blobsAfterFirst, deleted);
    }

    @Test void sharedAvatarFaceIsNeverDeleted() {
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET chef_photo_url = ? WHERE id = ?", media.chefAvatarUrl("chef-avatar-01"), kitchen);

        Map<String, Integer> counts = erasure.erase(chef, Scope.CHEF, request);

        assertEquals(6, counts.get("media_blob"));
        assertTrue(deleted.stream().noneMatch(blob -> blob.contains("chef-avatars")));
        assertNull(jdbc.queryForObject("SELECT chef_photo_url FROM catalog_schema.kitchen_profile WHERE id = ?", String.class, kitchen));
    }

    @Test void photosOutsideTheCatalogMediaStoreAreOnlyCleared() {
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET kitchen_photo_url = 'https://elsewhere.example/public/kitchens/x/kitchen/a.png', kitchen_photos_imported_at = '2026-01-01T00:00:00Z' WHERE id = ?", kitchen);

        Map<String, Integer> counts = erasure.erase(chef, Scope.CHEF, request);

        assertEquals(6, counts.get("media_blob")); // the foreign kitchen photo is not ours (the previous account's dish photo was never counted)
        assertTrue(deleted.stream().noneMatch(blob -> blob.contains("elsewhere") || blob.contains("legacy")));
        assertNull(jdbc.queryForObject("SELECT kitchen_photo_url FROM catalog_schema.kitchen_profile WHERE id = ?", String.class, kitchen));
        assertEquals(0, count("catalog_schema.menu_item_image WHERE menu_item_id = ?", dishB));
        assertEquals(1, count("catalog_schema.kitchen_profile WHERE id = ? AND kitchen_photos_imported_at = '2026-01-01T00:00:00Z'", kitchen)); // an earlier import time is kept
    }

    @Test void aBlobDeleteFailureFailsTheEraseChangesNothingAndTheRetryFinishesIt() {
        String before = everything();
        failing.add("public/dishes/main/b1.png");

        assertThrows(IllegalStateException.class, () -> erasure.erase(chef, Scope.CHEF, request));

        assertEquals(before, everything()); // names are never lost: the rows still point at every photo
        verify(cache, never()).invalidateAllDiscovery();

        failing.clear();
        erasure.erase(chef, Scope.CHEF, request);

        assertEquals(mainKitchenBlobs(), deleted);
        assertEquals(0, count("catalog_schema.menu_item_image WHERE menu_item_id = ?", dishB));
    }

    @Test void anErasedKitchenIsNeverImportedAgain() {
        // the kitchen was never imported (kitchen_photos_imported_at NULL), the case the start-up backfill picks up
        assertEquals(1, count("catalog_schema.kitchen_profile WHERE id = ? AND kitchen_photos_imported_at IS NULL", kitchen));
        erasure.erase(chef, Scope.CHEF, request);
        var client = mock(UserChefKitchenPhotoClient.class);
        var importer = new KitchenPhotoImporter(jdbc, transactions, mock(MediaStorageService.class), client, mock(DiscoveryCacheService.class));

        assertFalse(importer.importKitchen(kitchen));
        importer.backfill();

        verify(client, never()).fetch(eq(chef), anyInt());
        assertNull(jdbc.queryForObject("SELECT kitchen_photo_url FROM catalog_schema.kitchen_profile WHERE id = ?", String.class, kitchen));
        assertNull(jdbc.queryForObject("SELECT kitchen_photo_2_url FROM catalog_schema.kitchen_profile WHERE id = ?", String.class, kitchen));
    }

    @Test void everyKitchenRowOfThePersonIsErased() {
        // kitchen_profile.identity_id is UNIQUE today; the erase must not depend on it
        jdbc.execute("ALTER TABLE catalog_schema.kitchen_profile DROP CONSTRAINT kitchen_profile_identity_id_key");
        UUID second = UUID.randomUUID(), secondDish = UUID.randomUUID();
        seedKitchen(second, chef, "twin");
        seedDish(second, secondDish, "ACTIVE", true);
        seedImage(secondDish, "public/dishes/twin/t1.png", true);

        Map<String, Integer> counts = erasure.erase(chef, Scope.ALL, request);

        assertEquals(2, counts.get("kitchen_profile"));
        assertEquals(4, counts.get("menu_item"));
        assertEquals(0, count("catalog_schema.kitchen_profile WHERE identity_id = ? AND (status <> 'INACTIVE' OR phone_number IS NOT NULL)", chef));
        assertEquals(0, count(PICKUP + " WHERE kitchen_id = ? AND " + PICKUP_NOT_ANONYMISED, second));
        assertTrue(deleted.contains("public/dishes/twin/t1.png"));
        assertEquals(0, count("catalog_schema.menu_item WHERE kitchen_id = ? AND status <> 'ARCHIVED'", second));
    }
}
